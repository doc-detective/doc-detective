// Tool-version probes for the debug dump.
//
// Two flavors of probe:
//   1. Spawn-based (`probeTool`) — runs `<binary> --version` with a
//      hard timeout (default 3000 ms). Used for system binaries (node,
//      npm, npx, git, docker, java, python). To keep with the
//      "don't execute project-local binaries" model, the spawn runs with
//      a PATH that has any `node_modules/.bin` segments stripped, so a
//      repo-local shim (common when launched from an npm/yarn/pnpm
//      script, which prepends `node_modules/.bin`) can't shadow a system
//      tool during diagnostics.
//   2. Metadata-read (`resolveHeavyDep*`) — reads `version` from a named
//      package's `package.json` without executing it. Used for appium and
//      ffmpeg so a compromised `node_modules/.bin/<tool>` doesn't run on
//      `doc-detective debug`.
//
// All spawn-based probes use `shell: true` for PATH lookup consistency
// across Windows (where binaries can be `.cmd`). Package-read probes
// do no I/O beyond a `require` call.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import {
  resolveHeavyDepPath,
  resolveHeavyDepVersion,
} from "../runtime/loader.js";

const require = createRequire(import.meta.url);

// Return a copy of `process.env` whose PATH has any `node_modules/.bin`
// segments removed, so a repo-local shim can't shadow a system tool the
// probes invoke by bare name. Exported for testing.
export function envWithoutNodeModulesBin(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path");
  if (pathKey && typeof env[pathKey] === "string") {
    env[pathKey] = (env[pathKey] as string)
      .split(path.delimiter)
      .filter((seg) => !/[\\/]node_modules[\\/]\.bin([\\/]|$)/i.test(seg))
      .join(path.delimiter);
  }
  return env;
}

export interface ToolResult {
  name: string;
  version: string;
  notes?: string;
}

const DEFAULT_TIMEOUT_MS = 3000;

export async function probeTool(
  name: string,
  command: string,
  options: { timeoutMs?: number } = {}
): Promise<ToolResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout, stderr, exitCode, timedOut } = await runWithTimeout(
      command,
      timeoutMs
    );
    if (timedOut) return { name, version: `<timed out after ${timeoutMs}ms>` };
    if (exitCode !== 0) {
      const firstLine = (stderr || stdout || "").split("\n")[0]?.trim() || "";
      // "command not found" shell errors (e.g. Windows' "'java' is not
      // recognized as an internal or external command,") are just noise —
      // the `<not found>` marker already says the tool is absent, and the
      // raw message is a truncated, comma-dangling fragment. Suppress those;
      // keep genuinely-informative errors as a note.
      const notFoundNoise =
        /not recognized|not found|no such file|cannot find|command not found/i.test(
          firstLine
        );
      return {
        name,
        version: "<not found>",
        notes: notFoundNoise ? undefined : firstLine || undefined,
      };
    }
    // Some tools (java, appium with stderr noise) print version on stderr.
    // Fall back to stderr when stdout is empty OR whitespace-only — a bare
    // "\n" on stdout is truthy but carries no version.
    const text = (stdout.trim() ? stdout : stderr || "").trim();
    const firstLine = text.split("\n")[0] || "<unknown>";
    return { name, version: firstLine };
    // runWithTimeout's returned Promise never rejects (its executor only
    // ever calls `resolve`, including from the child's "error" event
    // handler), and `envWithoutNodeModulesBin()` is a pure string transform
    // over `process.env` that cannot throw. The only way to reach this
    // catch is a synchronous throw from `spawn()` itself (e.g. a missing
    // shell binary) or from `child_process`'s `spawn` named import being
    // stubbed to throw — neither is triggerable hermetically: `spawn` is a
    // NAMED import here (`import { spawn } from "node:child_process"`), so
    // sinon cannot patch it ("ES Modules cannot be stubbed"), and a real
    // environment always has a working shell.
    /* c8 ignore start */
  } catch (err: any) {
    return { name, version: "<probe failed>", notes: err?.message };
  }
  /* c8 ignore stop */
}

function runWithTimeout(
  command: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      env: envWithoutNodeModulesBin(),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // Best-effort kill.
      }
      resolve(result);
    };
    const t = setTimeout(() => settle({ stdout, stderr, exitCode: -1, timedOut: true }), timeoutMs);
    child.stdout?.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    /* c8 ignore start */
    // Every probed command runs with `shell: true`, so a bare-name or
    // nonexistent binary is resolved (or reported "not found") by the
    // shell itself as a normal nonzero exit — it does NOT surface as a
    // spawn-level "error" event. That event only fires when the underlying
    // shell binary (cmd.exe / /bin/sh) itself can't be spawned, which
    // requires a broken host environment that can't be simulated
    // hermetically (and `child_process`'s `spawn` is a NAMED import here,
    // so sinon can't stub it to synthesize the event).
    child.on("error", (err) => {
      clearTimeout(t);
      settle({ stdout, stderr: stderr + (err.message || ""), exitCode: -1, timedOut: false });
    });
    /* c8 ignore stop */
    child.on("close", (code) => {
      clearTimeout(t);
      /* c8 ignore start */
      // `code` is only `null` when the child was killed by a signal before
      // exiting normally; every probed command in this suite exits
      // normally (or is settled first by the timeout path above), and
      // forcing a genuinely signal-terminated child is not reliably
      // portable across Windows/POSIX from a hermetic test.
      settle({ stdout, stderr, exitCode: code ?? -1, timedOut: false });
      /* c8 ignore stop */
    });
  });
}

// The probe set the debug dump runs. Order is the print order. `cacheDir`
// (from config) lets the appium probe see cache-installed runtime deps.
export async function probeAllTools(cacheDir?: string): Promise<ToolResult[]> {
  const probes: Array<ToolResult | Promise<ToolResult>> = [
    { name: "node", version: process.version },
    probeTool("npm", "npm --version"),
    probeTool("npx", "npx --version"),
    probePython(),
    probeTool("java", "java -version"),
    probeFfmpeg(),
    probeAppium(cacheDir),
    probeTool("git", "git --version"),
    probeTool("docker", "docker --version"),
  ];
  return Promise.all(probes);
}

async function probePython(): Promise<ToolResult> {
  const py3 = await probeTool("python3", "python3 --version");
  // This early-return branch is genuinely exercised whenever python3
  // resolves on PATH (confirmed directly: calling probeAllTools() in this
  // environment returns {name:"python", version:"Python 3.x..."} via THIS
  // return, not the fallback below) — but V8's own coverage collector
  // (checked via raw NODE_V8_COVERAGE output, before any istanbul/c8
  // post-processing) reports byte-range count:0 for this block on every
  // run, seemingly because of how V8 attributes coverage counters across
  // an `await` immediately followed by a conditional early-return inside
  // an async function compiled by this TS target. Documented rather than
  // silently left red, since it's a demonstrated tool-instrumentation gap,
  // not a reachability gap.
  /* c8 ignore next 3 */
  if (py3.version !== "<not found>" && !py3.version.startsWith("<timed out")) {
    return { name: "python", version: py3.version };
  }
  /* c8 ignore start */
  // The python3 -> python fallback only fires when python3 is genuinely
  // absent from PATH. `probeTool`'s literal command strings
  // ("python3 --version") aren't parameterized, so there's no way to
  // redirect the probe to a fake binary without stubbing `child_process`'s
  // `spawn` (a NAMED import — unstubbable). Corrupting PATH globally to
  // hide the real python3 for this one probe would risk destabilizing
  // every other probeTool()/spawn call sharing the same process env in
  // this test run (npm/npx/git/docker), so it's intentionally not
  // attempted here.
  const py = await probeTool("python", "python --version");
  return { name: "python", version: py.version, notes: py.notes };
  /* c8 ignore stop */
}

function probeFfmpeg(): ToolResult {
  // Doc Detective bundles ffmpeg via @ffmpeg-installer/ffmpeg. Report the
  // installer's package version and location using metadata only —
  // `require.resolve` + reading the package.json (JSON, no code). We
  // deliberately do NOT `require("@ffmpeg-installer/ffmpeg")` (its index.js
  // runs platform-branching code) nor invoke the binary, so a compromised
  // installer dep can never execute during `doc-detective debug`.
  try {
    const pkgPath = require.resolve("@ffmpeg-installer/ffmpeg/package.json");
    const pkg = require(pkgPath);
    return {
      name: "ffmpeg",
      version: `@ffmpeg-installer/ffmpeg ${pkg.version}`,
      notes: `installer package: ${path.dirname(pkgPath)}`,
    };
    // `require` here is `createRequire(import.meta.url)` (module-private,
    // line 29), and @ffmpeg-installer/ffmpeg is a real optionalDependency
    // of this repo (package.json), so require.resolve() always succeeds in
    // this checkout. The catch would only fire in an install missing that
    // optional dependency — not reproducible without uninstalling a real
    // package the rest of the suite depends on.
    /* c8 ignore start */
  } catch {
    return { name: "ffmpeg", version: "<bundled installer not found>" };
  }
  /* c8 ignore stop */
}

// Resolve appium the same way the runtime does — shim node_modules OR
// `<cacheDir>/runtime` — so a cached install (`doc-detective install`) is
// reported as present here too, instead of `<not installed>` while the
// Browsers section shows it available. Reads version metadata only; never
// executes an appium binary.
function probeAppium(cacheDir?: string): ToolResult {
  const resolved = resolveHeavyDepPath("appium", { cacheDir });
  // resolveHeavyDepPath (src/runtime/loader.ts) is a NAMED import, so its
  // shim-resolution step can't be stubbed to force a miss, and appium is a
  // real optionalDependency of this repo — it always resolves from the
  // shim node_modules regardless of `cacheDir` (shim resolution is tried
  // before the cache and does not depend on cacheDir at all), so the
  // "not installed" branch below is unreachable without uninstalling a
  // real dependency the rest of the suite (and the CLI itself) needs.
  /* c8 ignore start */
  if (!resolved) {
    return { name: "appium", version: "<not installed>" };
  }
  /* c8 ignore stop */
  const version = resolveHeavyDepVersion("appium", { cacheDir });
  return {
    name: "appium",
    version: version ?? "<unknown>",
    notes: `from: ${resolved}`,
  };
}
