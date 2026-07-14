// Managed WebDriverAgent build products: the shared key/probe/marker
// vocabulary between the `install ios` prebuild (writer) and the session-time
// locator (reader). See docs/design/ios-wda-prebuild.md.
//
// Layout under the cache dir:
//   <cacheDir>/ios/wda/<key>/DerivedData/    xcodebuild -derivedDataPath target
//   <cacheDir>/ios/wda/<key>/products.json   completeness marker, written LAST
//   <cacheDir>/ios/wda/<key>/last-used       sidecar stamp touched by readers
//   <cacheDir>/ios/wda/.lock/                writer's advisory lock

import { spawnSync } from "node:child_process";
import fsDefault from "node:fs";
import path from "node:path";
import { getCacheDir, type CacheDirContext } from "./cacheDir.js";
import { resolveHeavyDepVersion } from "./loader.js";

export interface XcodeVersion {
  /** e.g. "16.4" */
  version: string;
  /** e.g. "16F6" — distinguishes two images shipping the same marketing version. */
  build: string;
}

/**
 * Minimum Xcode major for the WDA prebuild. Below this the
 * `build-for-testing` invocation against the generic iOS Simulator
 * destination (and the appium-xcuitest-driver versions we install) are not
 * supported — skip with upgrade guidance instead of attempting a doomed
 * build. Floor per the design doc's "likely 14+"; revisit against the live
 * macOS leg if it ever disagrees.
 */
export const MIN_XCODE_MAJOR = 14;

/**
 * Parse `xcodebuild -version` output:
 *
 *   Xcode 16.4
 *   Build version 16F6
 *
 * Returns null when the output doesn't look like full Xcode (e.g. the
 * Command Line Tools error text) — only full Xcode can build WDA.
 */
export function parseXcodebuildVersion(output: unknown): XcodeVersion | null {
  const text = String(output ?? "");
  const version = /^\s*Xcode\s+(\S+)/m.exec(text)?.[1];
  const build = /^\s*Build version\s+(\S+)/m.exec(text)?.[1];
  if (!version || !build) return null;
  return { version, build };
}

export function xcodeMajor(xcode: XcodeVersion): number {
  const major = Number.parseInt(xcode.version, 10);
  return Number.isFinite(major) ? major : 0;
}

/** The managed WDA root: <cacheDir>/ios/wda. */
export function getWdaRoot(ctx: CacheDirContext = {}): string {
  return path.join(getCacheDir(ctx), "ios", "wda");
}

// The minimal fs surface the prebuild writer and session locator use —
// injected in unit tests, node:fs in production.
export interface WdaFs {
  existsSync(p: string): boolean;
  readFileSync(p: string): string | Buffer;
  writeFileSync(p: string, data: string): void;
  mkdirSync(p: string, opts?: { recursive?: boolean }): unknown;
  renameSync(from: string, to: string): void;
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
  readdirSync(p: string): string[];
  statSync(p: string): { mtimeMs: number };
}

// actions/cache-style conservative charset: collapse anything outside
// [A-Za-z0-9._-] to a single "-" so versions with build metadata or spaces
// can't produce hostile directory names.
function sanitizeKeySegment(value: string): string {
  return (
    (value || "unknown").trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "unknown"
  );
}

/**
 * The cache key a WDA build is valid for: Xcode marketing version + build id
 * (two runner images can ship the same marketing version) + the exact
 * appium-xcuitest-driver version whose bundled WDA source was compiled.
 */
export function computeWdaKey(
  xcode: XcodeVersion,
  driverVersion: string
): string {
  return `xcode-${sanitizeKeySegment(xcode.version)}-${sanitizeKeySegment(
    xcode.build
  )}-driver-${sanitizeKeySegment(driverVersion)}`;
}

/** Where xcodebuild's products land inside a key dir. */
export const RUNNER_APP_RELATIVE = path.join(
  "DerivedData",
  "Build",
  "Products",
  "Debug-iphonesimulator",
  "WebDriverAgentRunner-Runner.app"
);

export const PRODUCTS_MARKER = "products.json";
export const LAST_USED_STAMP = "last-used";

export interface WdaProductsMarker {
  key: string;
  driverVersion: string;
  xcode: XcodeVersion;
  runnerApp: string;
  builtAt: string;
}

/**
 * Read and validate a key dir's completeness marker. Null on any miss:
 * absent/corrupt marker (a crashed half-built dir never wrote one — that is
 * the lock-free correctness story for readers) or a marker whose recorded
 * Runner app no longer exists on disk.
 */
export function readProductsMarker(
  keyDir: string,
  fs: WdaFs
): WdaProductsMarker | null {
  try {
    const parsed = JSON.parse(
      String(fs.readFileSync(path.join(keyDir, PRODUCTS_MARKER)))
    );
    if (
      typeof parsed?.key !== "string" ||
      typeof parsed?.driverVersion !== "string" ||
      typeof parsed?.runnerApp !== "string"
    ) {
      return null;
    }
    if (!fs.existsSync(parsed.runnerApp)) return null;
    return parsed as WdaProductsMarker;
  } catch {
    return null;
  }
}

// --- session-time locator (design phase 3) ---

/**
 * Minimum appium-xcuitest-driver MAJOR whose prebuilt-WDA consumption
 * (`appium:usePrebuiltWDA` + `appium:derivedDataPath`) this locator has been
 * validated against (the live macOS fixture legs run the 10.x line that
 * doc-detective's declared range installs). Prebuilt handling is
 * driver-version-sensitive across older majors (`prebuiltWDAPath` /
 * `useXctestrunFile` variants, differing .xctestrun handling), so anything
 * below the floor gets a plain fallback — today's build-in-session behavior —
 * never a guess.
 */
export const MIN_PREBUILT_WDA_DRIVER_MAJOR = 10;

// One `xcodebuild -version` spawn max per process: sessions can be created
// many times per run, and the Xcode version cannot change mid-run.
let cachedXcodeProbe: XcodeVersion | null | undefined;

/* c8 ignore start — real spawn; unit tests inject probeXcode. */
function probeXcodeVersionCached(): XcodeVersion | null {
  if (cachedXcodeProbe === undefined) {
    try {
      const result = spawnSync("xcodebuild", ["-version"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      });
      cachedXcodeProbe =
        result.status === 0 ? parseXcodebuildVersion(result.stdout) : null;
    } catch {
      cachedXcodeProbe = null;
    }
  }
  return cachedXcodeProbe;
}
/* c8 ignore stop */

export interface LocateManagedWdaOptions {
  ctx?: CacheDirContext;
  fs?: WdaFs;
  platform?: NodeJS.Platform;
  probeXcode?: () => XcodeVersion | null;
  resolveDriverVersion?: (
    name: string,
    ctx: CacheDirContext
  ) => string | null;
  /** Test override for the managed WDA root (default: <cacheDir>/ios/wda). */
  wdaRootDir?: string;
  now?: () => number;
}

export interface ManagedWdaHit {
  key: string;
  /** Value for appium:derivedDataPath — the keyed DerivedData dir. */
  derivedDataPath: string;
}

/**
 * Pure managed-products locator for iOS session capability builders: find
 * the prebuilt WDA products matching the CURRENT toolchain (installed
 * driver version × host Xcode). On a valid hit, touch the last-used stamp
 * (the prune signal) and return the derivedDataPath to consume read-only
 * with `appium:usePrebuiltWDA`. Any miss — wrong platform, unresolvable
 * driver, driver below the supported floor, no full Xcode, absent/stale
 * marker — returns null and the session builds WDA itself, exactly today's
 * behavior. Never throws.
 */
export function locateManagedWda(
  options: LocateManagedWdaOptions = {}
): ManagedWdaHit | null {
  const {
    ctx = {},
    fs = fsDefault as unknown as WdaFs,
    platform = process.platform,
    probeXcode = probeXcodeVersionCached,
    resolveDriverVersion = resolveHeavyDepVersion,
    now = Date.now,
  } = options;

  try {
    if (platform !== "darwin") return null;

    const driverVersion = resolveDriverVersion("appium-xcuitest-driver", ctx);
    if (!driverVersion) return null;
    const driverMajor = Number.parseInt(driverVersion, 10);
    if (
      !Number.isFinite(driverMajor) ||
      driverMajor < MIN_PREBUILT_WDA_DRIVER_MAJOR
    ) {
      return null;
    }

    const xcode = probeXcode();
    if (!xcode) return null;

    const wdaRoot = path.normalize(options.wdaRootDir ?? getWdaRoot(ctx));
    const key = computeWdaKey(xcode, driverVersion);
    const keyDir = path.join(wdaRoot, key);
    const marker = readProductsMarker(keyDir, fs);
    if (!marker || marker.key !== key || marker.driverVersion !== driverVersion) {
      return null;
    }

    // Readers are read-only consumers of the DerivedData — the stamp is the
    // one exception (it's the prune-freshness signal). Best-effort.
    try {
      fs.writeFileSync(path.join(keyDir, LAST_USED_STAMP), String(now()));
    } catch {
      /* a failed stamp only risks an early prune much later */
    }

    return { key, derivedDataPath: path.join(keyDir, "DerivedData") };
  } catch {
    // ADR 01049 degradation semantics: an unusable cache is a plain miss.
    return null;
  }
}

/**
 * Locate the WebDriverAgent source bundled with the installed
 * appium-xcuitest-driver: walk up from the driver's resolved entry looking
 * for a `node_modules/appium-webdriveragent` that actually contains the
 * Xcode project. The walk (rather than a hardcoded relative path) is what
 * absorbs npm's hoisting variability — nested under the driver on some
 * installs, hoisted to the runtime root on others.
 */
export function findWdaSource(
  driverEntryPath: string,
  fs: Pick<WdaFs, "existsSync">
): string | null {
  let dir = path.dirname(driverEntryPath);
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(dir, "node_modules", "appium-webdriveragent");
    if (fs.existsSync(path.join(candidate, "WebDriverAgent.xcodeproj"))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
