// Worker-thread half of the ConPTY watchdog (issue #501, ADR 01024). Runs in
// the SAME process as the runner (worker threads share the process's state and
// console attachment), so a throwaway ConPTY allocation here exercises the
// conditions the real spawn would hit — where a child process, with its own
// fresh state, could report a false "healthy".
//
// Protocol: post exactly one message to the parent.
//   { ok: true }            — a throwaway ConPTY allocated and exited: healthy.
//   { ok: false, error }    — the backend couldn't load or the spawn threw.
// If the allocation WEDGES (the #501 failure), `pty.spawn`/`onExit` never
// returns and this worker posts nothing — the parent's timeout declares it
// "wedged" and terminates the worker.

import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

async function main(): Promise<void> {
  const { ptyModulePath } = (workerData ?? {}) as { ptyModulePath?: string };
  if (!ptyModulePath) {
    parentPort?.postMessage({ ok: false, error: "no ptyModulePath provided" });
    return;
  }

  // node-pty is native/CJS; dynamic-import it by absolute path. `.spawn` may be
  // on the namespace or under `default` depending on interop.
  const mod: any = await import(pathToFileURL(ptyModulePath).href);
  const pty: any = typeof mod?.spawn === "function" ? mod : mod?.default;
  if (!pty || typeof pty.spawn !== "function") {
    parentPort?.postMessage({
      ok: false,
      error: "node-pty module has no spawn()",
    });
    return;
  }

  const isWin = process.platform === "win32";
  const shell = isWin ? process.env.ComSpec || "cmd.exe" : "/bin/sh";
  // A command that exits immediately — we only care that the PTY allocates.
  const args = isWin ? ["/d", "/s", "/c", "exit"] : ["-c", "exit 0"];

  const ptyProcess = pty.spawn(shell, args, {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });

  let posted = false;
  const post = (msg: any) => {
    if (posted) return;
    posted = true;
    try {
      ptyProcess.kill();
    } catch {
      // best-effort — it may already have exited
    }
    parentPort?.postMessage(msg);
  };

  ptyProcess.onExit(() => post({ ok: true }));
}

main().catch((error: any) => {
  parentPort?.postMessage({ ok: false, error: String(error?.message ?? error) });
});
