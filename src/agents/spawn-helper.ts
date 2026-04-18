import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Build a single cmd.exe-safe command line from (cmd, args). We wrap each
 * piece in double quotes and escape embedded quotes with `\"` so cmd.exe
 * receives the arg verbatim. Chose this shape because Node 22+'s DEP0190
 * deprecates spawn(cmd, args[], {shell:true}) — joining args without
 * escaping — but `spawn(<single string>, [], {shell:true})` stays
 * supported. Only caret-escape cmd.exe metacharacters (`&|<>^`) when they
 * appear unquoted; inside double quotes cmd.exe treats them literally.
 */
function winCommandLine(cmd: string, args: string[]): string {
  const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  return [cmd, ...args].map(quote).join(" ");
}

/**
 * Spawn a command and resolve with its stdout/stderr/exit code. Unlike the
 * shared `spawnCommand` in src/utils.ts, this helper attaches an `error`
 * listener so that ENOENT (binary not on PATH) rejects the promise cleanly
 * instead of crashing the process. That matters for adapters that probe for
 * optional binaries (`copilot`, `gemini`, `codex`).
 */
export function safeSpawn(cmd: string, args: string[] = []): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (err: Error | null, result?: SpawnResult) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result!);
    };

    try {
      // Close the child's stdin with `ignore` so any interactive prompt in
      // the target tool (for example, `qwen extensions install` asking for
      // consent despite `--consent`) fails fast with EOF instead of hanging
      // indefinitely in CI / non-TTY contexts. We capture stdout/stderr via
      // pipes so the caller can still surface output/errors.
      //
      // On Windows, npm installs globally-linked binaries as `.cmd` / `.ps1`
      // shims (so `qwen` on disk is actually `qwen.cmd`). Without
      // `shell: true`, Node's spawn resolves only exact filenames — it can't
      // see `.cmd` extensions and ENOENTs even when the binary works fine
      // from PowerShell / cmd. We therefore enable the shell on win32 so
      // cmd.exe resolves PATHEXT extensions the same way the user's
      // terminal does. Node 22+ deprecates `spawn(cmd, args, {shell: true})`
      // (DEP0190) because args are joined without escaping, so on win32 we
      // instead build a single pre-quoted command line and pass it as the
      // `cmd` argument with `shell: true`. All callers pass hardcoded
      // strings, so shell-injection isn't a risk.
      const onWindows = process.platform === "win32";
      const spawnCmd = onWindows ? winCommandLine(cmd, args) : cmd;
      const spawnArgs = onWindows ? [] : args;
      const child = spawn(spawnCmd, spawnArgs, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: onWindows,
      });
      child.on("error", (err) => finish(err));
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("close", (code, signal) => {
        // `code === null` means the child was killed by a signal. Surface that
        // as a non-zero exit code (and annotate stderr) so callers that only
        // inspect exitCode still detect failure.
        const exitCode = code !== null ? code : 1;
        const signalNote = signal ? `\n[terminated by signal ${signal}]` : "";
        finish(null, {
          // Strip `\r?\n` so Windows CLIs that emit CRLF don't leave a
          // stray `\r` in captured output (breaks log comparisons and
          // produces mystery `^M` glyphs in terminal output).
          stdout: stdout.replace(/\r?\n$/, ""),
          stderr: (stderr + signalNote).replace(/\r?\n$/, ""),
          exitCode,
        });
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
