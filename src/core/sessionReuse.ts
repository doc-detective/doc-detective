// Phase 5 — default-on browser session reuse (tiered reset).
//
// This module holds the *pure* / dependency-injected machinery for reusing a
// browser driver session across contexts instead of paying a full
// start+teardown per (test × context). It is deliberately free of any driver,
// Appium, or webdriverio import so every decision here is unit-testable without
// a browser (see test/core-session-reuse.test.js). The runner (src/core/tests.ts)
// owns the side-effecting glue: acquiring the Appium port, building capabilities,
// starting the driver, and calling into the helpers below.
//
// Design (docs/design/run-performance.md, Phase 5; ADR 01066):
//   - Tiering: only the Chromium family (chrome/edge/chromium) reuses, because
//     one CDP call (`Storage.clearDataForOrigin`) provably clears every storage
//     class. Firefox/WebKit(Safari)/native app surfaces keep fresh-per-context.
//   - Escape hatch: `browser.freshSession: true` forces a cold session. It is
//     falsy-when-absent (AJV does not inject the default under context_v3's
//     `anyOf`), so absence must read as "reuse".
//   - Fail-closed: any reset step that throws or times out discards the session
//     and starts fresh — reuse is an accelerator, never a new failure mode.
//   - Pool: keyed by the capability signature (engine/headless/args/proxy),
//     scoped per Appium server port so the ChromeDriver-contention design is
//     untouched. Per-context recording identifiers are stripped from the key.

/** Chromium-family engine names that qualify for session reuse. */
export const CHROMIUM_REUSE_ENGINES: ReadonlySet<string> = new Set([
  "chrome",
  "chromium",
  "edge",
]);

/** Trim + lowercase an engine name for tiering comparisons. */
export function normalizeReuseEngine(name?: string | null): string {
  return String(name ?? "").trim().toLowerCase();
}

/** True only for the Chromium family (the tier that can reset provably). */
export function isReusableEngine(name?: string | null): boolean {
  return CHROMIUM_REUSE_ENGINES.has(normalizeReuseEngine(name));
}

/**
 * Whether a context's browser session should be reused, combining the engine
 * tier with the `freshSession` escape hatch. `freshSession` is read as
 * falsy-when-absent: only an explicit `true` forces a cold session.
 */
export function shouldReuseSession({
  engineName,
  freshSession,
}: {
  engineName?: string | null;
  freshSession?: unknown;
}): boolean {
  if (freshSession === true) return false;
  return isReusableEngine(engineName);
}

/**
 * Whether a context uses recording. Recording contexts never draw from or park
 * into the pool: their per-context getDisplayMedia capture-source title and
 * download directory are baked into launch arguments that a runtime reset can't
 * reconcile, so a reused session would auto-select the wrong window. Detecting
 * this up front (resolved autoRecord, or any `record`/`startRecord` step that
 * isn't the disabling `record: false` form) keeps recording behavior identical
 * to today.
 */
export function contextUsesRecording(context: any, autoRecord?: unknown): boolean {
  if (autoRecord) return true;
  const steps = Array.isArray(context?.steps) ? context.steps : [];
  return steps.some(
    (s: any) =>
      s &&
      typeof s === "object" &&
      (("record" in s && s.record !== false) || "startRecord" in s)
  );
}

/**
 * Deterministic JSON serialization with sorted object keys, so a capability
 * signature hashes identically regardless of property insertion order.
 */
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

// Chrome launch args that carry a per-context identity rather than an isolation
// difference — stripped from the pool key so two otherwise-identical Chromium
// contexts share a session. Recording contexts are excluded from pooling
// entirely (see contextUsesRecording), so dropping the stale capture-source arg
// from a reused NON-recording session is harmless.
const PER_CONTEXT_ARG_PREFIXES = ["--auto-select-desktop-capture-source="];
// Capability keys assigned per attempt / per context that must not affect the
// signature (the chromedriver port is a fresh free port allocated at start).
const PER_ATTEMPT_CAP_KEYS = new Set(["appium:chromedriverPort"]);
// goog:chromeOptions.prefs keys that are per-context (download directory).
const PER_CONTEXT_PREF_KEYS = new Set(["download.default_directory"]);

/** Strip per-context / per-attempt noise from a capabilities object for keying. */
function normalizeCapsForKey(capabilities: any): any {
  if (!capabilities || typeof capabilities !== "object") return capabilities;
  const caps: any = {};
  for (const [k, v] of Object.entries(capabilities)) {
    if (PER_ATTEMPT_CAP_KEYS.has(k)) continue;
    if (k === "goog:chromeOptions" && v && typeof v === "object") {
      const opts: any = { ...(v as any) };
      if (Array.isArray(opts.args)) {
        opts.args = opts.args.filter(
          (a: any) =>
            !PER_CONTEXT_ARG_PREFIXES.some(
              (p) => typeof a === "string" && a.startsWith(p)
            )
        );
      }
      if (opts.prefs && typeof opts.prefs === "object") {
        const prefs: any = {};
        for (const [pk, pv] of Object.entries(opts.prefs)) {
          if (PER_CONTEXT_PREF_KEYS.has(pk)) continue;
          prefs[pk] = pv;
        }
        opts.prefs = prefs;
      }
      caps[k] = opts;
      continue;
    }
    caps[k] = v;
  }
  return caps;
}

/**
 * Derive the reuse pool key from a capabilities object. The key captures the
 * full isolation signature (engine, headless, args, proxy) and excludes
 * resettable/cosmetic state: window size (never encoded in caps — applied
 * post-start), the per-attempt chromedriver port, and per-context recording
 * identifiers. Two contexts share a session only when their keys match exactly.
 */
export function deriveSessionPoolKey(capabilities: any): string {
  return stableStringify(normalizeCapsForKey(capabilities));
}

/** Reject with a labeled timeout if `promise` doesn't settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Session reset step '${label}' timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface SessionPoolEntry {
  key: string;
  driver: any;
}

/**
 * A per-Appium-port parking lot for reusable driver sessions. Keying by port
 * (not just capability signature) keeps a parked session bound to the Appium
 * server that started it — the server lives for the whole run, so the parked
 * session stays valid — and leaves the ChromeDriver-contention/port design
 * (src/core/tests.ts) completely untouched: ports are still acquired and
 * released exactly as before; parking only decides whether the driver on that
 * port is deleted or kept for the next context that lands on the same port.
 *
 * At most one driver is parked per port; run-end teardown drains the lot.
 */
export function createSessionPool() {
  const parked = new Map<number, SessionPoolEntry>();
  return {
    /** Take the driver parked on `port` iff its key matches; else undefined. */
    take(port: number, key: string): any | undefined {
      const entry = parked.get(port);
      if (entry && entry.key === key) {
        parked.delete(port);
        return entry.driver;
      }
      return undefined;
    },
    /** Remove and return whatever driver is parked on `port` (for replacement). */
    evict(port: number): any | undefined {
      const entry = parked.get(port);
      parked.delete(port);
      return entry?.driver;
    },
    /** Park `driver` on `port` under `key`, replacing any prior entry. */
    park(port: number, key: string, driver: any): void {
      parked.set(port, { key, driver });
    },
    /** Remove and return every parked driver (run-end sweep). */
    drain(): any[] {
      const drivers = [...parked.values()].map((e) => e.driver);
      parked.clear();
      return drivers;
    },
    size(): number {
      return parked.size;
    },
  };
}

export type SessionPool = ReturnType<typeof createSessionPool>;

/** A CDP command executor, injected by the runner (fail-closed if unsupported). */
export type CdpExecutor = (method: string, params?: any) => Promise<any>;

/**
 * Reset a Chromium session to a clean state so it can serve the next context.
 * Order matters — WebDriver ends the session when its last window closes, so
 * the fresh window opens FIRST. Every step is bounded by `timeoutMs`; any throw
 * or timeout propagates so the caller can fail closed (discard + fresh).
 *
 *   1. Open a fresh about:blank window and switch to it.
 *   2. Close every other window handle.
 *   3. CDP global clears (this is why Chromium qualifies — one call per class):
 *      Storage.clearDataForOrigin (origin "*", types "all"), plus
 *      Network.clearBrowserCookies +
 *      clearBrowserCache, Browser.resetPermissions,
 *      Emulation.clearDeviceMetricsOverride + clearGeolocationOverride.
 *   4. Reapply the incoming context's viewport, then navigate about:blank.
 */
export async function resetChromiumSession({
  driver,
  cdp,
  reapplyViewport,
  timeoutMs = 5000,
}: {
  driver: any;
  cdp: CdpExecutor;
  reapplyViewport?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const step = <T>(label: string, run: () => Promise<T>): Promise<T> =>
    withTimeout(Promise.resolve().then(run), timeoutMs, label);

  // 1. Fresh window first (opening also switches to it in webdriverio).
  await step("newWindow", () => driver.newWindow("about:blank"));
  const keep: string = await step("getWindowHandle", () => driver.getWindowHandle());

  // 2. Close every other handle, then return focus to the fresh window.
  const handles: string[] = await step("getWindowHandles", () =>
    driver.getWindowHandles()
  );
  for (const handle of handles) {
    if (handle === keep) continue;
    await step("switchToWindow", () => driver.switchToWindow(handle));
    await step("closeWindow", () => driver.closeWindow());
  }
  await step("switchBack", () => driver.switchToWindow(keep));

  // 3. CDP global clears — the reason the Chromium tier can reset provably.
  await step("Storage.clearDataForOrigin", () =>
    cdp("Storage.clearDataForOrigin", { origin: "*", storageTypes: "all" })
  );
  await step("Network.clearBrowserCookies", () => cdp("Network.clearBrowserCookies"));
  await step("Network.clearBrowserCache", () => cdp("Network.clearBrowserCache"));
  await step("Browser.resetPermissions", () => cdp("Browser.resetPermissions"));
  await step("Emulation.clearDeviceMetricsOverride", () =>
    cdp("Emulation.clearDeviceMetricsOverride")
  );
  await step("Emulation.clearGeolocationOverride", () =>
    cdp("Emulation.clearGeolocationOverride")
  );

  // 4. Reapply the incoming context's viewport, then land on about:blank.
  if (reapplyViewport) await step("reapplyViewport", () => reapplyViewport());
  await step("navigate", () => driver.url("about:blank"));
}
