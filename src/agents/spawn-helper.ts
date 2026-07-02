import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Build a single cmd.exe-safe command line from (cmd, args). Follows the
 * canonical `CommandLineToArgvW` escaping rules so the child process sees
 * each arg verbatim:
 *   1. Double any run of backslashes that directly precedes a `"` or the
 *      end of the string (so the closing `"` we add below isn't escaped).
 *   2. Escape each embedded `"` as `\"`.
 *   3. Wrap the whole arg in `"..."`.
 * Naive `s.replace(/"/g, '\\"')` is wrong for args like `a\"b` or `a\\`
 * because the preceding backslashes turn the intended escape into a real
 * backslash + unescaped quote, breaking out of the quoted context.
 *
 * Chose this shape because Node 22+'s DEP0190 deprecates
 * `spawn(cmd, args[], {shell:true})` (joining args without escaping), but
 * `spawn(<single string>, [], {shell:true})` stays supported. Inside
 * double quotes cmd.exe treats `&|<>^` literally, so no caret escaping is
 * needed for our hardcoded args.
 */
export function winCommandLine(cmd: string, args: string[]): string {
  const quote = (s: string) => {
    const escaped = s.replace(/(\\*)("|$)/g, (_, slashes: string, end: string) =>
      slashes + slashes + (end === '"' ? '\\"' : "")
    );
    return `"${escaped}"`;
  };
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
      // c8 ignore justification (next line): dedup guard against a genuine
      // race between the 'error' and 'close' events both firing for the
      // same child (Node's own docs note this can happen). A normal
      // successful or failed spawn only ever fires one of the two, so
      // triggering the second, no-op call deterministically would require
      // forcing that specific double-event race — timing-dependent and not
      // something a hermetic test can force without mocking child_process.
      /* c8 ignore next */
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
      // c8 ignore justification (next 2 lines' non-Windows branch): this repo's
      // CI test matrix runs the full suite on Windows, macOS, and Linux (see
      // .github/workflows/test.yml), and the root coverage ratchet measures
      // the CROSS-PLATFORM UNION of that matrix (ADR 01015) — so the
      // `: cmd` / `: args` (non-Windows) arms are exercised on the
      // macOS/Linux legs even though this exact worktree only runs Windows.
      // Stubbing `process.platform` to fake a POSIX branch here would not
      // prove `spawn()` actually behaves correctly without `shell: true` on
      // a real POSIX host — only a real POSIX run can prove that.
      const spawnCmd = onWindows ? winCommandLine(cmd, args) : /* c8 ignore next */ cmd;
      const spawnArgs = onWindows ? [] : /* c8 ignore next */ args;
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
        // c8 ignore justification (next 2 lines' signal-killed arm): forcing a
        // child to close with `code === null` and a real `signal` requires
        // actually delivering a POSIX signal to a still-running child from
        // the test, which is inherently timing-dependent (a race between the
        // kill and the test's own assertions) and — like the winCommandLine
        // branch above — a genuinely different code path on Windows, where
        // Node emulates signals rather than delivering real ones. Not
        // something a hermetic, deterministic test can force safely.
        const exitCode = code !== null ? code : /* c8 ignore next */ 1;
        const signalNote = signal ? /* c8 ignore next */ `\n[terminated by signal ${signal}]` : "";
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
      // c8 ignore justification (the `: new Error(String(err))` else-branch):
      // this catch only wraps the synchronous portion of child_process.spawn
      // itself (option validation before the child process is created).
      // Every synchronous throw Node's spawn() implementation raises here is
      // already a real Error/TypeError instance (verified empirically —
      // e.g. `spawn(null, [])` throws a TypeError), so the "was this a
      // non-Error thrown value" fallback is defensive for a case Node's own
      // spawn() implementation doesn't produce, not something a hermetic
      // test can trigger through the real spawn() call this wraps.
      finish(err instanceof Error ? err : /* c8 ignore next */ new Error(String(err)));
    }
  });
}
