import axios from "axios";
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import path from "node:path";
import type { Logger, SpawnFn } from "./loader.js";

export type InstallMode = "global" | "local" | "npx" | "unknown";

export interface SelfUpdateDeps {
  logger?: Logger;
  http?: { get: (url: string, opts?: any) => Promise<{ data: any }> };
  spawn?: SpawnFn;
}

const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "error") console.error(msg);
  else console.log(msg);
};

const REGISTRY_URL = "https://registry.npmjs.org/doc-detective";
const REGISTRY_TIMEOUT_MS = 3_000;

/**
 * Compare two semver strings (lenient — handles `X.Y.Z`, prerelease tags
 * are compared lexically as a tiebreaker). Returns:
 *   <0  if a < b
 *   0   if a === b
 *   >0  if a > b
 *
 * We avoid pulling in the full `semver` dep for this single use site.
 */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA = ""] = a.split("-");
  const [coreB, preB = ""] = b.split("-");
  const partsA = coreA.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = coreB.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const x = partsA[i] ?? 0;
    const y = partsB[i] ?? 0;
    if (x !== y) return x - y;
  }
  // A release version is "greater than" any prerelease of the same core.
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA < preB) return -1;
  if (preA > preB) return 1;
  return 0;
}

export interface CheckResult {
  latest: string | null;
  newer: boolean;
}

/**
 * Hit the npm registry for the dist-tag.latest of `doc-detective`. Bounded
 * by a 3 s timeout. Any failure — network, parse, semver, anything —
 * yields { newer: false } and a debug-level log; we never let a registry
 * hiccup block the run.
 */
export async function checkForUpdate(
  currentVersion: string,
  deps: SelfUpdateDeps = {}
): Promise<CheckResult> {
  const logger = deps.logger ?? defaultLogger;
  const http = deps.http ?? {
    get: (url, opts) => axios.get(url, opts),
  };
  try {
    const res = await http.get(REGISTRY_URL, { timeout: REGISTRY_TIMEOUT_MS });
    const latest: string | undefined = res?.data?.["dist-tags"]?.latest;
    if (typeof latest !== "string" || latest.length === 0) {
      logger("registry response missing dist-tags.latest; skipping self-update", "debug");
      return { latest: null, newer: false };
    }
    return { latest, newer: compareVersions(latest, currentVersion) > 0 };
  } catch (err) {
    logger(`self-update check skipped: ${String(err)}`, "debug");
    return { latest: null, newer: false };
  }
}

/**
 * Decide whether the running shim is installed as a global npm bin, a local
 * project dep, or being invoked via `npx`. Used to choose the right update
 * command — global gets `npm install -g`, npx re-execs through `npx -y`,
 * and local just gets an info-level "update available" line because
 * mutating the user's package.json is out of scope for self-update.
 */
export function detectInstallMode(): InstallMode {
  const entry = process.argv[1] ?? "";
  const normalized = entry.split(path.sep).join("/").toLowerCase();
  if (normalized.includes("/_npx/")) return "npx";
  if (process.env.npm_execpath && process.env.npm_execpath.toLowerCase().includes("npx"))
    return "npx";
  // npm sets npm_config_global=true for `npm install -g …` lifecycle scripts,
  // but at run-time we look at the binary path. A typical global install on
  // POSIX lives under `/usr/local/lib/node_modules/doc-detective/...` or the
  // npm prefix; on Windows under `%AppData%/npm/node_modules/...`.
  if (normalized.includes("/lib/node_modules/doc-detective/")) return "global";
  if (normalized.includes("/appdata/roaming/npm/")) return "global";
  if (normalized.includes("/.npm-global/")) return "global";
  if (normalized.includes("/node_modules/doc-detective/")) return "local";
  return "unknown";
}

export interface SelfUpdateResult {
  updated: boolean;
  /** True iff the caller should NOT continue running this process. */
  reexec: boolean;
}

/**
 * Perform a self-update for the running shim, scoped by install mode.
 *   - global: spawn `npm install -g doc-detective@<latest>`, then re-exec.
 *   - npx:    re-exec via `npx -y doc-detective@latest <…orig argv>`.
 *   - local:  log an info-level "update available" line, return updated:false.
 *   - unknown: like local — never mutate state we don't understand.
 *
 * In the re-exec paths, the child inherits the parent's stdio and is
 * spawned with DOC_DETECTIVE_SKIP_AUTO_UPDATE=1 to prevent infinite update
 * loops if the new version's check fires again.
 */
export async function selfUpdate(
  latestVersion: string,
  mode: InstallMode,
  deps: SelfUpdateDeps = {}
): Promise<SelfUpdateResult> {
  const logger = deps.logger ?? defaultLogger;
  const spawner = deps.spawn ?? (nodeSpawn as SpawnFn);

  if (mode === "local" || mode === "unknown") {
    logger(
      `Update available: doc-detective@${latestVersion}. Run \`npm i doc-detective@latest\` in this project to upgrade.`,
      "info"
    );
    return { updated: false, reexec: false };
  }

  const childEnv = { ...process.env, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" };
  const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
  const npxExe = process.platform === "win32" ? "npx.cmd" : "npx";

  if (mode === "global") {
    logger(`Self-updating doc-detective to ${latestVersion} (global)`, "info");
    await runChild(
      spawner,
      npmExe,
      ["install", "-g", `doc-detective@${latestVersion}`],
      { env: childEnv, shell: process.platform === "win32", stdio: "inherit" },
      logger
    );
    // Re-exec the same entry with the original argv tail.
    const exitCode = await runChild(
      spawner,
      process.execPath,
      [process.argv[1] as string, ...process.argv.slice(2)],
      { env: childEnv, stdio: "inherit" },
      logger
    );
    process.exit(exitCode);
  }

  // npx
  logger(`Re-launching via npx -y doc-detective@${latestVersion}`, "info");
  const exitCode = await runChild(
    spawner,
    npxExe,
    ["-y", `doc-detective@${latestVersion}`, ...process.argv.slice(2)],
    { env: childEnv, shell: process.platform === "win32", stdio: "inherit" },
    logger
  );
  process.exit(exitCode);
}

function runChild(
  spawner: SpawnFn,
  cmd: string,
  args: string[],
  opts: SpawnOptions,
  logger: Logger
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawner(cmd, args, opts);
    child.on("error", (err: Error) => {
      logger(`spawn ${cmd} failed: ${err.message}`, "error");
      reject(err);
    });
    child.on("close", (code: number | null) => resolve(code ?? 1));
  });
}
