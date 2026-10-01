import fs from "node:fs";
import { getCacheDir, type CacheDirContext } from "./cacheDir.js";

// Lazy Android SDK detection for native app phase A3. This is the ONLY place
// the Android toolchain is probed, and it is called ONLY from the android
// context preflight — so a run that never targets android pays nothing (no
// filesystem walk, no env read, no spawn). Detection is pure over injected
// deps (env / existsSync / platform), which keeps it hermetically testable
// and lets the same logic serve both the runtime gate and the installer.

export type AndroidSdkSource =
  | "ANDROID_HOME"
  | "ANDROID_SDK_ROOT"
  | "cache"
  | "path";

export interface AndroidSdk {
  sdkRoot: string;
  source: AndroidSdkSource;
  // Resolved absolute tool paths, when present. A usable SDK has at least one
  // of adb/emulator; the rest may be absent on a partial install.
  adb?: string;
  emulator?: string;
  avdmanager?: string;
  sdkmanager?: string;
}

export interface AndroidSdkDeps {
  env?: Record<string, string | undefined>;
  existsSync?: (candidate: string) => boolean;
  // The <cacheDir>/android-sdk candidate. Defaulted from getCacheDir(ctx) so
  // production callers don't have to compute it; injectable so tests never
  // touch the real cache directory.
  cacheAndroidSdk?: string;
  platform?: NodeJS.Platform;
}

// Join with the separator of the TARGET platform (not the host's) so detection
// is deterministic under an injected platform in tests and on the real host.
// Strip trailing path separators with a linear scan (not a `/[\\/]+$/` regex,
// which backtracks super-linearly on long all-separator strings — CodeQL's
// polynomial-ReDoS rule flags it).
function trimTrailingSeparators(s: string): string {
  let end = s.length;
  while (end > 0) {
    const code = s.charCodeAt(end - 1);
    if (code !== 47 && code !== 92) break; // '/' and '\'
    end--;
  }
  return s.slice(0, end);
}

function joinFor(platform: NodeJS.Platform, ...parts: string[]): string {
  const sep = platform === "win32" ? "\\" : "/";
  // Trim trailing separators on the head so we don't double them.
  return parts.map((p, i) => (i === 0 ? trimTrailingSeparators(p) : p)).join(sep);
}

// Executable suffixes to try, per platform. adb/emulator are real binaries
// (.exe on Windows); avdmanager/sdkmanager ship as .bat wrappers on Windows.
function exeSuffixes(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? [".exe", ""] : [""];
}
function batSuffixes(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? [".bat", ""] : [""];
}

function firstExisting(
  base: string,
  suffixes: string[],
  existsSync: (p: string) => boolean
): string | undefined {
  for (const suffix of suffixes) {
    if (existsSync(base + suffix)) return base + suffix;
  }
  return undefined;
}

// Resolve the four tools inside a candidate SDK root. Returns the (possibly
// partial) set found; the caller decides whether the root counts as usable.
function resolveTools(
  root: string,
  platform: NodeJS.Platform,
  existsSync: (p: string) => boolean
): Pick<AndroidSdk, "adb" | "emulator" | "avdmanager" | "sdkmanager"> {
  const exe = exeSuffixes(platform);
  const bat = batSuffixes(platform);
  return {
    adb: firstExisting(
      joinFor(platform, root, "platform-tools", "adb"),
      exe,
      existsSync
    ),
    emulator: firstExisting(
      joinFor(platform, root, "emulator", "emulator"),
      exe,
      existsSync
    ),
    avdmanager: firstExisting(
      joinFor(platform, root, "cmdline-tools", "latest", "bin", "avdmanager"),
      bat,
      existsSync
    ),
    sdkmanager: firstExisting(
      joinFor(platform, root, "cmdline-tools", "latest", "bin", "sdkmanager"),
      bat,
      existsSync
    ),
  };
}

// A root "counts" as a usable SDK when at least one of adb/emulator resolves
// under it. cmdline-tools alone (no platform-tools, no emulator) is not enough
// to run or even reliably create an emulator, so it doesn't qualify.
function usable(
  tools: ReturnType<typeof resolveTools>
): boolean {
  return Boolean(tools.adb || tools.emulator);
}

/**
 * Detect an Android SDK, in priority order:
 *   1. ANDROID_HOME
 *   2. ANDROID_SDK_ROOT
 *   3. <cacheDir>/android-sdk (where `doc-detective install android` bootstraps)
 *   4. adb on PATH — derive the root as the parent of platform-tools/
 *
 * Returns the first usable root with its resolved tool paths, or null when no
 * SDK is found. Never throws, never spawns. Missing SDK is a gating fact (the
 * caller SKIPs and points at `doc-detective install android`), not an error.
 */
export function detectAndroidSdk(
  ctx: CacheDirContext = {},
  deps: AndroidSdkDeps = {}
): AndroidSdk | null {
  const env =
    deps.env ?? (process.env as Record<string, string | undefined>);
  const existsSync = deps.existsSync ?? fs.existsSync;
  const platform = deps.platform ?? process.platform;
  // Compute the cache candidate only when the cache dir resolves; an empty
  // safeCacheDir (getCacheDir threw on a bad config.cacheDir) would otherwise
  // join to the RELATIVE "android-sdk", which could false-match a cwd-local
  // folder. Skip the candidate entirely in that case.
  const cacheRoot = safeCacheDir(ctx);
  const cacheAndroidSdk =
    deps.cacheAndroidSdk ??
    (cacheRoot ? joinFor(platform, cacheRoot, "android-sdk") : undefined);

  const candidates: { root: string | undefined; source: AndroidSdkSource }[] = [
    { root: trimmed(env.ANDROID_HOME), source: "ANDROID_HOME" },
    { root: trimmed(env.ANDROID_SDK_ROOT), source: "ANDROID_SDK_ROOT" },
    { root: cacheAndroidSdk, source: "cache" },
  ];

  for (const { root, source } of candidates) {
    if (!root) continue;
    const tools = resolveTools(root, platform, existsSync);
    if (usable(tools)) return { sdkRoot: root, source, ...tools };
  }

  // Last resort: adb on PATH. Derive the SDK root as the parent of the
  // platform-tools/ directory that holds adb, so downstream tool resolution
  // (emulator, avdmanager) works the same as for an env-provided root.
  const fromPath = adbOnPath(env, platform, existsSync);
  if (fromPath) {
    const tools = resolveTools(fromPath.root, platform, existsSync);
    return {
      sdkRoot: fromPath.root,
      source: "path",
      // adb is guaranteed found on PATH; prefer the resolved-in-root paths for
      // the rest, falling back to the PATH-resolved adb.
      adb: tools.adb ?? fromPath.adb,
      emulator: tools.emulator,
      avdmanager: tools.avdmanager,
      sdkmanager: tools.sdkmanager,
    };
  }

  return null;
}

// getCacheDir mkdir's and validates; if that throws (bad cacheDir), detection
// should degrade to "no cache SDK", not crash the gate. Callers already treat
// a null return as "install android".
function safeCacheDir(ctx: CacheDirContext): string {
  try {
    return getCacheDir(ctx);
  } catch {
    return "";
  }
}

function trimmed(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// Scan PATH for platform-tools/adb without spawning. Returns the adb path and
// the derived SDK root (parent of platform-tools) on a hit.
function adbOnPath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  existsSync: (p: string) => boolean
): { adb: string; root: string } | null {
  const pathValue = env.PATH ?? env.Path ?? "";
  const delimiter = platform === "win32" ? ";" : ":";
  const suffixes = exeSuffixes(platform);
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    const adb = firstExisting(joinFor(platform, dir, "adb"), suffixes, existsSync);
    if (adb) {
      // dir is <root>/platform-tools — climb one segment to the SDK root.
      const root = parentDir(dir, platform);
      return { adb, root };
    }
  }
  return null;
}

function parentDir(dir: string, platform: NodeJS.Platform): string {
  const sep = platform === "win32" ? "\\" : "/";
  const idx = trimTrailingSeparators(dir).lastIndexOf(sep);
  return idx > 0 ? dir.slice(0, idx) : dir;
}
