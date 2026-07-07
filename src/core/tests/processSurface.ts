import {
  spawnBackgroundCommand,
  spawnPtyBackgroundCommand,
  waitForReady,
} from "../utils.js";
import kill from "tree-kill";

export { startBackgroundProcessSurface };
export type { ProcessSurfaceDescriptor };

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
}: {
  config: any;
  descriptor: ProcessSurfaceDescriptor;
  processRegistry?: Map<string, any>;
  driver?: any;
}): Promise<{ status: string; description: string; outputs?: any }> {
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

  // Only node-pty's ABSENCE is a graceful SKIP (keeps fixtures
  // PASS/SKIPPED). Any other startup error (bad cwd, PTY spawn failure, …)
  // must FAIL so it isn't hidden as optional-dependency absence.
  let bg: any;
  if (descriptor.tty) {
    try {
      bg = await spawnPtyBackgroundCommand(descriptor.command, args, {
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
    bg = spawnBackgroundCommand(descriptor.command, args, bgOptions);
  }

  // Register before awaiting readiness so the run-end sweep can kill the
  // process even if it never becomes ready.
  const entry: any = { name, bg };
  processRegistry.set(name, entry);

  try {
    await waitForReady(bg, descriptor.waitUntil, { timeoutMs });
  } catch (error: any) {
    // Readiness failed (timeout or the process exited) — kill and deregister
    // so a half-started process doesn't leak. PTY-backed handles own their own
    // termination via `kill()`; pipe-backed ones tree-kill the process tree.
    // Await either so the process is actually gone before the step returns.
    if (bg.kill) {
      await bg.kill();
    } else if (bg.pid) {
      await new Promise<void>((resolve) =>
        kill(bg.pid!, "SIGTERM", () => resolve())
      );
    }
    processRegistry.delete(name);
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
