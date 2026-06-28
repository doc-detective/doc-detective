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
  } catch (err: any) {
    return { name, version: "<probe failed>", notes: err?.message };
  }
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
    child.on("error", (err) => {
      clearTimeout(t);
      settle({ stdout, stderr: stderr + (err.message || ""), exitCode: -1, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      settle({ stdout, stderr, exitCode: code ?? -1, timedOut: false });
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
  if (py3.version !== "<not found>" && !py3.version.startsWith("<timed out")) {
    return { name: "python", version: py3.version };
  }
  const py = await probeTool("python", "python --version");
  return { name: "python", version: py.version, notes: py.notes };
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
  } catch {
    return { name: "ffmpeg", version: "<bundled installer not found>" };
  }
}

// Resolve appium the same way the runtime does — shim node_modules OR
// `<cacheDir>/runtime` — so a cached install (`doc-detective install`) is
// reported as present here too, instead of `<not installed>` while the
// Browsers section shows it available. Reads version metadata only; never
// executes an appium binary.
function probeAppium(cacheDir?: string): ToolResult {
  const resolved = resolveHeavyDepPath("appium", { cacheDir });
  if (!resolved) {
    return { name: "appium", version: "<not installed>" };
  }
  const version = resolveHeavyDepVersion("appium", { cacheDir });
  return {
    name: "appium",
    version: version ?? "<unknown>",
    notes: `from: ${resolved}`,
  };
}
