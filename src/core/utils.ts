import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import axios from "axios";
import { spawn, type ChildProcess } from "node:child_process";
import {
  loadHeavyDep,
  resolveHeavyDepPath,
  ensureRuntimeInstalled,
} from "../runtime/loader.js";
import {
  assertConptyAllocatable,
  ensurePtyBackendOnDisk,
} from "./ptyWatchdog.js";

export {
  outputResults,
  loadEnvs,
  log,
  timestamp,
  getOrInitRunTimestamp,
  getRunOutputDir,
  runArchivesArtifacts,
  replaceEnvs,
  spawnCommand,
  spawnBackgroundCommand,
  spawnPtyBackgroundCommand,
  waitForReady,
  waitForPort,
  waitForHttp,
  waitForStdio,
  waitForOutputMatch,
  inContainer,
  cleanTemp,
  calculateFractionalDifference,
  serializeBrowserResult,
  matchesExpectedOutput,
  fetchFile,
  isRelativeUrl,
  appendQueryParams,
  isDeviceWebContext,
  computeSettleCeiling,
  redactUrlForOutput,
  assertUrlHostIsPublic,
  sanitizeFilesystemName,
  compileFilter,
  isRetryableSessionError,
  isTransientProcessInitError,
  matchesFilter,
  selectSpecsForRun,
  findFreePort,
  runConcurrent,
  createResourceRegistry,
  runResourceAware,
  rollUpResults,
  rollUpAssertions,
  createAppiumPool,
  evaluateContextRequirements,
};

export type { BackgroundProcess };

// A fixed set of Appium server ports shared by concurrent runners. `acquire()`
// hands out a free port, waiting if every port is checked out; `release()`
// returns one, handing it straight to the next waiter. Single-threaded JS
// means the shift/push pairs never race. Each port backs its own Appium
// server, so two contexts never create sessions on the same server at once —
// the contention that crashed ChromeDriver when every context shared one.
function createAppiumPool(ports: number[]): {
  acquire(): Promise<number>;
  release(port: number): void;
} {
  const available = [...ports];
  const waiters: Array<(port: number) => void> = [];
  return {
    acquire() {
      const port = available.shift();
      if (port !== undefined) return Promise.resolve(port);
      return new Promise<number>((resolve) => waiters.push(resolve));
    },
    release(port: number) {
      const next = waiters.shift();
      if (next) next(port);
      else available.push(port);
    },
  };
}

// Run `fn` over `items` with at most `limit` calls in flight. A limit of 1 (or
// less) degenerates to strictly sequential execution in input order, so
// sequential and concurrent runs share this single code path. The shared
// cursor is safe without locking: JS is single-threaded, and `next++` happens
// synchronously between awaits.
//
// If `fn` rejects, the returned promise rejects with that error, but sibling
// calls already in flight keep running as orphaned microtasks (promises can't
// be cancelled). Callers that need error isolation must catch inside `fn` —
// runSpecs does.
async function runConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  });
  await Promise.all(workers);
}

// A registry of held, named exclusive resources (e.g. `"display"` for ffmpeg
// screen capture) shared across one run. `tryAcquire` is all-or-nothing so a
// multi-resource job never holds some names while blocked on another (no
// hold-and-wait → no deadlock). `release` wakes every waiter to re-contend.
// Single-threaded JS makes the Set checks atomic between awaits.
type ResourceRegistry = {
  tryAcquire(names: string[]): boolean;
  release(names: string[]): void;
  waitForFree(): Promise<void>;
};
function createResourceRegistry(): ResourceRegistry {
  const held = new Set<string>();
  let waiters: Array<() => void> = [];
  return {
    tryAcquire(names: string[]): boolean {
      for (const n of names) if (held.has(n)) return false;
      for (const n of names) held.add(n);
      return true;
    },
    release(names: string[]): void {
      for (const n of names) held.delete(n);
      const wake = waiters;
      waiters = [];
      for (const w of wake) w();
    },
    waitForFree(): Promise<void> {
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}

// Like `runConcurrent`, but each item may declare a set of exclusive resource
// names (via `resourcesOf`, default `item.exclusiveResources`). Up to `limit`
// items run at once, EXCEPT that two items sharing a resource never run
// concurrently — they queue on the shared `registry` mutex. So display-bound
// recordings serialize among themselves while everything else stays parallel,
// instead of collapsing the whole run to serial. Items with no resources never
// block, so an all-empty run is identical to `runConcurrent`.
//
// A worker claims the first pending item whose resources are all free
// (acquiring them atomically — no await between the scan and the claim). If
// nothing is runnable but items remain, it parks on `registry.waitForFree()`;
// an in-flight item necessarily holds the blocking resource and will release
// it, waking the worker — so there is always progress (no deadlock/starvation).
// Report order is preserved by callers via pre-assigned slots, so reordering
// execution here is safe. Resources are released in a `finally` even if `fn`
// rejects; callers needing error isolation catch inside `fn` (runSpecs does).
async function runResourceAware<T>(
  items: T[],
  limit: number,
  registry: ResourceRegistry,
  fn: (item: T) => Promise<void>,
  resourcesOf: (item: T) => string[] = (item: any) =>
    item?.exclusiveResources ?? []
): Promise<void> {
  const pending = items.map((_, i) => i);
  const workerCount = Math.max(
    1,
    Math.min(Math.floor(limit) || 1, items.length)
  );
  async function worker(): Promise<void> {
    while (true) {
      let claimPos = -1;
      let claimNames: string[] = [];
      for (let p = 0; p < pending.length; p++) {
        const names = resourcesOf(items[pending[p]]);
        if (names.length === 0) {
          claimPos = p;
          claimNames = [];
          break;
        }
        if (registry.tryAcquire(names)) {
          claimPos = p;
          claimNames = names;
          break;
        }
      }
      if (claimPos === -1) {
        if (pending.length === 0) return; // all done
        await registry.waitForFree(); // every runnable item is resource-blocked
        continue;
      }
      const idx = pending.splice(claimPos, 1)[0];
      try {
        await fn(items[idx]);
      } finally {
        if (claimNames.length) registry.release(claimNames);
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

// Roll child results up to a parent result: FAIL > WARNING > all-SKIPPED >
// PASS. An empty list rolls up to SKIPPED (vacuously "all children skipped").
function rollUpResults(children: Array<{ result?: string }>): string {
  if (children.some((child) => child.result === "FAIL")) return "FAIL";
  if (children.some((child) => child.result === "WARNING")) return "WARNING";
  if (children.every((child) => child.result === "SKIPPED")) return "SKIPPED";
  return "PASS";
}

// Roll up an action's verification ASSERTIONS to a step status. Unlike
// `rollUpResults`, an empty (or falsy) assertion set rolls up to PASS, not
// SKIPPED: zero applicable assertions plus successful EXECUTION is a PASS (the
// action did its work, there was simply nothing to verify). Use this — not
// `rollUpResults` — wherever an action's `assertions` array may legitimately be
// empty (click/type/dragAndDrop/runBrowserScript). Actions that always emit at
// least one record stay on `rollUpResults`.
function rollUpAssertions(
  assertions?: Array<{ result?: string }> | null
): string {
  if (!assertions || assertions.length === 0) return "PASS";
  return rollUpResults(assertions);
}

// Bind a temp listener to port 0, capture the OS-assigned port, and release
// it. There is a small close-to-rebind window where another process could
// grab the port before the caller binds it. driverStart's ECONNREFUSED retry
// absorbs that race when the caller is Appium.
async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close(() => reject(new Error("Failed to obtain ephemeral port")));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

// A handle to a long-running process started by a `background`
// runShell/runCode step. Output is buffered (ring-capped) so readiness probes
// and debugging can inspect it without waiting for the process to exit.
interface BackgroundProcess {
  // The Node ChildProcess, when the process was spawned over a pipe
  // (spawnBackgroundCommand). PTY-backed processes have no ChildProcess, so this
  // is optional; teardown prefers `kill()` when present, else tree-kills `pid`.
  child?: ChildProcess;
  pid: number | undefined;
  getStdout(): string;
  getStderr(): string;
  getCombined(): string;
  // Write data to the process's stdin. Returns false if stdin is unavailable
  // (never opened, already closed/destroyed); true if the write was accepted.
  write(data: string): boolean;
  // Subscribe to new output chunks. Returns an unsubscribe function.
  onChunk(cb: (chunk: string, stream: "stdout" | "stderr") => void): () => void;
  // Resolves with the exit code when the process closes, or null if it never
  // started (spawn error).
  exited: Promise<number | null>;
  // Terminate the process. Present on PTY-backed handles (which own their own
  // termination via `pty.kill()` and have no pid for tree-kill). When present,
  // teardown prefers this over tree-killing `pid`.
  kill?(): Promise<void> | void;
  // True when the handle is backed by a pseudo-terminal (node-pty) rather than a
  // pipe. In PTY mode stdout/stderr are merged into a single stream.
  isPty?: boolean;
}

// Cap each buffered stream so a process that logs for the whole suite can't
// grow memory without bound. The tail is what readiness probes care about.
const BACKGROUND_BUFFER_LIMIT = 256 * 1024;

function backgroundSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Non-blocking sibling of spawnCommand: starts a process and returns a handle
// immediately instead of awaiting `close`. Mirrors spawnCommand's spawn options
// (shell:true, windowsHide on win32, cwd) so existing command strings behave the
// same. With shell:true, child.pid is the shell's pid; tree-kill (used at
// teardown) handles the child tree.
function spawnBackgroundCommand(
  cmd: string,
  args: string[] = [],
  options: any = {}
): BackgroundProcess {
  const spawnOptions: any = { shell: true };
  if (process.platform === "win32") spawnOptions.windowsHide = true;
  if (options.cwd) spawnOptions.cwd = options.cwd;

  // `shell: true` is intentional and by design. `runShell` (and `runCode`'s
  // shell backend) exist to execute the exact shell command an author writes in
  // a test spec — pipes, `&&`, globbing, env-var expansion, redirection. The
  // command string is author-controlled test content, not untrusted external
  // input, so this is not a command-injection sink. Switching to an arg-array /
  // execFile invocation would break the feature's contract. CodeQL "unsafe
  // shell command" here is acknowledged and dismissed as won't-fix / by design.
  const child = spawn(cmd, args, spawnOptions);

  let stdout = "";
  let stderr = "";
  const subscribers = new Set<
    (chunk: string, stream: "stdout" | "stderr") => void
  >();

  function append(stream: "stdout" | "stderr", text: string) {
    if (stream === "stdout") {
      stdout = (stdout + text).slice(-BACKGROUND_BUFFER_LIMIT);
    } else {
      stderr = (stderr + text).slice(-BACKGROUND_BUFFER_LIMIT);
    }
    for (const cb of subscribers) cb(text, stream);
  }

  if (child.stdout)
    child.stdout.on("data", (d: any) => append("stdout", d.toString()));
  if (child.stderr)
    child.stderr.on("data", (d: any) => append("stderr", d.toString()));

  // Registering an `error` listener here also prevents an immediate spawn
  // failure (e.g. a bad command) from crashing the process as an unhandled
  // 'error' event; the failure surfaces via `exited` resolving with null.
  const exited = new Promise<number | null>((resolve) => {
    child.once("close", (code) => resolve(code));
    child.once("error", () => resolve(null));
  });

  return {
    child,
    pid: child.pid,
    getStdout: () => stdout,
    getStderr: () => stderr,
    getCombined: () => stdout + stderr,
    write(data) {
      // `{ shell: true }` gives the child a writable stdin pipe. Guard against
      // a closed/destroyed/ended stream so a write to a dead process is a no-op
      // (false) rather than a throw. We return false ONLY when stdin is
      // unavailable — never forwarding Node's backpressure `false` (which would
      // conflate a full buffer with a gone stdin).
      if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded)
        return false;
      child.stdin.write(data);
      return true;
    },
    onChunk(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    exited,
  };
}

// Quote a single command-line argument so the platform shell treats it as one
// token (so the `args` field keeps working when we append it to the command
// string for the shell). Wraps in double quotes and escapes embedded double
// quotes; mirrors how `shell:true` would pass each arg.
function quoteShellArg(arg: string): string {
  if (process.platform === "win32") {
    // cmd.exe: escape embedded quotes by doubling them, then wrap.
    return `"${arg.replace(/"/g, '""')}"`;
  }
  // POSIX sh: single-quote and escape any embedded single quote.
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

// PTY-backed sibling of spawnBackgroundCommand: starts a process under a real
// pseudo-terminal (node-pty) so full-screen/interactive TUIs that check
// `process.stdout.isTTY` render and accept keystrokes (Phase 2). It is a
// drop-in `BackgroundProcess` — same buffer/subscriber model — except a PTY
// exposes ONE merged stream, so all output lands in the `stdout` buffer
// (`getStderr()` returns "", `getCombined()` returns stdout). That keeps
// `waitForStdio`/`waitForReady` (`getStdout()||getStderr()`) working unchanged.
//
// The PTY backend is `@homebridge/node-pty-prebuilt-multiarch` — an API-identical
// parallel fork of node-pty that ships prebuilt binaries for macOS (incl. arm64),
// Windows, and Linux across Node ABIs. Upstream node-pty has no Windows prebuilds
// (source build fails on bare runners) and its macOS prebuild ships the
// `spawn-helper` without the execute bit (`posix_spawnp failed`); the fork avoids
// both, so the PTY path actually runs on CI rather than degrading to SKIP.
//
// It is a registered heavy dep (HEAVY_NPM_DEPS + `ddRuntimeDependencies`), loaded
// the same way as webdriverio/appium: `loadHeavyDep` resolves a copy that the
// postinstall / `install all` step (or a prior run's JIT install) placed in the
// runtime cache, and `autoInstall` lets it install on demand otherwise. It is NOT
// in `optionalDependencies`, so the lockfile stays untouched. When it can't be
// resolved or installed (no prebuilt binary for the platform), this REJECTS and
// the caller (runShell) maps that to a SKIPPED step (graceful degradation).
//
// We spawn through the platform shell (`cmd.exe /d /s /c` / `/bin/sh -c`) for
// parity with spawnBackgroundCommand's `{ shell: true }`, appending the (quoted)
// `args` to the command string so the `args` field still works.
const PTY_PACKAGE = "@homebridge/node-pty-prebuilt-multiarch";
async function spawnPtyBackgroundCommand(
  cmd: string,
  args: string[] = [],
  options: any = {}
): Promise<BackgroundProcess> {
  // Rethrow on failure tagged so runShell SKIPs for an unavailable node-pty while
  // still FAILing on any other PTY startup error.
  let pty: any;
  try {
    pty = await loadHeavyDep<any>(PTY_PACKAGE, {
      ctx: { cacheDir: options.cacheDir },
    });
  } catch {
    // Tag ONLY the missing-dependency case so runShell can SKIP for it while
    // still FAILing on any other PTY startup error.
    const err: any = new Error(
      `The PTY backend (node-pty / ${PTY_PACKAGE}) is not installed. Install it (\`npm install ${PTY_PACKAGE}\`) to use \`background.tty\`.`
    );
    err.code = "NODE_PTY_UNAVAILABLE";
    throw err;
  }

  // #501 guard, part 1 — stale-module self-heal. loadHeavyDep succeeding is
  // NOT proof the backend is usable: a mid-run JIT install of another heavy
  // dep used to prune node-pty's files from the runtime cache while the
  // module stayed importable from the stale resolution + ESM caches, and a
  // spawn without its on-disk support files freezes the process inside a
  // native wait. Verify the resolved path physically exists, force-reinstall
  // when it doesn't (same paths → the loaded module's support files return),
  // and SKIP (NODE_PTY_UNAVAILABLE) if the files can't be restored.
  const ptyModulePath = await ensurePtyBackendOnDisk({
    resolvePath: () =>
      resolveHeavyDepPath(PTY_PACKAGE, { cacheDir: options.cacheDir }),
    reinstall: () =>
      ensureRuntimeInstalled([PTY_PACKAGE], {
        ctx: { cacheDir: options.cacheDir },
        force: true,
      }),
  });

  // #501 guard, part 2 — Windows-only ConPTY watchdog, defense-in-depth for
  // wedges the disk check can't see (upstream node-pty hangs at the native
  // connect: microsoft/node-pty #640/#532/#512; environment-specific console
  // states). The probe runs in a worker thread because the freeze is a
  // synchronous native block — a same-thread timeout can never fire — and a
  // worker shares this process's state where a child process wouldn't. Only a
  // genuine wedge degrades to SKIP; a healthy/inconclusive probe falls through
  // to the direct spawn below, so the happy path can never regress.
  await assertConptyAllocatable({ ptyModulePath });

  const argstr = args.length ? " " + args.map(quoteShellArg).join(" ") : "";
  const fullCommand = cmd + argstr;
  const isWin = process.platform === "win32";
  // Match Node's `{ shell: true }` invocation exactly so a `tty` process behaves
  // identically to the pipe path: cmd.exe with `/d /s /c` on Windows (disable
  // AutoRun, treat the whole string as one quoted command), `/bin/sh -c` on POSIX
  // (NOT $SHELL, which may be a non-POSIX shell).
  const shell = isWin ? process.env.ComSpec || "cmd.exe" : "/bin/sh";
  const shellArgs = isWin
    ? ["/d", "/s", "/c", fullCommand]
    : ["-c", fullCommand];

  let ptyProcess: any;
  try {
    ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-color",
      // TODO(phase): expose as `background.tty.cols` / `background.tty.rows` so
      // layout-sensitive TUIs (Ink reads process.stdout.columns) can match an
      // expected width when authoring `waitUntil.stdio` patterns.
      cols: 120,
      rows: 30,
      cwd: options.cwd || process.cwd(),
      env: process.env,
    });
  } catch (error: any) {
    // node-pty loaded but couldn't create a PTY here (e.g. a prebuilt
    // spawn-helper that doesn't work on this OS/arch — `posix_spawnp failed` on
    // some macOS arm64 runners). Treat "PTY can't be created on this platform"
    // the same as "node-pty unavailable" so runShell SKIPs (graceful) rather
    // than FAILing. A bad command/cwd still surfaces as a readiness failure.
    const err: any = new Error(
      `PTY could not be created on this platform: ${error?.message ?? error}`
    );
    err.code = "NODE_PTY_UNAVAILABLE";
    throw err;
  }

  // PTY = one merged stream → feed everything into the stdout buffer.
  let stdout = "";
  const subscribers = new Set<
    (chunk: string, stream: "stdout" | "stderr") => void
  >();
  function append(text: string) {
    stdout = (stdout + text).slice(-BACKGROUND_BUFFER_LIMIT);
    for (const cb of subscribers) cb(text, "stdout");
  }
  ptyProcess.onData((d: string) => append(d));

  let alive = true;
  const exited = new Promise<number | null>((resolve) => {
    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      alive = false;
      resolve(exitCode);
    });
  });

  return {
    pid: ptyProcess.pid,
    isPty: true,
    getStdout: () => stdout,
    getStderr: () => "",
    getCombined: () => stdout,
    write(data) {
      // Guard against a write to an already-exited PTY so it is a no-op (false)
      // rather than a throw.
      if (!alive) return false;
      try {
        ptyProcess.write(data);
        return true;
      } catch {
        return false;
      }
    },
    onChunk(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    exited,
    kill(): Promise<void> {
      try {
        ptyProcess.kill();
      } catch {
        // best-effort — the PTY may already have exited
      }
      // Resolve only once the PTY has actually exited, so `await bg.kill()` at
      // teardown sites waits for the process to be gone (parity with the pipe
      // path's awaited tree-kill).
      return exited.then(
        () => {},
        () => {}
      );
    },
  };
}

// Attempt a single TCP connection. Resolves true on connect, false on any error
// or per-attempt timeout. Never rejects.
function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(2000, () => finish(false));
  });
}

// How long to wait between poll attempts for the port / HTTP conditions.
const READY_POLL_INTERVAL_MS = 500;

// Poll a TCP port (on localhost) until it accepts a connection or the deadline
// passes.
async function waitForPort(
  port: number,
  { deadline }: { deadline: number }
): Promise<void> {
  const host = "127.0.0.1";
  while (true) {
    if (await tryConnect(host, port)) return;
    // Only give up once the clock has actually run out, and bound the wait to
    // the time remaining so a final probe still happens near the deadline. A
    // fixed `Date.now() + pollIntervalMs >= deadline` check would throw with
    // time still on the clock on a slow host, skipping a winnable attempt.
    if (Date.now() >= deadline) {
      throw new Error(`Port ${port} did not open in time.`);
    }
    await backgroundSleep(Math.min(READY_POLL_INTERVAL_MS, deadline - Date.now()));
  }
}

// Poll an HTTP endpoint until a GET returns a 2xx status or the deadline passes.
// Connection errors are swallowed and retried.
async function waitForHttp(
  url: string,
  { deadline }: { deadline: number }
): Promise<void> {
  while (true) {
    try {
      // Cap the per-request timeout to the time left so a single hung request
      // can't block past the overall readiness deadline (e.g. timeout: 600).
      const remaining = deadline - Date.now();
      const resp = await axios.get(url, {
        validateStatus: () => true,
        timeout: Math.max(1, Math.min(5000, remaining)),
      });
      if (resp.status >= 200 && resp.status < 300) return;
    } catch {
      // Server not up yet (or transient) — retry until the deadline.
    }
    if (Date.now() >= deadline) {
      throw new Error(`HTTP GET ${url} did not return a 2xx status in time.`);
    }
    await backgroundSleep(Math.min(READY_POLL_INTERVAL_MS, deadline - Date.now()));
  }
}

// Resolve when the process output matches `expected`, or reject when the
// deadline passes. Mirrors runShell's `stdio` matching exactly: a substring
// match, or a regular expression when `expected` is wrapped in forward slashes
// (`/.../`), tested against stdout OR stderr (each stream separately, not a
// concatenation — so a match can't span the stdout/stderr boundary).
// Already-buffered output is checked first so a match emitted before
// subscription isn't missed.
function waitForStdio(
  bg: BackgroundProcess,
  expected: string,
  { deadline }: { deadline: number }
): Promise<void> {
  let regex: RegExp | null = null;
  if (expected.startsWith("/") && expected.endsWith("/")) {
    try {
      regex = new RegExp(expected.slice(1, -1));
    } catch (error: any) {
      // Surface a Doc Detective-shaped error instead of the engine's raw
      // SyntaxError; runShell's stdio matching wraps regex compilation similarly.
      return Promise.reject(
        new Error(
          `waitUntil.stdio: invalid regular expression ${expected}: ${error.message}`
        )
      );
    }
  }
  const matchesText = (text: string) =>
    regex ? regex.test(text) : text.includes(expected);
  // stdout OR stderr, checked separately (like runShell's stdio).
  const matched = () => matchesText(bg.getStdout()) || matchesText(bg.getStderr());

  return new Promise((resolve, reject) => {
    if (matched()) return resolve();
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Expected output (${expected}) not seen in time.`));
    }, Math.max(0, deadline - Date.now()));
    unsubscribe = bg.onChunk(() => {
      if (matched()) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

// Resolve when the process output matches `expected` (substring, or /regex/ via
// matchesExpectedOutput), or resolve `false` when the deadline passes. Snapshots
// the already-buffered output first so a match emitted before subscription isn't
// missed (race guard). Non-throwing: the assertion engine — not an exception —
// decides PASS/FAIL, unlike waitForStdio which rejects on timeout.
// Matches against the COMBINED stdout+stderr (getCombined), distinct from
// waitForReady's stdout-OR-stderr `waitForStdio`.
function waitForOutputMatch(
  bg: BackgroundProcess,
  expected: string,
  { deadline }: { deadline: number }
): Promise<boolean> {
  return new Promise((resolve) => {
    if (matchesExpectedOutput(bg.getCombined(), expected)) return resolve(true);
    let off = () => {};
    const t = setTimeout(() => {
      off();
      resolve(false);
    }, Math.max(0, deadline - Date.now()));
    off = bg.onChunk(() => {
      if (matchesExpectedOutput(bg.getCombined(), expected)) {
        clearTimeout(t);
        off();
        resolve(true);
      }
    });
  });
}

// Block until every condition in `waitUntil` is met, fail fast if the process
// exits first, or reject when `timeoutMs` elapses. Conditions are AND-combined
// (like goTo's `waitUntil`): all the ones present must pass. An absent or empty
// `waitUntil` means the process is ready as soon as it is spawned.
async function waitForReady(
  bg: BackgroundProcess,
  waitUntil: any,
  { timeoutMs }: { timeoutMs: number }
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  const probes: Promise<void>[] = [];
  if (waitUntil && typeof waitUntil.port === "number") {
    probes.push(waitForPort(waitUntil.port, { deadline }));
  }
  if (waitUntil && typeof waitUntil.httpGet === "string") {
    probes.push(waitForHttp(waitUntil.httpGet, { deadline }));
  }
  if (waitUntil && typeof waitUntil.stdio === "string") {
    probes.push(waitForStdio(bg, waitUntil.stdio, { deadline }));
  }
  if (waitUntil && typeof waitUntil.delayMs === "number") {
    probes.push(backgroundSleep(Math.min(waitUntil.delayMs, timeoutMs)));
  }

  // All conditions must pass; an empty set resolves immediately.
  const ready = Promise.all(probes).then(() => undefined);

  // Fail fast if the process dies before becoming ready.
  const earlyExit = bg.exited.then((code) => {
    // `exited` resolves null when the process never started (spawn error), so
    // report a spawn failure rather than a meaningless "exit code null".
    throw new Error(
      code === null
        ? `Process failed to start (spawn error).`
        : `Process exited before becoming ready (exit code ${code}).`
    );
  });

  // The race loser settles later (a probe keeps polling to its own deadline;
  // earlyExit rejects when the process is eventually killed at teardown).
  // Attach no-op catches so a late rejection is always considered handled and
  // never surfaces as an unhandledRejection during normal closeSurface teardown.
  ready.catch(() => {});
  earlyExit.catch(() => {});
  for (const p of probes) p.catch(() => {});

  await Promise.race([ready, earlyExit]);
}

// Two families of transient, retryable session-creation failures, both worse
// under concurrency:
//   1. POST /session races a just-spawned-or-still-dying Appium (Windows):
//      /status returns 200 from the outgoing process while /session no longer
//      accepts, or Appium's proxy to chromedriver drops the socket ->
//      ECONNREFUSED / ECONNRESET / "socket hang up" / "could not proxy command".
//   2. Several browsers launching at once briefly starve resources and a
//      driver child dies during startup. For Chrome this reads as ChromeDriver
//      "crashed during startup" / "cannot connect to" / "DevToolsActivePort" /
//      "session not created"; for Firefox the just-created geckodriver child
//      crashes right after POST /session, so the next command reports it
//      "cannot be proxied to Gecko Driver server because its process is not
//      running (probably crashed)" (ADR 01042). Both are the same transient
//      concurrent-startup contention: a staggered retry lets it clear and
//      recovers on the next attempt in practice.
const TRANSIENT_SESSION_ERROR =
  /ECONNREFUSED|ECONNRESET|socket hang up|could not proxy command|crashed during startup|cannot connect to|DevToolsActivePort|session not created|cannot be proxied to Gecko Driver server/i;

// The wdio client aborts POST /session with "aborted due to timeout" when the
// request exceeds connectionRetryTimeout. For native sessions that declared a
// slow-startup ceiling (XCUITest's wdaLaunchTimeout / Mac2's
// serverStartupTimeout raise it past the 2-minute default), the server-side
// WebDriverAgent xcodebuild keeps running after the client gives up, so a
// fresh POST typically binds quickly — retry it. Default-ceiling (browser /
// Windows / Android) sessions keep today's fail-fast behavior: there a
// 2-minute session POST means something is genuinely wrong.
const SESSION_TIMEOUT_ABORT = /aborted due to timeout/i;

function isRetryableSessionError(
  message: string | undefined,
  startupCeiling: number | undefined = 0
): boolean {
  if (typeof message !== "string" || !message) return false;
  if (TRANSIENT_SESSION_ERROR.test(message)) return true;
  return startupCeiling > 120000 && SESSION_TIMEOUT_ABORT.test(message);
}

// Windows NTSTATUS exit codes for a process that died *during initialization*
// under concurrent-spawn contention — the process-surface analogue of the
// driver-start transient session races above (ADR 01042). At
// `concurrentRunners > 1` a startSurface that opens many process/PTY children
// at once can transiently exhaust a Windows loader/console limit so one child
// crashes before it can signal ready:
//   • 0xC0000142 (-1073741502) STATUS_DLL_INIT_FAILED — the loader couldn't
//     initialize a DLL for the child (classic heavy-concurrent-spawn failure).
//   • 0xC000013A (-1073741510) STATUS_CONTROL_C_EXIT — a spurious console-control
//     termination delivered to a just-spawned console/ConPTY child during
//     startup; observed in CI on `p6-tty` at concurrentRunners 2.
// Both clear on a fresh spawn in practice, so a bounded retry recovers.
// Windows-only: these are NTSTATUS values, meaningless on POSIX (where the same
// decimals would be ordinary signal/exit codes), so the guard never fires off
// win32 and `concurrentRunners: 1` behavior is byte-identical.
const TRANSIENT_PROCESS_INIT_EXIT_CODES = new Set([
  -1073741502, // 0xC0000142 STATUS_DLL_INIT_FAILED
  -1073741510, // 0xC000013A STATUS_CONTROL_C_EXIT
]);

function isTransientProcessInitError(
  message: string | undefined,
  platform: string = process.platform
): boolean {
  if (platform !== "win32") return false;
  if (typeof message !== "string" || !message) return false;
  // waitForReady's early-exit rejection is
  // `Process exited before becoming ready (exit code <n>).` — pull the code and
  // match it against the transient NTSTATUS set. Only the early-exit shape is
  // retryable; a readiness *timeout* (a genuinely stuck process) is not.
  const match = message.match(
    /exited before becoming ready \(exit code (-?\d+)\)/
  );
  if (!match) return false;
  return TRANSIENT_PROCESS_INIT_EXIT_CODES.has(Number(match[1]));
}

function compileFilter(patterns?: string[] | unknown): RegExp[] {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];
  // Trim each pattern before compiling so config / env / CLI inputs all
  // produce the same regex (the CLI splits on `,` and trims; config files
  // and DOC_DETECTIVE_CONFIG do not). Whitespace-only entries are dropped —
  // a bare "   " would otherwise compile to /   /i and match anything that
  // happens to contain whitespace, which is never the user's intent.
  return patterns
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => new RegExp(s, "i"));
}

function matchesFilter(id: string | undefined, filters: RegExp[]): boolean {
  if (!Array.isArray(filters) || filters.length === 0) return true;
  if (typeof id !== "string") return false;
  return filters.some((re) => re.test(id));
}

// Apply config.specFilter / config.testFilter to a specs[] array. Returns a
// new array with non-matching specs removed and each matching spec's tests
// narrowed to those that pass the test filter. Specs with zero remaining
// tests are dropped. Input is not mutated. If neither filter is configured,
// the input is returned as-is for cheap pass-through.
function selectSpecsForRun(specs: any[], config: any): any[] {
  const specFilters = compileFilter(config?.specFilter);
  const testFilters = compileFilter(config?.testFilter);
  if (specFilters.length === 0 && testFilters.length === 0) return specs;
  const out: any[] = [];
  for (const spec of specs || []) {
    if (!matchesFilter(spec?.specId, specFilters)) continue;
    const filteredTests = (spec?.tests || []).filter((t: any) =>
      matchesFilter(t?.testId, testFilters)
    );
    if (filteredTests.length === 0) continue;
    out.push({ ...spec, tests: filteredTests });
  }
  return out;
}

function isRelativeUrl(url: string) {
  try {
    new URL(url);
    // If no error is thrown, it's a complete URL
    return false;
  } catch (error) {
    // If URL constructor throws an error, it's a relative URL
    return true;
  }
}

// Is this WebdriverIO session a DEVICE (iOS/Android) session running in a WEB
// (browser) context? This is the tight gate for the post-navigation settle in
// goTo (ADR 01047): the settle exists only to absorb the freshly-built-WDA
// window where an iOS Safari (XCUITest web context) element tree is momentarily
// empty right after navigation while readyState already reports complete.
//
// - `isMobile` is WebdriverIO's own device flag (true when platformName is
//   iOS/Android or Appium caps are present) — desktop browser sessions have it
//   falsy, so desktop keeps a byte-identical control path (no settle).
// - `capabilities.browserName` distinguishes a mobile-WEB session (Safari on
//   iOS, Chrome on Android) from a native-app session (no browserName). A
//   native-app context never reaches goTo, but gating on browserName keeps the
//   predicate honest and self-describing.
function isDeviceWebContext(driver: any): boolean {
  if (!driver) return false;
  const isMobile = driver.isMobile === true;
  const browserName = driver.capabilities?.browserName;
  return isMobile && typeof browserName === "string" && browserName.length > 0;
}

// Ceiling (ms) for the device-web post-navigation settle in goTo: whatever of
// the goTo timeout remains after the readiness gate, capped at 3s and floored
// at 0. A non-positive result means "no budget left" — goTo's `> 0` guard then
// skips the settle entirely. Pure so the guard's arithmetic is tested directly,
// without racing wall-clock timing through the runner.
//
// @internal — an implementation detail of goTo's settle, exported only so the
// unit tests can exercise it. Not a public API; do not rely on it externally.
const SETTLE_CEILING_MAX_MS = 3000;
function computeSettleCeiling(waitTimeout: number, elapsedMs: number): number {
  return Math.max(0, Math.min(SETTLE_CEILING_MAX_MS, waitTimeout - elapsedMs));
}

function appendQueryParams(
  url: string,
  params: Record<string, unknown> | undefined | null
): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return url;
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return url;

  // Split off the fragment so new params land before it, not inside.
  const hashIdx = url.indexOf("#");
  const fragment = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;

  const queryIdx = base.indexOf("?");
  const pathAndAuthority = queryIdx >= 0 ? base.slice(0, queryIdx) : base;
  const existingQuery = queryIdx >= 0 ? base.slice(queryIdx + 1) : "";

  // Walk the existing query and drop only the segments whose key collides
  // with a new entry; everything else is preserved byte-for-byte. Then
  // append the new pairs (encoded fresh). This avoids re-encoding any
  // non-colliding pair — `URLSearchParams.toString()` would otherwise
  // normalize `+` for spaces and percent-encode `:` / `,` etc., which
  // breaks signed URLs and strict backends. New params always go through
  // encodeURIComponent so callers can pass arbitrary strings.
  const newKeys = new Set(entries.map(([k]) => k));
  const preservedSegments = existingQuery
    ? existingQuery.split("&").filter((segment) => {
        if (!segment) return false;
        const eqIdx = segment.indexOf("=");
        const rawKey = eqIdx >= 0 ? segment.slice(0, eqIdx) : segment;
        let decodedKey: string;
        try {
          decodedKey = decodeURIComponent(rawKey);
        } catch {
          decodedKey = rawKey;
        }
        return !newKeys.has(decodedKey);
      })
    : [];
  const newPairs = entries.map(
    ([k, v]) =>
      `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
  );

  const query = [...preservedSegments, ...newPairs].join("&");
  return pathAndAuthority + (query ? "?" + query : "") + fragment;
}

// Delete transient scratch files from the doc-detective temp directory.
// PRESERVED entries: the lazy-install cache subdirectories (`browsers/`,
// `runtime/`) and `installed.json`. The default cacheDir is
// `<os.tmpdir()>/doc-detective/`, which means cache assets and scratch
// files share the same root directory. A blanket wipe here would delete
// the very chromedriver/firefox binaries the next runTests call needs
// (this regression broke sequential `runTests` calls in CI on every
// platform — see test/core-core.test.js's getRunner suite).
const PRESERVED_TEMP_ENTRIES = new Set([
  "browsers",
  "runtime",
  "installed.json",
]);

function cleanTemp() {
  const tempDir = path.join(os.tmpdir(), "doc-detective");
  if (!fs.existsSync(tempDir)) return;
  for (const entry of fs.readdirSync(tempDir)) {
    if (PRESERVED_TEMP_ENTRIES.has(entry)) continue;
    const curPath = path.join(tempDir, entry);
    try {
      const stat = fs.statSync(curPath);
      if (stat.isDirectory()) {
        fs.rmSync(curPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(curPath);
      }
    } catch {
      // best-effort: a concurrent run / OS lock may already have removed
      // this entry — leaving the cache stable is the priority.
    }
  }
}

// Fetch a file from a URL and save to a temp directory.
// With `{ binary: true }`, fetches as arraybuffer and preserves raw bytes —
// required for images and other non-text payloads. Binary fetches also apply
// hard limits (timeout, max body size, max redirects) so a misbehaving server
// can't stall or OOM the run.
// Otherwise, non-JSON responses are stringified (text pass-through).
// Returns `{ result: "error", message }` on failure.
const FETCH_BINARY_DEFAULTS = {
  responseType: "arraybuffer" as const,
  timeout: 30_000,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024,
  maxRedirects: 5,
};

// Replace characters that are invalid in filenames on Windows (and often
// problematic on other platforms) with `_`. Keeps dots, hyphens, and
// alphanumerics untouched so names stay recognizable. Also rejects leading
// dots that could turn the file into a traversal segment.
function sanitizeFilesystemName(name: string, fallback: string): string {
  if (!name || name === "." || name === "..") return fallback;
  // Control chars 0x00-0x1f + Windows reserved: < > : " / \ | ? *
  const cleaned = name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
  // After replacement, guard against all-dots or empty results.
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned;
}

// Derive a safe on-disk filename from a URL. URL-derived strings can contain
// path separators (`/`, `\`), traversal segments (`..`), or characters that
// are invalid in filenames on Windows (`:<>"|?*`). `path.basename` strips
// directory components; `sanitizeFilesystemName` then neutralizes remaining
// unsafe characters so `fetchFile` works on every platform.
function safeFilenameFromUrl(fileURL: string, fallback: string): string {
  let raw: string;
  try {
    raw = new URL(fileURL).pathname;
  } catch {
    raw = fileURL;
  }
  raw = raw.split("?")[0].split("#")[0];
  const base = path.basename(raw.replace(/\\/g, "/"));
  return sanitizeFilesystemName(base, fallback);
}

// Strip query string and fragment from a URL for display/logging. S3
// pre-signed URLs carry tokens/signatures in the query; leaking them into
// step descriptions, debug logs, or result outputs exposes credentials.
// The full URL with query is still used for the fetch itself — only the
// *reported* form is redacted.
function redactUrlForOutput(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

// Private/loopback/link-local IP ranges that binary URL fetches refuse to
// reach by default. Covers IPv4 RFC1918, loopback, link-local (169.254/16),
// carrier-grade NAT (100.64/10), and the cloud-metadata special cases
// (169.254.169.254 is inside link-local and thus covered).
function isPrivateOrLoopbackAddress(ip: string): boolean {
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("fe80:")) return true; // link-local
    if (normalized.startsWith("::ffff:")) {
      // IPv4-mapped IPv6. The WHATWG URL parser normalizes the embedded v4 to
      // hex (::ffff:10.0.0.1 → ::ffff:a00:1, and ::ffff:0.0.0.1 → ::ffff:0:1),
      // so reconstruct the dotted v4 from the two hex groups and apply the v4
      // ranges above; otherwise a mapped private address (e.g.
      // http://[::ffff:a00:1]/x = 10.0.0.1) silently bypasses the guard.
      const tail = normalized.slice("::ffff:".length);
      // Defensive: a dotted-decimal tail (::ffff:10.0.0.1) is a valid IPv6
      // literal but current callers pass URL-normalized hosts (always hex), so
      // this path is unreachable in practice. Handle it anyway — fail CLOSED by
      // classifying the embedded v4 rather than slipping past as "public".
      /* c8 ignore start - URL normalization always yields the hex form below */
      if (net.isIPv4(tail)) {
        return isPrivateOrLoopbackAddress(tail);
      }
      /* c8 ignore stop */
      // The genuine IPv4-mapped form the URL parser emits is two hex groups
      // (::ffff:HHHH:LLLL = the embedded 32-bit v4); reconstruct and re-check.
      const hexMatch = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrLoopbackAddress(dotted);
      }
      // Any other ::ffff: form (e.g. ::ffff:1) is a normal IPv6 address, not an
      // IPv4-mapped one, and matches none of the private prefixes above → public.
      return false;
    }
    return false;
  }
  return false;
}

// Reject URLs whose host resolves to a loopback/private IP, unless the
// caller explicitly opts in (DOC_DETECTIVE_ALLOW_LOCAL_URLS=true). Tests
// and trusted internal integrations set the env var; normal doc-spec input
// does not, so an untrusted spec can't pivot through doc-detective to hit
// cloud metadata or intranet services.
//
// Note: this is a best-effort check. DNS rebinding and TOCTOU races are
// possible between resolution and connect; for true SSRF-grade isolation,
// wire in an agent that validates the actual remote address at connect
// time. This guard covers the common misuse cases.
async function assertUrlHostIsPublic(fileURL: string): Promise<void> {
  if (process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS === "true") return;
  let parsed: URL;
  try {
    parsed = new URL(fileURL);
  } catch {
    throw new Error(`Invalid URL: ${redactUrlForOutput(fileURL)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported URL scheme (${parsed.protocol}) for ${redactUrlForOutput(
        fileURL
      )}`
    );
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  // Direct IP literals: check immediately.
  if (net.isIP(host)) {
    if (isPrivateOrLoopbackAddress(host)) {
      throw new Error(
        `Refusing to fetch private/loopback address (${host}). Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
      );
    }
    return;
  }
  // Hostnames: resolve and check every answer (A + AAAA).
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new Error(
      `Refusing to fetch localhost (${host}). Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
    );
  }
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch (error) {
    throw new Error(
      `Couldn't resolve host ${host} for SSRF check: ${(error as Error).message}`
    );
  }
  for (const { address } of addresses) {
    if (isPrivateOrLoopbackAddress(address)) {
      throw new Error(
        `Host ${host} resolves to a private/loopback address (${address}); refusing to fetch. Set DOC_DETECTIVE_ALLOW_LOCAL_URLS=true to allow.`
      );
    }
  }
}

async function fetchFile(
  fileURL: string,
  opts: { binary?: boolean } = {}
) {
  try {
    if (opts.binary) {
      // Only gate binary fetches for now — the text path is an internal
      // loader used by the test-detection pipeline and pre-dates this
      // change; expanding SSRF coverage there belongs in its own PR.
      await assertUrlHostIsPublic(fileURL);
    }
    const response = await axios.get(
      fileURL,
      opts.binary ? FETCH_BINARY_DEFAULTS : undefined
    );
    let data: Buffer | string;
    if (opts.binary) {
      data = Buffer.from(response.data);
    } else if (typeof response.data === "object") {
      data = JSON.stringify(response.data, null, 2);
    } else {
      data = response.data.toString();
    }
    const fileName = safeFilenameFromUrl(fileURL, "fetched_file");
    const hash = crypto.createHash("md5").update(data).digest("hex");
    const ddTempDir = path.join(os.tmpdir(), "doc-detective");
    const filePath = path.join(ddTempDir, `${hash}_${fileName}`);
    // Defense in depth: ensure the resolved path is still inside ddTempDir.
    const resolvedDir = path.resolve(ddTempDir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
      return {
        result: "error",
        message: new Error(
          `Refusing to write outside temp dir: ${resolvedFile}`
        ),
      };
    }
    if (!fs.existsSync(ddTempDir)) {
      fs.mkdirSync(ddTempDir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, data);
    }
    return { result: "success", path: filePath };
  } catch (error) {
    return { result: "error", message: error };
  }
}

async function outputResults(path: string, results: any, config: any) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFileSync(path, data);
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", `See results at ${path}`);
  log(config, "info", "Cleaning up and finishing post-processing.");
}

/**
 * Loads environment variables from a specified .env file.
 *
 * @async
 * @param {string} envsFile - Path to the environment variables file.
 * @returns {Promise<Object>} An object containing the operation result.
 * @returns {string} returns.status - "PASS" if environment variables were loaded successfully, "FAIL" otherwise.
 * @returns {string} returns.description - A description of the operation result.
 */
async function loadEnvs(envsFile: string) {
  const fileExists = fs.existsSync(envsFile);
  if (fileExists) {
    const { default: dotenv } = await import("dotenv");
    dotenv.config({ path: envsFile, override: true });
    return { status: "PASS", description: "Envs set." };
  } else {
    return { status: "FAIL", description: "Invalid file." };
  }
}

async function log(config: any, level: string, message?: any) {
  if (message === undefined) {
    // 2-arg form: log(message, level)
    message = config;
    config = {};
  }
  let logLevelMatch = false;
  if (config.logLevel === "error" && level === "error") {
    logLevelMatch = true;
  } else if (
    config.logLevel === "warning" &&
    (level === "error" || level === "warning")
  ) {
    logLevelMatch = true;
  } else if (
    config.logLevel === "info" &&
    (level === "error" || level === "warning" || level === "info")
  ) {
    logLevelMatch = true;
  } else if (
    config.logLevel === "debug" &&
    (level === "error" ||
      level === "warning" ||
      level === "info" ||
      level === "debug")
  ) {
    logLevelMatch = true;
  }

  if (logLevelMatch) {
    if (typeof message === "string") {
      let logMessage = `(${level.toUpperCase()}) ${message}`;
      console.log(logMessage);
    } else if (typeof message === "object") {
      let logMessage = `(${level.toUpperCase()})`;
      console.log(logMessage);
      console.log(JSON.stringify(message, null, 2));
    }
  }
}

// --- context `requires` gate ---------------------------------------------
// Evaluates a context's `requires` capability gate (context_v3.requires):
// `"node"` → `["node","ffmpeg"]` → `{ commands, files, env }`. All entries are
// AND-ed; any miss marks the context SKIPPED (same non-failing outcome as a
// `platforms` mismatch). Deps are injectable so tests never touch the real
// PATH/fs/env.

type RequirementDeps = {
  env?: Record<string, string | undefined>;
  existsSync?: (candidate: string) => boolean;
  commandExists?: (command: string) => boolean;
  platform?: NodeJS.Platform;
};

// Look up an env var's value. On Windows env vars are case-insensitive and may
// surface under a different case (e.g. `Path` for `PATH`), so fall back to a
// case-insensitive scan there — mirroring commandOnPath's PATH/Path handling.
// Elsewhere the lookup stays exact.
function lookupEnvValue(
  env: Record<string, string | undefined>,
  name: string,
  platform: NodeJS.Platform
): string | undefined {
  const direct = env[name];
  if (direct !== undefined) return direct;
  if (platform === "win32") {
    const lower = name.toLowerCase();
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === lower) return env[key];
    }
  }
  return undefined;
}

// Trim and drop empty/non-string entries — defense-in-depth mirroring the
// multi-value flag convention; AJV enforces the same shape for schema users.
function cleanRequirementList(list: any): string[] {
  const asArray = Array.isArray(list)
    ? list
    : typeof list === "string"
      ? [list]
      : [];
  return asArray
    .filter((entry: any) => typeof entry === "string")
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);
}

// Expand $VAR tokens against an injected env. `$HOME` falls back to
// `USERPROFILE` (Windows shells often set only the latter). Unknown variables
// stay literal so the file check fails visibly rather than silently matching.
function expandRequirementPath(
  entry: string,
  env: Record<string, string | undefined>
): string {
  return entry.replace(/\$[A-Za-z0-9_]+/g, (token) => {
    const name = token.substring(1);
    const value =
      env[name] ?? (name === "HOME" ? env.USERPROFILE : undefined);
    return value !== undefined && value !== "" ? value : token;
  });
}

// Cross-platform "is this command on the PATH" without spawning a shell.
// Honors PATHEXT on Windows (e.g. `adb` → `adb.exe`); an entry containing a
// path separator is checked directly instead of scanned for.
function commandOnPath(
  command: string,
  env: Record<string, string | undefined>,
  existsSync: (candidate: string) => boolean
): boolean {
  const hasSeparator = command.includes("/") || command.includes("\\");
  const pathValue = env.PATH ?? env.Path ?? "";
  const directories = hasSeparator
    ? [""]
    : pathValue.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
      : [""];
  for (const directory of directories) {
    const base = hasSeparator ? command : path.join(directory, command);
    for (const extension of extensions) {
      if (existsSync(base + extension)) return true;
    }
  }
  return false;
}

function evaluateContextRequirements({
  requires,
  deps = {},
}: {
  requires: any;
  deps?: RequirementDeps;
}): { met: boolean; missing: string[] } {
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const existsSync = deps.existsSync ?? fs.existsSync;
  const platform = deps.platform ?? process.platform;
  const commandExists =
    deps.commandExists ??
    ((command: string) => commandOnPath(command, env, existsSync));

  const isObjectForm =
    requires &&
    typeof requires === "object" &&
    !Array.isArray(requires);
  const commands = cleanRequirementList(
    isObjectForm ? requires.commands : requires
  );
  const files = cleanRequirementList(isObjectForm ? requires.files : []);
  const envVars = cleanRequirementList(isObjectForm ? requires.env : []);

  const missing: string[] = [];
  for (const command of commands) {
    if (!commandExists(command)) missing.push(`command "${command}"`);
  }
  for (const file of files) {
    if (!existsSync(expandRequirementPath(file, env)))
      missing.push(`file "${file}"`);
  }
  for (const name of envVars) {
    const value = lookupEnvValue(env, name, platform);
    if (value === undefined || value === "")
      missing.push(`environment variable "${name}"`);
  }
  return { met: missing.length === 0, missing };
}

function replaceEnvs(stringOrObject: any): any {
  if (!stringOrObject) return stringOrObject;
  if (typeof stringOrObject === "object") {
    // Iterate through object and recursively resolve variables
    Object.keys(stringOrObject).forEach((key) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return;
      // Resolve all variables in key value
      stringOrObject[key] = replaceEnvs(stringOrObject[key]);
    });
  } else if (typeof stringOrObject === "string") {
    // Load variable from string. The trailing `(?![a-zA-Z0-9_$])` guard means
    // a `$NAME$` token (a dollar on BOTH sides — the `$KEY$` special-key /
    // device-key sentinel vocabulary, e.g. `$HOME$`, `$ENTER$`) is never
    // treated as an env-var reference. Without it, `$HOME$` matched the
    // `$HOME` prefix and — on any host where $HOME is set (every Unix box) —
    // got rewritten to the home path, corrupting the sentinel. A real env ref
    // is `$NAME` NOT followed by another `$` (or word char).
    const variableRegex = new RegExp(/\$[a-zA-Z0-9_]+(?![a-zA-Z0-9_$])/, "g");
    const matches = stringOrObject.match(variableRegex);
    // If no matches, return string
    if (!matches) return stringOrObject;
    // Iterate matches
    matches.forEach((match) => {
      // Check if is declared variable
      let value: any = process.env[match.substring(1)];
      if (value) {
        // If match is the entire string instead of just being a substring, try to convert value to object
        try {
          if (
            match.length === stringOrObject.length &&
            typeof JSON.parse(value) === "object"
          ) {
            value = JSON.parse(value);
          }
        } catch {}
        // Attempt to load additional variables in value
        value = replaceEnvs(value);
        // Replace match with variable value
        if (typeof value === "string") {
          // Replace match with value. Supports whole- and sub-string matches.
          stringOrObject = stringOrObject.replace(match, value);
        } else if (typeof value === "object") {
          // If value is an object, replace match with object
          stringOrObject = value;
        }
      }
    });
  }
  return stringOrObject;
}

// Filesystem-safe instant token, matching the `doc-detective debug` dump's
// file naming (`debug-<timestamp>`): an ISO-8601 string with the `:` and `.`
// (illegal/awkward in filenames, notably on Windows) replaced by `-`, e.g.
// `2026-06-14T16-18-00-113Z`. Millisecond precision keeps per-run folders
// distinct; the run-folder caller still suffixes on the rare same-ms clash.
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Memoize one timestamp per run on the config object so every URL-referenced
// screenshot in a single run lands in the same folder.
function getOrInitRunTimestamp(config: any): string {
  if (!config) return timestamp();
  if (!config.__runTimestamp) {
    config.__runTimestamp = timestamp();
  }
  return config.__runTimestamp;
}

// Per-run artifact directory: `<output>/.doc-detective/runs/<runId>/`, where
// runId is the run timestamp — plus an ordinal suffix (`-2`, `-3`, …) on the
// rare same-millisecond collision, so the effective runId stamped in the
// report can carry that suffix. `runs/` is the REST-style collection segment;
// nested resources (specs/tests/contexts) hang off the run folder. Memoized on
// the config object so auto screenshots and the runFolder reporter all land in
// the same folder for the duration of a run. If `config.output` points at a
// report file (reporters accept `.json`/`.html` paths), the run folder is
// created next to it.
//
// When `create` is true, creation is atomic (non-recursive mkdir, EEXIST →
// ordinal suffix) so two runs starting in the same millisecond each reserve
// their own folder instead of silently merging artifacts. `create: false`
// only resolves and memoizes the path without touching disk — used by runs
// that won't write any artifacts (see runArchivesArtifacts / runSpecs). Any
// run that *does* write reserves the folder atomically on its first call here,
// so the non-atomic memoized branch below is never the one racing.
function getRunOutputDir(
  config: any,
  { create = true }: { create?: boolean } = {}
): string {
  if (config?.__runOutputDir) {
    // The path was decided (and, if a writer asked, atomically reserved) on a
    // prior call. A recursive mkdir here is safe: either the folder already
    // exists, or this is the first writer after a non-writing run deferred
    // creation — in which case nothing else is racing this path.
    if (create) fs.mkdirSync(config.__runOutputDir, { recursive: true });
    return config.__runOutputDir;
  }
  // Coerce defensively: a programmatic caller could hand us a non-string
  // output (e.g. a PathLike), and the extension check / path ops below assume
  // a string. Mirrors the String() coercion in runFolderReporter.
  let base = String(config?.output || ".");
  const reportFileExtensions = [".json", ".html", ".htm"];
  if (reportFileExtensions.some((ext) => base.toLowerCase().endsWith(ext))) {
    base = path.dirname(base);
  }
  const runsRoot = path.resolve(base, ".doc-detective", "runs");
  const runId = getOrInitRunTimestamp(config);
  let dir = path.join(runsRoot, runId);
  // create: false just resolves and memoizes the path — no folder is left on
  // disk. A run that neither archives results (runFolder reporter) nor writes
  // auto screenshots has nothing to put here, so creating it would only leave
  // an empty `.doc-detective/runs/<id>/` behind. The eager-creation branch
  // below still runs for the writers, and a later create:true call (via the
  // memoized branch above) materializes the folder if a write does occur.
  if (create) {
    fs.mkdirSync(runsRoot, { recursive: true });
    let suffix = 2;
    // Non-recursive mkdir is the reservation: it throws EEXIST if another
    // process already claimed the name, closing the check-then-create race an
    // existsSync loop would leave open.
    for (;;) {
      try {
        fs.mkdirSync(dir);
        break;
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        dir = path.join(runsRoot, `${runId}-${suffix++}`);
      }
    }
  }
  if (config) config.__runOutputDir = dir;
  return dir;
}

// Whether a run will write anything into its per-run artifact folder
// (`<output>/.doc-detective/runs/<id>/`). The folder holds runFolder reporter
// archives, autoScreenshot images, and autoRecord videos, so when none is
// active the runner skips creating it (see runSpecs) instead of leaving an
// empty folder behind.
//
// autoScreenshot can be set globally on the config or per spec/test. When the
// resolved `specs` are available, decide exactly as resolveAutoScreenshot does
// — `Boolean(test ?? spec ?? config)`, test > spec > config — for *each*
// selected test, so a per-test `false` that overrides a global `true` is
// respected (no eager folder for a run where every test disables screenshots)
// and a truthy non-boolean from an API caller still counts. Without specs
// (programmatic/early callers), fall back to the global flag, Boolean-coerced.
//
// The reporter gate mirrors outputResults *exactly* so the gate never reserves
// a folder the reporter won't write to (which would leave it empty). Like
// outputResults: a non-empty `reporters` array is the override, otherwise the
// default set (`["terminal", "json", "runFolder"]`) applies; tokens are matched
// verbatim (no trimming — outputResults doesn't trim, so a padded `" runFolder "`
// runs no reporter); the `runFolder` shorthand matches case-insensitively (its
// switch lowercases) and the internal `runFolderReporter` key matches verbatim
// (its default branch passes the token straight to the reporters map);
// non-string (e.g. function) reporters are not the runFolder reporter.
function runArchivesArtifacts(config: any = {}, specs: any[] = []): boolean {
  const list = Array.isArray(specs) ? specs : [];
  if (list.length > 0) {
    // autoScreenshot images and autoRecord videos both land in the run folder.
    // Resolve each exactly as resolveAutoScreenshot/resolveAutoRecord do
    // (test > spec > config) per selected test, so a per-test `false` that
    // overrides a global `true` is respected.
    const writesArtifact = list.some((spec: any) =>
      (spec?.tests ?? []).some(
        (test: any) =>
          Boolean(
            test?.autoScreenshot ??
              spec?.autoScreenshot ??
              config?.autoScreenshot
          ) ||
          Boolean(test?.autoRecord ?? spec?.autoRecord ?? config?.autoRecord)
      )
    );
    if (writesArtifact) return true;
  } else if (Boolean(config?.autoScreenshot) || Boolean(config?.autoRecord)) {
    return true;
  }
  const active =
    Array.isArray(config?.reporters) && config.reporters.length > 0
      ? config.reporters
      : ["terminal", "json", "runFolder"];
  return active.some(
    (reporter: any) =>
      typeof reporter === "string" &&
      (reporter.toLowerCase() === "runfolder" ||
        reporter === "runFolderReporter")
  );
}

// Perform a native command in the current working directory.
/**
 * Executes a command in a child process using the `spawn` function from the `child_process` module.
 * @param {string} cmd - The command to execute.
 * @param {string[]} args - The arguments to pass to the command.
 * @param {object} options - The options for the command execution.
 * @param {boolean} options.workingDirectory - Directory in which to execute the command.
 * @param {boolean} options.debug - Whether to enable debug mode.
 * @returns {Promise<object>} A promise that resolves to an object containing the stdout, stderr, and exit code of the command.
 */
async function spawnCommand(cmd: string, args: string[] = [], options: any = {}) {
  // Set spawnOptions based on OS
  const spawnOptions: any = {
    shell: true,
  };
  if (process.platform === "win32") {
    spawnOptions.windowsHide = true;
  }
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  // `shell: true` is intentional and by design (see spawnBackgroundCommand for
  // the full rationale). `spawnCommand` runs the exact shell command an author
  // writes in a test spec (`runShell`, `runCode`'s shell backend) or a fixed
  // internal probe (`dita --version`, the Safari version probe) — pipes, `&&`,
  // globbing, and redirection are the FEATURE, not an injection sink. The
  // command string is author-controlled test content, never untrusted external
  // input, so switching to an arg-array / execFile form would break the
  // contract. CodeQL "unsafe shell command" here is acknowledged and dismissed
  // as won't-fix / by design.
  const runCommand = spawn(cmd, args, spawnOptions);
  runCommand.on("error", (error) => {});

  // Set up exit code promise BEFORE consuming streams to avoid race condition
  const exitCodePromise = new Promise((resolve) => {
    runCommand.on("close", resolve);
  });

  // Capture stdout and stderr concurrently to avoid deadlock
  let stdout = "";
  let stderr = "";
  const stdoutPromise = (async () => {
    for await (const chunk of runCommand.stdout) {
      stdout += chunk;
      if (options.debug) console.log(chunk.toString());
    }
  })();
  const stderrPromise = (async () => {
    for await (const chunk of runCommand.stderr) {
      stderr += chunk;
      if (options.debug) console.log(chunk.toString());
    }
  })();
  await Promise.all([stdoutPromise, stderrPromise]);
  // Remove trailing newlines
  stdout = stdout.replace(/\n$/, "");
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await exitCodePromise;

  return { stdout, stderr, exitCode };
}

async function inContainer() {
  if (process.env.IN_CONTAINER === "true") return true;
  if (process.platform === "linux") {
    const result = await spawnCommand(
      `grep -sq "docker\|lxc\|kubepods" /proc/1/cgroup`
    );
    if (result.exitCode === 0) return true;
  }
  return false;
}

/**
 * Calculates the fractional difference between two strings using Levenshtein distance.
 * @param {string} text1 - First string to compare
 * @param {string} text2 - Second string to compare
 * @returns {number} Fractional difference between 0 and 1, where 0 means identical
 *                   and 1 means completely different. Compare against maxVariation
 *                   thresholds directly (e.g., 0.1 for 10% tolerance).
 */
function calculateFractionalDifference(text1: string, text2: string) {
  const distance = llevenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  if (maxLength === 0) return 0; // Both strings are empty
  const fractionalDiff = distance / maxLength;
  return fractionalDiff;
}

/**
 * Serialize the value returned by a browser script into a string for assertion
 * and snapshotting. Strings pass through unchanged; other primitives and `null`
 * go through `String(value)` (preserving `NaN`/`Infinity`/`BigInt`, which JSON
 * would coerce or throw on); objects and arrays are JSON-serialized, falling
 * back to `String(value)` for circular or otherwise unserializable structures
 * so the result is always a usable string.
 *
 * @param {unknown} value - The raw return value from `driver.execute`.
 * @returns {string} A string representation suitable for substring/regex
 *                   matching and writing to a snapshot file.
 */
function serializeBrowserResult(value: unknown): string {
  if (typeof value === "string") return value;
  // Primitives (number, boolean, bigint, symbol, undefined) and null go through
  // String(): it preserves values like NaN/Infinity/BigInt that JSON.stringify
  // would coerce to "null", drop to undefined, or throw on.
  if (value === null || typeof value !== "object") return String(value);
  // Objects and arrays serialize to JSON, falling back to String() for
  // circular or otherwise unserializable structures.
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/**
 * Test whether a serialized value contains the expected output. Mirrors the
 * `runShell`/`runCode` `stdio` matching contract: when `expected` starts and
 * ends with `/`, the inner text is treated as a regular expression; otherwise
 * it's a plain substring match.
 *
 * @param {string} serialized - The serialized script result.
 * @param {string} expected - Expected content; a `/pattern/` regex or a literal substring.
 * @returns {boolean} `true` when the expected content is found.
 */
function matchesExpectedOutput(serialized: string, expected: string): boolean {
  if (expected.startsWith("/") && expected.endsWith("/")) {
    try {
      const regex = new RegExp(expected.slice(1, -1));
      return regex.test(serialized);
    } catch {
      // Malformed regex pattern — treat as a normal mismatch instead of
      // letting the SyntaxError abort the step.
      return false;
    }
  }
  return serialized.includes(expected);
}

function llevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const arr: number[][] = [];

  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
  }

  for (let j = 0; j <= s.length; j++) {
    arr[0][j] = j;
  }

  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = Math.min(
        arr[i - 1][j] + 1, // deletion
        arr[i][j - 1] + 1, // insertion
        arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1) // substitution
      );
    }
  }

  return arr[t.length][s.length];
}
