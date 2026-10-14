import { log } from "./utils.js";

// The telemetry pieces a run needs before posthog-node is loaded. telem.ts
// holds the PostHog client; the runner imports it on first send so the
// ~95-module client stays off the CLI startup path.

export const POSTHOG_HOST = "https://app.posthog.com";

let warmup: AbortController | undefined;
let warmupSettled: Promise<void> = Promise.resolve();

// Open the connection to PostHog while the run is still working, so the
// end-of-run flush reuses it and costs one round trip instead of DNS + TCP +
// TLS + request (ADR 01132). OPTIONS rather than HEAD: PostHog answers HEAD
// with `Connection: close`, which would throw the warm socket away. Sends no
// event. Caveat: Node's fetch drops an idle socket after 4 s, so a run that
// outlasts that pays the cold handshake as before; a custom dispatcher with a
// longer keep-alive would lift that limit.
export function prewarmTelemetry(config: any) {
  if (config?.telemetry?.send === false) return;
  // One warm-up at a time: a back-to-back or concurrent runTests call cancels
  // the previous one, so no send can wait behind an orphaned request.
  warmup?.abort();
  warmup = new AbortController();
  warmupSettled = fetch(POSTHOG_HOST, {
    method: "OPTIONS",
    redirect: "manual",
    signal: warmup.signal,
  })
    .then((res) => res.arrayBuffer())
    // undici hands the socket back to its pool a turn after the body ends; a
    // request sent before that opens a new connection.
    .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
    .catch(() => undefined);
}

// The PostHog client's fetch. A send that starts while the warm-up is still in
// flight would open a second connection (one request per socket) and pay the
// full handshake anyway, so it waits for the warm-up to settle and then reuses
// its socket. Never waits on a failed warm-up; the flush's own timeout bounds
// the total.
export async function telemetryFetch(url: string, init?: any): Promise<any> {
  await warmupSettled;
  return fetch(url, init);
}

// Cancel a warm-up that's still in flight so it can't hold the process open
// after a run that ended without sending anything. A later send goes out
// immediately rather than waiting on the cancelled request.
export function abortTelemetryWarmup() {
  warmup?.abort();
  warmup = undefined;
  warmupSettled = Promise.resolve();
}

// The notice text is documented verbatim in docs/fern/pages/legal/telemetry.mdx
// (/legal/telemetry); keep the two in sync. It isn't linked from the message
// itself, since that would change the CLI's printed output.
export function telemetryNotice(config: any) {
  if (config?.telemetry?.send === false) {
    log(
      config,
      "info",
      "Telemetry is disabled. Basic anonymous telemetry helps Doc Detective understand product issues and usage. To enable telemetry, set 'telemetry.send' to 'true' in your .doc-detective.json config file."
    );
  } else {
    log(
      config,
      "info",
      "Doc Detective collects basic anonymous telemetry to understand product issues and usage. To disable telemetry, set 'telemetry.send' to 'false' in your .doc-detective.json config file."
    );
  }
}

// telem.js carries posthog-node (~95 modules), so the runner loads it when a run
// starts (in the background) rather than at CLI startup. A run with
// telemetry.send === false never loads it. Resolves to null when telem.js can't
// load: telemetry must never fail a run.
let telemModule: Promise<typeof import("./telem.js") | null> | undefined;
const defaultTelemetryLoader = () => import("./telem.js");
let telemetryLoader: () => Promise<typeof import("./telem.js")> = defaultTelemetryLoader;

// Test seam (internal module, not part of the package API): swap how telem.js
// loads, e.g. to simulate a failed load, and drop any already-loaded module. No
// argument restores the real loader.
export function setTelemetryLoader(loader?: () => Promise<typeof import("./telem.js")>) {
  telemetryLoader = loader ?? defaultTelemetryLoader;
  telemModule = undefined;
}

export function loadTelemetry() {
  telemModule ??= telemetryLoader().catch(() => null);
  return telemModule;
}

export async function sendRunTelemetry(config: any, command: string, results: any) {
  if (config?.telemetry?.send === false) return;
  (await loadTelemetry())?.sendTelemetry(config, command, results);
}

// Join the flush the last send started (if any), then cancel a warm-up still in
// flight so it can't hold the process open.
export async function flushRunTelemetry(): Promise<void> {
  const telem = telemModule ? await telemModule : null;
  if (telem) await telem.awaitTelemetryFlush();
  abortTelemetryWarmup();
}
