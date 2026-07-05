// ConPTY allocation watchdog (issue #501).
//
// On a Windows service-session runner, a prior native app-surface (NovaWindows)
// context in the SAME process can leave the console subsystem unable to
// allocate a new pseudo-terminal. The next `pty.spawn` then blocks the libuv
// event loop FOREVER — both concurrent runners go silent at once and the job
// dies at its timeout. Because the block is a *synchronous* native call, a
// same-thread `Promise.race([spawn, setTimeout])` cannot rescue it: the timer
// callback never fires while the loop is wedged.
//
// So the watchdog probes the allocation off the main thread, in a WORKER
// THREAD. A worker shares this process's console subsystem (same conhost
// attachment), so it reproduces the exact poison a *child process* would not
// (a fresh process has its own healthy console — it would give a false
// "healthy"). The probe spawns a throwaway ConPTY that exits immediately:
//
//   - it exits fast              → console is healthy   → "healthy"
//   - the worker errors / can't
//     host the native addon      → probe inconclusive   → "inconclusive"
//   - no response within budget  → the #501 freeze      → "wedged"
//
// Only "wedged" (a genuine timeout) is treated as a reason to SKIP the step.
// "inconclusive" falls through to the direct spawn, so a platform where workers
// can't host node-pty behaves exactly as before — the happy path can never
// regress; the watchdog only ever converts an otherwise-infinite freeze into a
// bounded, observable outcome.

import fs from "node:fs";
import { Worker } from "node:worker_threads";

/** Default wall-clock budget for the ConPTY probe. A healthy allocation
 * returns in well under a second; 15s is generous headroom that still bounds
 * the freeze. Overridable via env for tests (and as an escape hatch). */
export const PTY_PROBE_TIMEOUT_MS =
  Number(process.env.DOC_DETECTIVE_PTY_PROBE_TIMEOUT_MS) || 15000;

export type PtyProbeOutcome = "healthy" | "inconclusive" | "wedged";

export interface PtyProbeResult {
  outcome: PtyProbeOutcome;
  /** Human-readable context for logs / the SKIP message. */
  detail?: string;
}

/** Minimal surface of a worker the probe drives. `node:worker_threads`'s
 * `Worker` satisfies it; tests inject a fake. */
export interface ProbeWorkerLike {
  on(event: "message", cb: (msg: any) => void): void;
  on(event: "error", cb: (err: any) => void): void;
  on(event: "exit", cb: (code: number) => void): void;
  terminate(): Promise<number> | void;
}

function defaultCreateWorker(data: { ptyModulePath: string }): ProbeWorkerLike {
  // ptyProbeWorker.js sits next to this module in dist/core/.
  const url = new URL("./ptyProbeWorker.js", import.meta.url);
  return new Worker(url, { workerData: data });
}

/**
 * Probe whether a new ConPTY can be allocated in this process without wedging.
 * Never rejects — every failure mode maps to an outcome the caller can act on.
 *
 * @param opts.ptyModulePath Absolute path to the node-pty backend the worker
 *   should load (resolved on the main thread; the worker can't run the async
 *   heavy-dep resolver itself).
 * @param opts.timeoutMs Budget before a non-responding probe is declared
 *   "wedged". Defaults to {@link PTY_PROBE_TIMEOUT_MS}.
 * @param opts.createWorker Injectable worker factory (tests).
 */
export function probePtyAllocation(opts: {
  ptyModulePath: string;
  timeoutMs?: number;
  createWorker?: (data: { ptyModulePath: string }) => ProbeWorkerLike;
}): Promise<PtyProbeResult> {
  const timeoutMs = opts.timeoutMs ?? PTY_PROBE_TIMEOUT_MS;
  const createWorker = opts.createWorker ?? defaultCreateWorker;

  let worker: ProbeWorkerLike;
  try {
    worker = createWorker({ ptyModulePath: opts.ptyModulePath });
  } catch (error: any) {
    // Couldn't even start a worker (workers disabled, out of threads). That's
    // not the freeze — never report "wedged" here; fall through to the direct
    // spawn.
    return Promise.resolve({
      outcome: "inconclusive",
      detail: `worker-unavailable: ${error?.message ?? error}`,
    });
  }

  return new Promise<PtyProbeResult>((resolve) => {
    let settled = false;
    const terminate = () => {
      // Fire-and-forget: a worker wedged in a synchronous native call may not
      // stop promptly, and the main thread must never block on it. A leaked
      // worker thread is reaped at process exit — strictly better than a frozen
      // run.
      try {
        Promise.resolve(worker.terminate()).catch(() => {});
      } catch {
        // terminate() may throw if the worker is already gone — ignore.
      }
    };
    const finish = (outcome: PtyProbeOutcome, detail?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ outcome, detail });
    };

    const timer = setTimeout(() => {
      // No verdict within budget == the #501 freeze signature.
      terminate();
      finish("wedged", `no response in ${timeoutMs}ms`);
    }, timeoutMs);
    // Don't let the watchdog timer itself keep the process alive.
    if (typeof (timer as any).unref === "function") (timer as any).unref();

    worker.on("message", (msg: any) => {
      terminate();
      if (msg && msg.ok === true) finish("healthy");
      else
        finish(
          "inconclusive",
          msg?.error ? String(msg.error) : "probe reported not-ok"
        );
    });
    worker.on("error", (err: any) => {
      // The worker threw (e.g. the native addon can't load in a worker). Not a
      // freeze — inconclusive, so the caller falls through to the direct spawn.
      finish("inconclusive", `worker-error: ${err?.message ?? err}`);
    });
    worker.on("exit", () => {
      // Exited without ever posting a verdict (load/spawn error path).
      finish("inconclusive", "worker exited without a result");
    });
  });
}

/**
 * Verify the PTY backend is PHYSICALLY on disk before any spawn, healing a
 * pruned install by force-reinstalling — issue #501's actual mechanism.
 *
 * A mid-run JIT `npm install` of another heavy dep used to prune node-pty's
 * files from the runtime cache while the module stayed loaded (the OS-locked
 * .node binary survives; the JS support files node-pty needs at spawn time do
 * not). The stale resolution + ESM caches then serve the in-memory module
 * without touching disk, and the next `pty.spawn` freezes the process inside
 * a native wait. So "the module loaded" is NOT sufficient — the resolved path
 * must exist on disk, and when it doesn't we reinstall (same paths → the
 * already-loaded module's support files are back) rather than proceed onto a
 * spawn we know can wedge. If the reinstall can't produce the files, throw
 * the `NODE_PTY_UNAVAILABLE`-tagged error so runShell degrades to SKIPPED.
 *
 * All collaborators are injectable for tests; `exists` defaults to
 * `fs.existsSync`.
 */
export async function ensurePtyBackendOnDisk(opts: {
  resolvePath: () => string | null;
  reinstall: () => Promise<void>;
  exists?: (p: string) => boolean;
}): Promise<string> {
  const exists = opts.exists ?? fs.existsSync;
  const first = opts.resolvePath();
  if (first && exists(first)) return first;
  try {
    await opts.reinstall();
  } catch (error: any) {
    const err: any = new Error(
      `The PTY backend's files are missing from the runtime cache (a JIT install of another dependency previously pruned them — doc-detective issue #501) and reinstalling failed: ${error?.message ?? error}. Skipping this \`tty\` background process.`
    );
    err.code = "NODE_PTY_UNAVAILABLE";
    throw err;
  }
  const healed = opts.resolvePath();
  if (healed && exists(healed)) return healed;
  const err: any = new Error(
    `The PTY backend's files are missing from the runtime cache (doc-detective issue #501) and did not materialize after a reinstall. Skipping this \`tty\` background process.`
  );
  err.code = "NODE_PTY_UNAVAILABLE";
  throw err;
}

/**
 * Windows-only gate for the `tty` spawn path. Probes ConPTY allocation and, if
 * it is wedged (the #501 freeze signature), throws a `NODE_PTY_UNAVAILABLE`-
 * tagged error so the caller (runShell) degrades the step to SKIPPED instead of
 * hanging. Returns (no-op) on non-Windows, when no backend path resolved, or
 * when the probe is healthy/inconclusive — the caller then proceeds to the
 * direct spawn.
 *
 * `platform` and `probe` are injectable so the gate is unit-testable on any host.
 */
export async function assertConptyAllocatable(opts: {
  ptyModulePath: string | null | undefined;
  platform?: string;
  probe?: (o: { ptyModulePath: string }) => Promise<PtyProbeResult>;
}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  if (platform !== "win32" || !opts.ptyModulePath) return;
  const probe = opts.probe ?? probePtyAllocation;
  const result = await probe({ ptyModulePath: opts.ptyModulePath });
  if (result.outcome === "wedged") {
    const err: any = new Error(
      `ConPTY allocation is wedged on this Windows environment (${result.detail}). This matches doc-detective issue #501: a native app-surface (NovaWindows) context in the same run can leave the console subsystem unable to allocate a new pseudo-terminal, which otherwise freezes the whole process. Skipping this \`tty\` background process instead of hanging the run.`
    );
    err.code = "NODE_PTY_UNAVAILABLE";
    throw err;
  }
}
