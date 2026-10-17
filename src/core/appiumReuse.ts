import fs from "node:fs";
import path from "node:path";
// axios loads lazily, keeping startup light (test/startup-modules.test.js).
import { loadAxios } from "./utils.js";
import type { ChildProcess } from "node:child_process";

// Opt-in reuse of browser-pool Appium servers across runTests calls in one
// process (ADR 01125). Off by default: a run's servers are its own and die
// with it. With DOC_DETECTIVE_REUSE_APPIUM=true a run hands its idle servers
// back here, and the next run with an identical key takes them instead of
// paying Appium startup again.

export type Server = { port: number; process: ChildProcess | null; display?: string };
type ServerCache = ReturnType<typeof createServerCache>;

function reuseAppiumEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["true", "1"].includes(String(env.DOC_DETECTIVE_REUSE_APPIUM ?? ""));
}

// Node `--import` preload for a reusable server: exit once stdin closes. The
// parent holds that pipe open for the server's whole life and the OS closes it
// when the parent dies, however it dies (SIGKILL included). Without this an
// idle server outlives a killed parent on POSIX. An idle server has no
// sessions, so it owns no driver or browser children to orphan by exiting.
const APPIUM_WATCHDOG_IMPORT =
  "data:text/javascript," +
  encodeURIComponent(
    'process.stdin.on("end",()=>process.exit(0));process.stdin.on("error",()=>process.exit(0));process.stdin.resume();'
  );

// Everything that decides what a spawned server is: how it was launched, the
// environment it inherits (and passes to the browsers it starts, including
// APPIUM_HOME), and the installed Appium and driver versions, so an upgrade
// between runs gets a fresh server rather than one with stale code loaded.
// Runs once per runSpecs pool setup, so the few small sync reads are deliberate.
function appiumServerKey(opts: {
  entry: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  appiumHome: string;
  packages: string[];
}): string {
  const versions = opts.packages.map((pkg) => {
    try {
      return JSON.parse(
        fs.readFileSync(
          path.join(opts.appiumHome, "node_modules", pkg, "package.json"),
          "utf8"
        )
      ).version;
    } catch {
      return null;
    }
  });
  // WDIO_LOG_LEVEL: webdriverio sets it in this process on its first session,
  // which would make every process's second run miss. Appium never reads it.
  const env = Object.keys(opts.env)
    .filter((k) => k !== "WDIO_LOG_LEVEL")
    .sort()
    .map((k) => [k, opts.env[k]]);
  return JSON.stringify([opts.entry, opts.args, env, versions]);
}

// No process handle counts as exited: there's nothing to reuse.
const exited = (s: Server) =>
  !s.process || s.process.exitCode !== null || s.process.signalCode !== null;

// Idle servers must not keep the host process alive; servers in use are held
// by the run's own I/O anyway.
// Piped stdio streams are net.Sockets at runtime, which carry ref/unref.
type Refable = { ref?: () => unknown; unref?: () => unknown } | null | undefined;
function setRef(s: Server, ref: boolean) {
  const p = s.process;
  const handles: Refable[] = [p, p?.stdin, p?.stdout, p?.stderr] as Refable[];
  for (const h of handles) {
    try {
      ref ? h?.ref?.() : h?.unref?.();
    } catch {
      // best-effort
    }
  }
}

function createServerCache(deps: {
  kill: (server: Server) => Promise<unknown>;
  // Called when a background kill (eviction, idle expiry) rejects.
  onKillError?: (server: Server, err: unknown) => void;
  idleMs: number;
  maxIdle: number;
}) {
  const killQuietly = (server: Server) => {
    deps.kill(server).catch((err) => deps.onKillError?.(server, err));
  };
  const idle: Array<{ key: string; server: Server; timer: NodeJS.Timeout }> = [];
  // Per port: session starts still in flight, and ports where a start failed.
  // A failed or abandoned start may still register a session after
  // /appium/sessions reads empty, so either one rules the server out of reuse.
  const inFlight = new Map<number, number>();
  const failed = new Set<number>();
  const forget = (port: number) => {
    inFlight.delete(port);
    failed.delete(port);
  };
  const remove = (i: number) => {
    const [entry] = idle.splice(i, 1);
    clearTimeout(entry.timer);
    return entry.server;
  };
  return {
    take(key: string): Server | undefined {
      // Most recently parked first: the one least likely to have gone stale.
      let i = idle.length - 1;
      while (i >= 0 && idle[i].key !== key) i--;
      if (i === -1) return undefined;
      const server = remove(i);
      setRef(server, true);
      return server;
    },
    park(key: string, server: Server): void {
      if (deps.maxIdle < 1) {
        killQuietly(server);
        return;
      }
      // At capacity, evict the oldest: take() hands out the newest first.
      while (idle.length >= deps.maxIdle) killQuietly(remove(0));
      setRef(server, false);
      const timer = setTimeout(() => {
        const i = idle.findIndex((e) => e.server === server);
        if (i !== -1) killQuietly(remove(i));
      }, deps.idleMs);
      timer.unref();
      idle.push({ key, server, timer });
    },
    async drain(): Promise<void> {
      const servers = idle.splice(0).map((e) => {
        clearTimeout(e.timer);
        return e.server;
      });
      await Promise.all(servers.map((s) => deps.kill(s)));
    },
    discard(server: Server): Promise<unknown> {
      forget(server.port);
      return deps.kill(server);
    },
    // Call before each session start on `port`; call the returned settle with
    // whether it succeeded. Retries count separately, so one failed attempt
    // taints the server even when a later attempt succeeds.
    sessionStarting(port: number): (ok: boolean) => void {
      inFlight.set(port, (inFlight.get(port) ?? 0) + 1);
      let settled = false;
      return (ok: boolean) => {
        if (settled) return;
        settled = true;
        const n = (inFlight.get(port) ?? 1) - 1;
        if (n > 0) inFlight.set(port, n);
        else inFlight.delete(port);
        if (!ok) failed.add(port);
      };
    },
    // A freshly spawned server on `port` has no history, whatever ran there before.
    resetPort(port: number): void {
      forget(port);
    },
    isUnclean(port: number): boolean {
      return failed.has(port) || (inFlight.get(port) ?? 0) > 0;
    },
    servers(): Server[] {
      return idle.map((e) => e.server);
    },
  };
}

// One parked server under `key` that's still running and answers /status, or
// undefined. Dead or unresponsive ones are killed on the way.
async function takeServer(
  cache: ServerCache,
  key: string,
  deps: { isReady: (port: number) => Promise<boolean> }
): Promise<Server | undefined> {
  for (let s = cache.take(key); s; s = cache.take(key)) {
    if (!exited(s) && (await deps.isReady(s.port).catch(() => false))) return s;
    await cache.discard(s);
  }
  return undefined;
}

// At run end: park the server only if every session start on it succeeded
// and settled, it's alive, and it holds no sessions. Anything else (a failed or
// in-flight start, a leftover session, an unanswered request) is killed with
// its tree, exactly as a non-reusing run would.
async function handBackServer(
  cache: ServerCache,
  key: string,
  server: Server,
  deps: { listSessions: (port: number) => Promise<unknown[]> }
): Promise<"parked" | "killed"> {
  let clean = false;
  if (!exited(server) && !cache.isUnclean(server.port)) {
    try {
      clean = (await deps.listSessions(server.port)).length === 0;
    } catch {
      clean = false;
    }
  }
  if (!clean) {
    await cache.discard(server);
    return "killed";
  }
  cache.park(key, server);
  return "parked";
}

// Hand-back reads GET /appium/sessions, which Appium serves only with the
// `session_discovery` insecure feature. It joins any existing grant (Appium
// takes one comma-separated list) rather than replacing it. The server binds
// to 127.0.0.1, and the grant only lists sessions; the pool servers already
// accept a caller-chosen geckodriver path, a far larger capability.
// Handles both `--allow-insecure <list>` and `--allow-insecure=<list>`, and
// leaves a list that already grants the feature alone.
function allowSessionDiscovery(args: string[]): string[] {
  const feature = "*:session_discovery";
  const withFeature = (list: string) =>
    list.split(",").includes(feature) ? list : `${list},${feature}`;
  const out = [...args];
  const eq = out.findIndex((a) => a.startsWith("--allow-insecure="));
  if (eq !== -1) {
    out[eq] = `--allow-insecure=${withFeature(out[eq].slice("--allow-insecure=".length))}`;
    return out;
  }
  const i = out.indexOf("--allow-insecure");
  if (i === -1) return [...out, "--allow-insecure", feature];
  // A dangling flag (last arg, or followed by another flag) takes the feature
  // as its value, so the result never carries two --allow-insecure flags.
  if (i + 1 >= out.length || out[i + 1].startsWith("--")) {
    out.splice(i + 1, 0, feature);
    return out;
  }
  out[i + 1] = withFeature(out[i + 1]);
  return out;
}

// Single /status probe for a server that's supposed to be up already.
async function probeStatus(port: number): Promise<boolean> {
  try {
    const resp = await (await loadAxios()).get(`http://127.0.0.1:${port}/status`, { timeout: 2000 });
    return resp.status === 200;
  } catch {
    return false;
  }
}

async function listSessions(port: number): Promise<unknown[]> {
  const resp = await (await loadAxios()).get(`http://127.0.0.1:${port}/appium/sessions`, {
    timeout: 2000,
  });
  const value = resp.data?.value;
  if (!Array.isArray(value)) throw new Error("unexpected /appium/sessions response");
  return value;
}

export {
  reuseAppiumEnabled,
  appiumServerKey,
  createServerCache,
  takeServer,
  handBackServer,
  probeStatus,
  listSessions,
  allowSessionDiscovery,
  APPIUM_WATCHDOG_IMPORT,
};
