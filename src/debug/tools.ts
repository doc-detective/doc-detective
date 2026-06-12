// Tool-version probes for the debug dump.
//
// Two flavors of probe:
//   1. Spawn-based (`probeTool`) — runs `<binary> --version` with a
//      hard timeout (default 3000 ms). Used ONLY for system binaries
//      whose path comes from PATH (node, npm, npx, git, docker, java,
//      python). PATH is system-level and trusted.
//   2. Package-read (`probeFromPackageJson`) — reads `version` from a
//      named package's `package.json` via `require.resolve`. Used for
//      anything that would otherwise route through a project-local
//      `node_modules/.bin` binary (appium, appium drivers, ffmpeg
//      bundled by @ffmpeg-installer). Avoids executing project-local
//      binaries just to collect diagnostics — a compromised
//      `node_modules/.bin/appium` would otherwise run on
//      `doc-detective debug`.
//
// All spawn-based probes use `shell: true` for PATH lookup consistency
// across Windows (where binaries can be `.cmd`). Package-read probes
// do no I/O beyond a `require` call.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
      const tail = (stderr || stdout || "").split("\n")[0] || "";
      return { name, version: `<not found>`, notes: tail };
    }
    // Some tools (java, appium with stderr noise) print version on stderr.
    const text = (stdout + (stdout ? "" : stderr) || "").trim();
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
    const child = spawn(command, { shell: true });
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

// The probe set the debug dump runs. Order is the print order.
export async function probeAllTools(): Promise<ToolResult[]> {
  const probes: Array<ToolResult | Promise<ToolResult>> = [
    { name: "node", version: process.version },
    probeTool("npm", "npm --version"),
    probeTool("npx", "npx --version"),
    probePython(),
    probeTool("java", "java -version"),
    probeFfmpeg(),
    probeAppium(),
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

// Read `{ name, version }` from a package's package.json without
// executing any of its binaries. Used for tools shipped via npm
// dependencies so a compromised `node_modules/.bin/<tool>` doesn't get
// invoked just to report a version.
function probeFromPackageJson(
  displayName: string,
  packageName: string,
  notesPrefix?: string
): ToolResult {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`);
    const pkg = require(pkgPath);
    const version = typeof pkg?.version === "string" ? pkg.version : "<unknown>";
    return {
      name: displayName,
      version,
      notes: notesPrefix ? `${notesPrefix}: ${pkgPath}` : pkgPath,
    };
  } catch (err: any) {
    return {
      name: displayName,
      version: "<not installed>",
      notes: err?.code === "MODULE_NOT_FOUND" ? undefined : err?.message,
    };
  }
}

function probeFfmpeg(): ToolResult {
  // Doc Detective bundles ffmpeg via @ffmpeg-installer/ffmpeg. We
  // report the installer's package version plus the resolved bundled
  // binary path WITHOUT invoking the binary — earlier revisions ran
  // `<bundledPath> -version`, which means `doc-detective debug` would
  // execute whatever lives at that path. A compromised installer dep
  // would therefore execute on every diagnostic run; reading the
  // package.json + path avoids that while still surfacing the
  // information a user needs ("is ffmpeg bundled? at what version?
  // from where?").
  try {
    const pkgPath = require.resolve("@ffmpeg-installer/ffmpeg/package.json");
    const pkg = require(pkgPath);
    let binPath = "<unknown>";
    try {
      // The installer's main export carries the binary path. Loading
      // it can run a small index.js that branches by platform — no
      // subprocess.
      const installer = require("@ffmpeg-installer/ffmpeg");
      binPath = installer?.path || "<unknown>";
    } catch {
      // Platform-specific binary package not installed for this
      // platform — fall through with binPath unset.
    }
    return {
      name: "ffmpeg",
      version: `@ffmpeg-installer/ffmpeg ${pkg.version}`,
      notes: `bundled binary: ${binPath}`,
    };
  } catch {
    return { name: "ffmpeg", version: "<bundled installer not found>" };
  }
}

function probeAppium(): ToolResult {
  return probeFromPackageJson("appium", "appium", "from");
}
