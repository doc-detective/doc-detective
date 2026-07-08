import {
  spawnBackgroundCommand,
  spawnPtyBackgroundCommand,
  waitForReady,
  isTransientProcessInitError,
} from "../utils.js";
import kill from "tree-kill";

export { startBackgroundProcessSurface };
export type { ProcessSurfaceDescriptor };

// Bounded retry for a transient concurrent-spawn init crash (win32). Total
// attempts = 1 initial + (PROCESS_INIT_RETRIES) retries. A small linear backoff
// (matching driverStart's 500ms * attempt) lets the transient Windows
// loader/console contention clear before the fresh spawn.
const PROCESS_INIT_RETRIES = 2;
const PROCESS_INIT_RETRY_BACKOFF_MS = 500;

// Seam for tests + defense-in-depth: the launcher reads its spawn/readiness
// helpers and platform from here so a unit test can drive a deterministic
// transient-then-success sequence without racing real Windows processes. In
// production every field defaults to the real implementation, so the runtime
// path is unchanged.
interface ProcessSurfaceDeps {
  spawnBackgroundCommand: typeof spawnBackgroundCommand;
  spawnPtyBackgroundCommand: typeof spawnPtyBackgroundCommand;
  waitForReady: typeof waitForReady;
  isTransientProcessInitError: (message?: string, platform?: string) => boolean;
  platform: string;
  sleep: (ms: number) => Promise<void>;
}

function defaultProcessSurfaceDeps(): ProcessSurfaceDeps {
  return {
    spawnBackgroundCommand,
    spawnPtyBackgroundCommand,
    waitForReady,
    isTransientProcessInitError,
    platform: process.platform,
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

// The one background-process launcher (multi-surface Phase 6). Both entry
// points delegate here so the semantics can't drift: `runShell`/`runCode`
// with a `background` object, and `startSurface`'s process descriptor.
// Spawn → register → wait for readiness → kill + deregister on failure.
interface ProcessSurfaceDescriptor {
  // Shell command, same semantics as runShell (shell: true by contract).
  command: string;
  // Registry name — required: background commands are generic interpreters
  // (`node`, `docker`) where a derived default would collide.
  name: string;
  args?: string[];
  workingDirectory?: string;
  // Spawn under a pseudo-terminal (node-pty) so full-screen/interactive TUIs
  // render. node-pty is an optional heavy dep; only its ABSENCE is a SKIP.
  tty?: boolean;
  // Readiness condition (port/stdio/httpGet/delayMs), executed by
  // waitForReady. No condition = ready as soon as the process spawns.
  waitUntil?: any;
  // Readiness ceiling in milliseconds.
  timeout?: number;
}

async function startBackgroundProcessSurface({
  config,
  descriptor,
  processRegistry,
  driver,
  deps,
}: {
  config: any;
  descriptor: ProcessSurfaceDescriptor;
  processRegistry?: Map<string, any>;
  driver?: any;
  deps?: Partial<ProcessSurfaceDeps>;
}): Promise<{ status: string; description: string; outputs?: any }> {
  const d: ProcessSurfaceDeps = { ...defaultProcessSurfaceDeps(), ...deps };
  const name = descriptor.name;
  // The schemas require `name`; this guard is defence-in-depth for
  // programmatic callers that construct descriptors without validating.
  if (!name) {
    return {
      status: "FAIL",
      description: "Background processes require a `name`.",
    };
  }
  if (!processRegistry) {
    // Without a registry there is no way to stop or sweep the process, so it
    // would leak. Fail fast rather than spawn an untrackable process.
    return {
      status: "FAIL",
      description:
        "Background processes aren't supported in this run mode (no process registry available).",
    };
  }
  if (processRegistry.has(name)) {
    return {
      status: "FAIL",
      description: `A background process named "${name}" is already running.`,
    };
  }
  // Cross-kind uniqueness (multi-surface Phase 4): a background process must
  // not reuse a name an open browser surface already holds. Otherwise a
  // bare-string `surface: "<name>"` would resolve registry-first to the
  // browser and the process would be unreachable by that name. The browser
  // side enforces the mirror of this at open time.
  if (driver?.state?.sessionRegistry?.sessions?.has(name)) {
    return {
      status: "FAIL",
      description: `A browser surface named "${name}" is already open in this context. Surface names must be unique across kinds; give the background process a different name.`,
    };
  }

  const bgOptions: any = {};
  if (descriptor.workingDirectory) bgOptions.cwd = descriptor.workingDirectory;
  const args = descriptor.args ?? [];
  const timeoutMs = descriptor.timeout ?? 60000;

  // Kill a spawned handle so a half-started/crashed process doesn't leak.
  // PTY-backed handles own their own termination via `kill()`; pipe-backed ones
  // tree-kill the process tree. Awaited so the process is actually gone before
  // the next retry spawns or the step returns.
  async function teardown(bg: any): Promise<void> {
    if (bg?.kill) {
      await bg.kill();
    } else if (bg?.pid) {
      await new Promise<void>((resolve) =>
        kill(bg.pid!, "SIGTERM", () => resolve())
      );
    }
  }

  // Spawn → wait for readiness, with a bounded retry that ONLY absorbs a
  // transient Windows concurrent-spawn init crash (STATUS_DLL_INIT_FAILED /
  // STATUS_CONTROL_C_EXIT — isTransientProcessInitError). This mirrors the
  // driverStart transient-session retry (ADR 01042): a child that dies during
  // init under `concurrentRunners > 1` contention is retried with a FRESH spawn
  // and a small backoff. A genuinely-broken command (any other exit / a
  // readiness timeout / a non-win32 platform) still fails fast after one
  // attempt, and `concurrentRunners: 1` never hits the retry path because the
  // transient codes don't occur without concurrent-spawn contention.
  const maxAttempts = PROCESS_INIT_RETRIES + 1;
  let lastReadyError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Only node-pty's ABSENCE is a graceful SKIP (keeps fixtures
    // PASS/SKIPPED). Any other startup error (bad cwd, PTY spawn failure, …)
    // must FAIL so it isn't hidden as optional-dependency absence.
    let bg: any;
    if (descriptor.tty) {
      try {
        bg = await d.spawnPtyBackgroundCommand(descriptor.command, args, {
          ...bgOptions,
          cacheDir: config?.cacheDir,
        });
      } catch (error: any) {
        if (error?.code !== "NODE_PTY_UNAVAILABLE") {
          return {
            status: "FAIL",
            description: `Failed to start PTY background process "${name}": ${error.message}`,
          };
        }
        return {
          status: "SKIPPED",
          description: `PTY background requires the optional \`node-pty\` dependency, which isn't available: ${error.message}`,
        };
      }
    } else {
      bg = d.spawnBackgroundCommand(descriptor.command, args, bgOptions);
    }

    // Register before awaiting readiness so the run-end sweep can kill the
    // process even if it never becomes ready.
    const entry: any = { name, bg };
    processRegistry.set(name, entry);

    try {
      await d.waitForReady(bg, descriptor.waitUntil, { timeoutMs });
    } catch (error: any) {
      lastReadyError = error;
      // Kill + deregister the crashed handle before deciding whether to retry.
      await teardown(bg);
      processRegistry.delete(name);
      // Retry only a transient win32 init crash, and only within the bound; a
      // fresh spawn on the next attempt clears the contention in practice.
      if (
        attempt < maxAttempts &&
        d.isTransientProcessInitError(error?.message, d.platform)
      ) {
        await d.sleep(PROCESS_INIT_RETRY_BACKOFF_MS * attempt);
        continue;
      }
      return {
        status: "FAIL",
        description: `Background process "${name}" failed to become ready: ${error.message}`,
      };
    }

    return {
      status: "PASS",
      description: `Started background process "${name}".`,
      outputs: {
        pid: String(bg.pid ?? ""),
        name,
        ready: "true",
      },
    };
  }

  // Exhausted the retry bound while every attempt crashed transiently.
  return {
    status: "FAIL",
    description: `Background process "${name}" failed to become ready: ${lastReadyError?.message}`,
  };
}
