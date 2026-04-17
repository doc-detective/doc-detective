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
      const child = spawn(cmd, args, { env: process.env });
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
          stdout: stdout.replace(/\n$/, ""),
          stderr: (stderr + signalNote).replace(/\n$/, ""),
          exitCode,
        });
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
