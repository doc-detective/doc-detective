import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
      // the target tool (e.g., `qwen extensions install` asking for consent
      // despite `--consent`) fails fast with EOF instead of hanging
      // indefinitely in CI / non-TTY contexts. We capture stdout/stderr via
      // pipes so the caller can still surface output/errors.
      const child = spawn(cmd, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
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
