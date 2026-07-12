// Git Bash on Windows as a lazily-installed runtime asset.
//
// runShell's `shell` field defaults to `bash` on every platform. POSIX
// systems resolve `bash` from PATH; Windows has no system bash (the
// `System32\bash.exe` on PATH is the WSL launcher, which runs commands in a
// Linux VM — never what a doc test means), so this module resolves a real
// Git Bash. Resolution order:
//
//   1. The cache copy: `<cacheDir>/tools/git-bash/<version>/usr/bin/bash.exe`.
//   2. An existing Git for Windows install (`where.exe git` + well-known
//      install locations). System32-rooted candidates are filtered — that's
//      the WSL launcher, not bash.
//   3. A MinGit portable download into the cache (pinned version + sha256).
//
// Every resolved candidate is verified by executing `bash --version` and
// requiring parseable GNU bash output, mirroring the browsers.ts
// verify-by-execution pattern — a present-but-broken binary (partial
// download, quarantined install) is skipped or repaired, never returned.
//
// MinGit ships GNU bash as `usr/bin/sh.exe` (same binary, POSIX mode via
// argv[0]); the installer copies it to `usr/bin/bash.exe` alongside its
// msys-2.0.dll so it runs as full bash. The download lives under `tools/`,
// OUTSIDE `<cacheDir>/runtime`, so it can never interact with npm's arborist
// and the #501 prune hazard.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  getCacheDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import { downloadFile, extractZip } from "./archiveUtils.js";
import type { Logger } from "./loader.js";
import type { InstallReport } from "./installer.js";

export {
  getGitBashDir,
  getCachedBashPath,
  resolveWindowsBash,
  installBash,
};
export type { WindowsBashDeps };

// Pinned MinGit release (https://github.com/git-for-windows/git/releases).
// Bump the version and BOTH digests together; the sha256 gate below fails
// loudly on any mismatch, so a stale digest can't install silently.
export const MINGIT_VERSION = "2.55.0.2";
const MINGIT_ASSETS: Record<string, { url: string; sha256: string }> = {
  x64: {
    url: `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.2/MinGit-${MINGIT_VERSION}-64-bit.zip`,
    sha256: "e3ea2944cea4b3fabcd69c7c1669ef69b1b66c05ac7806d81224d0abad2dec31",
  },
  arm64: {
    url: `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.2/MinGit-${MINGIT_VERSION}-arm64.zip`,
    sha256: "0b2b81fdce284efd174cbb51b886ccea2fd271679c4b5c21f07d9e03bae51413",
  },
};

// Injectable seams so unit tests can drive every branch hermetically: no
// network, no spawns, no real cache mutation.
interface WindowsBashDeps {
  platform?: string;
  arch?: string;
  env?: Record<string, string | undefined>;
  fileExists?: (p: string) => boolean;
  // `bash --version` prints parseable GNU bash output. Present-but-broken
  // binaries (truncated download) fail here and are skipped/repaired.
  verifyBash?: (bashPath: string) => Promise<boolean>;
  // `where.exe git` hits, one absolute path per entry; [] when git is absent.
  whereGit?: () => Promise<string[]>;
  // Download + checksum + extract MinGit into destDir and materialize
  // usr/bin/bash.exe. Only the real implementation touches the network.
  installMinGit?: (destDir: string, deps: WindowsBashDeps) => Promise<void>;
  logger?: Logger;
}

const noopLogger: Logger = () => {};

function depsWithDefaults(deps: WindowsBashDeps): Required<WindowsBashDeps> {
  return {
    platform: deps.platform ?? process.platform,
    arch: deps.arch ?? process.arch,
    env: deps.env ?? process.env,
    fileExists: deps.fileExists ?? ((p: string) => fs.existsSync(p)),
    verifyBash: deps.verifyBash ?? defaultVerifyBash,
    whereGit: deps.whereGit ?? defaultWhereGit,
    installMinGit: deps.installMinGit ?? installMinGit,
    logger: deps.logger ?? noopLogger,
  };
}

function getToolsDir(ctx: CacheDirContext = {}): string {
  return path.join(getCacheDir(ctx), "tools");
}

function getGitBashDir(ctx: CacheDirContext = {}): string {
  return path.join(getToolsDir(ctx), "git-bash", MINGIT_VERSION);
}

function getCachedBashPath(ctx: CacheDirContext = {}): string {
  return path.join(getGitBashDir(ctx), "usr", "bin", "bash.exe");
}

// The WSL launcher lives at `%SystemRoot%\System32\bash.exe` (and the
// Sysnative alias under WOW64). Anything System32-rooted is never Git Bash.
function isSystem32Path(p: string): boolean {
  return /[\\/](system32|sysnative)[\\/]/i.test(p);
}

// Candidate bash locations from an existing Git for Windows install: the
// `where.exe git` hits (git.exe lives in `<root>\cmd` or `<root>\bin`) plus
// the standard per-machine and per-user install locations.
function systemBashCandidates(
  gitPaths: string[],
  env: Record<string, string | undefined>
): string[] {
  const candidates: string[] = [];
  for (const gitPath of gitPaths) {
    const root = path.dirname(path.dirname(gitPath));
    candidates.push(path.join(root, "bin", "bash.exe"));
    candidates.push(path.join(root, "usr", "bin", "bash.exe"));
  }
  for (const base of [
    env.ProgramFiles ?? env.PROGRAMFILES,
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs") : undefined,
  ]) {
    if (base) candidates.push(path.join(base, "Git", "bin", "bash.exe"));
  }
  return candidates.filter((p) => !isSystem32Path(p));
}

// Bounded direct spawn (no shell — the path is executed directly, so spaces
// are safe and there is no quoting surface). Returns null on spawn failure
// or timeout; the timer is unref'd so a hung probe never pins the process.
//
// CodeQL "uncontrolled command line" here is acknowledged and by design
// (mirroring the spawnCommand rationale in src/core/utils.ts): the executed
// paths are candidate bash binaries derived from the local machine's own
// configuration — `where.exe git` output and standard install locations
// built from ProgramFiles/LOCALAPPDATA env vars — never remote or
// test-content input. Executing local candidates (with `--version`, no
// shell) to verify them IS the feature; each candidate is also
// existence-checked and System32-filtered before it reaches this probe.
async function spawnCapture(
  cmd: string,
  args: string[]
): Promise<{ code: number | null; stdout: string } | null> {
  return await new Promise((resolve) => {
    let stdout = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // best-effort
      }
      resolve(null);
    }, 15000);
    timer.unref?.();
    // spawn errors are emitted asynchronously, so `timer` exists by the time
    // either handler runs; clear it on every settle path.
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.stdout?.on("data", (d: any) => (stdout += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout });
    });
  });
}

async function defaultVerifyBash(bashPath: string): Promise<boolean> {
  const result = await spawnCapture(bashPath, ["--version"]);
  return (
    result !== null &&
    result.code === 0 &&
    /GNU bash, version \d+/.test(result.stdout)
  );
}

async function defaultWhereGit(): Promise<string[]> {
  const result = await spawnCapture("where.exe", ["git"]);
  if (!result) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// The real MinGit install: download the pinned zip, verify its sha256,
// extract into destDir, and copy usr/bin/sh.exe -> usr/bin/bash.exe (MinGit
// ships bash under the `sh` name; argv[0] controls POSIX mode, so the copy
// runs as full bash). Network + disk effects live here and only here.
/* c8 ignore start — real download/extract; the resolution logic around it is
   unit-tested through the injected installMinGit seam. */
async function installMinGit(
  destDir: string,
  deps: WindowsBashDeps = {}
): Promise<void> {
  const arch = deps.arch ?? process.arch;
  const logger = deps.logger ?? noopLogger;
  // MinGit publishes 64-bit and arm64 builds only; a 32-bit Node would
  // download a bash it can't execute, so fail up front with remediation
  // instead of burning the download and dying at verification.
  if (arch !== "x64" && arch !== "arm64") {
    throw new Error(
      `The bundled Git Bash (MinGit) isn't available for the ${arch} architecture. Install Git for Windows manually, or set \`shell\` to \`cmd\` or \`powershell\`.`
    );
  }
  const asset = MINGIT_ASSETS[arch === "arm64" ? "arm64" : "x64"];
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  const zipPath = `${destDir}.download.zip`;
  try {
    logger(
      `Downloading Git Bash (MinGit ${MINGIT_VERSION}) into the Doc Detective cache — a one-time ~40 MB download…`,
      "info"
    );
    await downloadFile(asset.url, zipPath);
    const actual = await sha256File(zipPath);
    if (actual !== asset.sha256) {
      throw new Error(
        `MinGit download failed its checksum (expected ${asset.sha256}, got ${actual}). Refusing to install.`
      );
    }
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    await extractZip(zipPath, destDir);
    const shPath = path.join(destDir, "usr", "bin", "sh.exe");
    const bashPath = path.join(destDir, "usr", "bin", "bash.exe");
    if (!fs.existsSync(bashPath)) {
      if (!fs.existsSync(shPath)) {
        throw new Error(
          `MinGit extraction is missing usr/bin/sh.exe under ${destDir}; the archive layout may have changed.`
        );
      }
      fs.copyFileSync(shPath, bashPath);
    }
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}
/* c8 ignore stop */

// One shared install + post-install verification gate, used by both the JIT
// resolver and `doc-detective install bash` so the two entry points can't
// drift on error handling or record keeping.
async function installAndVerify(
  ctx: CacheDirContext,
  deps: Required<WindowsBashDeps>
): Promise<string> {
  await deps.installMinGit(getGitBashDir(ctx), deps);
  const cachedBash = getCachedBashPath(ctx);
  if (!deps.fileExists(cachedBash) || !(await deps.verifyBash(cachedBash))) {
    throw new Error(
      `Git Bash install completed but ${cachedBash} isn't runnable. Re-run \`doc-detective install bash --force\`, or set a different shell (\`cmd\` or \`powershell\`).`
    );
  }
  // Record the install so `doc-detective install status` can report it.
  // Best-effort: a failed record write must not fail a working install.
  try {
    const record = readInstalledRecord(ctx);
    record.tools = record.tools ?? {};
    record.tools["git-bash"] = {
      installedVersion: MINGIT_VERSION,
      installedAt: new Date().toISOString(),
    };
    writeInstalledRecord(record, ctx);
  } catch {
    // best-effort
  }
  return cachedBash;
}

// Quarantine a broken cache install so the re-download starts clean and the
// broken artifact is preserved for diagnostics (mirrors ensureGeckodriver).
function quarantineDir(dir: string, logger: Logger): void {
  try {
    if (!fs.existsSync(dir)) return;
    const quarantined = `${dir}.broken-${Date.now()}`;
    fs.renameSync(dir, quarantined);
    logger(
      `Quarantined a broken Git Bash install to ${quarantined}.`,
      "warn"
    );
  } catch {
    // Rename can fail while a stale bash.exe is open; the installer's
    // rm -rf + re-extract still repairs in place.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

// Dedupe concurrent installs per cache dir (concurrent runners can hit the
// bash resolution at the same time; one download serves all).
const inFlightInstalls = new Map<string, Promise<string>>();

// Memoize successful resolutions per cache dir: the answer is deterministic
// within one process, and re-verifying by execution (`bash --version` plus a
// possible `where.exe git`) on EVERY runShell step would add two process
// spawns per step. A cheap existence check on the memo guards against the
// binary vanishing mid-run (cache wipe); a miss drops the memo and re-runs
// the full resolution, including quarantine/repair.
const resolvedBashByCache = new Map<string, string>();

/**
 * Resolve a runnable Git Bash on Windows: cache copy, existing Git for
 * Windows, or a JIT MinGit install (when `autoInstall`, the default).
 * Rejects with an actionable error when bash can't be resolved or installed.
 */
async function resolveWindowsBash(
  options: {
    cacheDir?: string;
    autoInstall?: boolean;
    deps?: WindowsBashDeps;
  } = {}
): Promise<string> {
  const { cacheDir, autoInstall = true } = options;
  const deps = depsWithDefaults(options.deps ?? {});
  if (deps.platform !== "win32") {
    throw new Error(
      "resolveWindowsBash is only meaningful on Windows; POSIX platforms resolve bash from PATH."
    );
  }
  const ctx: CacheDirContext = cacheDir ? { cacheDir } : {};
  const cachedBash = getCachedBashPath(ctx);
  const memoKey = getCacheDir(ctx);

  // 0. Memo hit: already resolved and verified this process; only re-check
  //    that the binary still exists on disk.
  const memoized = resolvedBashByCache.get(memoKey);
  if (memoized) {
    if (deps.fileExists(memoized)) return memoized;
    resolvedBashByCache.delete(memoKey);
  }

  // 1. The cache copy — ours, pinned, preferred. A present-but-broken copy is
  //    quarantined so the install path below repairs it.
  if (deps.fileExists(cachedBash)) {
    if (await deps.verifyBash(cachedBash)) {
      resolvedBashByCache.set(memoKey, cachedBash);
      return cachedBash;
    }
    quarantineDir(getGitBashDir(ctx), deps.logger);
  }

  // 2. An existing Git for Windows install.
  const gitPaths = await deps.whereGit();
  for (const candidate of systemBashCandidates(gitPaths, deps.env)) {
    if (!deps.fileExists(candidate)) continue;
    if (await deps.verifyBash(candidate)) {
      resolvedBashByCache.set(memoKey, candidate);
      return candidate;
    }
  }

  // 3. JIT install into the cache.
  if (!autoInstall) {
    throw new Error(
      "Git Bash isn't available on this Windows machine. Run `doc-detective install bash` to install it, install Git for Windows, or set a different shell (`cmd` or `powershell`) in the step or config."
    );
  }
  let pending = inFlightInstalls.get(memoKey);
  if (!pending) {
    pending = installAndVerify(ctx, deps);
    inFlightInstalls.set(memoKey, pending);
    pending.finally(() => inFlightInstalls.delete(memoKey)).catch(() => {});
  }
  const installed = await pending;
  resolvedBashByCache.set(memoKey, installed);
  return installed;
}

/**
 * `doc-detective install bash` — provision Git Bash on Windows hosts.
 * Returns one structured InstallReport, mirroring installRuntime /
 * installBrowsers. Off Windows the report is `skipped` (POSIX systems use
 * the system bash).
 */
async function installBash(
  options: {
    force?: boolean;
    dryRun?: boolean;
    ctx?: CacheDirContext;
    deps?: WindowsBashDeps;
  } = {}
): Promise<InstallReport[]> {
  const { force = false, dryRun = false, ctx = {} } = options;
  const deps = depsWithDefaults(options.deps ?? {});
  const logger = deps.logger;

  if (deps.platform !== "win32") {
    return [
      {
        assetId: "git-bash",
        kind: "tool",
        action: "skipped",
        notes: ["Windows-only; POSIX systems resolve bash from PATH."],
      },
    ];
  }

  if (dryRun) {
    return [
      {
        assetId: "git-bash",
        kind: "tool",
        action: "dry-run",
        notes: [`would ensure MinGit ${MINGIT_VERSION} (or an existing Git for Windows bash)`],
      },
    ];
  }

  if (!force) {
    try {
      const resolved = await resolveWindowsBash({
        cacheDir: ctx.cacheDir,
        autoInstall: false,
        deps,
      });
      return [
        {
          assetId: "git-bash",
          kind: "tool",
          action: "already-up-to-date",
          installedVersion:
            resolved === getCachedBashPath(ctx) ? MINGIT_VERSION : undefined,
          notes: [`bash at ${resolved}`],
        },
      ];
    } catch {
      // Nothing resolvable — fall through to the install.
    }
  }

  const installed = await installAndVerify(ctx, deps);
  resolvedBashByCache.set(getCacheDir(ctx), installed);
  logger(`Installed Git Bash (MinGit ${MINGIT_VERSION}).`, "info");
  return [
    {
      assetId: "git-bash",
      kind: "tool",
      action: force ? "forced" : "installed",
      installedVersion: MINGIT_VERSION,
    },
  ];
}
