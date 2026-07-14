import { spawn, spawnSync } from "node:child_process";
import fsDefault from "node:fs";
import path from "node:path";
import {
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
  type InstalledRecord,
} from "./cacheDir.js";
import type { Logger } from "./loader.js";
import {
  ensureRuntimeInstalled,
  resolveHeavyDepPath,
  resolveHeavyDepVersion,
} from "./loader.js";
import { acquireLock, type AcquireLockOptions, type LockHandle } from "./lock.js";
import {
  computeWdaKey,
  findWdaSource,
  getWdaRoot,
  LAST_USED_STAMP,
  MIN_PREBUILT_WDA_DRIVER_MAJOR,
  MIN_XCODE_MAJOR,
  parseXcodebuildVersion,
  PRODUCTS_MARKER,
  readProductsMarker,
  RUNNER_APP_RELATIVE,
  touchLastUsed,
  WDA_LOCK_DIRNAME,
  xcodeMajor,
  type WdaFs,
  type WdaProductsMarker,
  type XcodeVersion,
} from "./wdaProducts.js";

export interface InstallReport {
  kind: "ios";
  assetId: string;
  action: string;
  notes?: string[];
}

export interface IOSInstallerDeps {
  logger?: Logger;
  platform?: NodeJS.Platform;
  run?: (
    command: string,
    args: string[]
  ) => { status: number | null; stderr?: string; stdout?: string };
  // --- WDA prebuild effects (all injectable for hermetic tests) ---
  /** Long-running async spawn for xcodebuild (async so the lock heartbeat can fire). */
  runBuild?: (
    command: string,
    args: string[],
    opts?: { timeoutMs?: number }
  ) => Promise<{
    status: number | null;
    stdout?: string;
    stderr?: string;
    /** True when the runner killed the build at the timeout ceiling — never retried. */
    timedOut?: boolean;
  }>;
  /** Driver install, routed through the loader (npm-prune defenses stay engaged). */
  ensureInstalled?: (
    packages: string[],
    options?: { ctx?: CacheDirContext }
  ) => Promise<void>;
  resolveDriverPath?: (name: string, ctx: CacheDirContext) => string | null;
  resolveDriverVersion?: (name: string, ctx: CacheDirContext) => string | null;
  fs?: WdaFs;
  /** Test override for the managed WDA root (default: <cacheDir>/ios/wda). */
  wdaRootDir?: string;
  acquire?: (options: AcquireLockOptions) => Promise<LockHandle | null>;
  readRecord?: (ctx: CacheDirContext) => InstalledRecord;
  writeRecord?: (record: InstalledRecord, ctx: CacheDirContext) => void;
  now?: () => number;
  /** Inter-attempt backoff for the transient-build retry; no-op in tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** Ceiling for one xcodebuild build-for-testing attempt (~10 min typical cold). */
export const WDA_BUILD_TIMEOUT_MS = 20 * 60_000;

/** Total attempts for a transient xcodebuild failure (20-min ops — retry once). */
export const WDA_BUILD_MAX_ATTEMPTS = 2;

/**
 * How long a second `install ios` waits for a concurrent build before
 * skipping. Sized to cover one full build attempt (WDA_BUILD_TIMEOUT_MS,
 * 20 min — ceiling kills are never retried) plus setup slack; a transient
 * retry that pushes the holder past this window just means the contender
 * reports `skipped` and the products land for the NEXT run — best-effort.
 */
export const WDA_LOCK_WAIT_MS = 25 * 60_000;

/** Keyed build dirs whose last-used stamp is older than this get pruned. */
export const WDA_PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;

// Transient xcodebuild failure signatures — deliberately tight (the android
// installer's pattern): infrastructure blips that a fresh attempt genuinely
// heals. Anything else (compile error, bad project, signing) is a real
// failure immediately. Deliberately ABSENT: "timed out" — a build that hit
// the 20-minute ceiling must not earn a second ceiling-length attempt (a
// 40-minute worst case would blow the CI jobs' budgets); ceiling kills are
// excluded structurally via the runner's `timedOut` flag as well.
const TRANSIENT_XCODEBUILD_SIGNATURES = [
  "econnreset",
  "connection reset",
  "build service",
  "unexpectedly quit",
  "database is locked",
];

export function isTransientXcodebuildError(message: unknown): boolean {
  const lower = String(message ?? "").toLowerCase();
  return TRANSIENT_XCODEBUILD_SIGNATURES.some((sig) => lower.includes(sig));
}

function defaultRun(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    // `xcrun simctl` gets the same generous ceiling probeIosToolchain uses: the
    // first cold simctl call on a hosted macOS image launches CoreSimulator and
    // can take far longer than a warm call. The FIRST `xcodebuild -version` on
    // a fresh image pays the same first-launch initialization, and a probe
    // timeout here silently skips the whole prebuild with misleading
    // "full Xcode required" guidance — so it shares the generous bucket.
    // `xcode-select` stays a cheap lookup.
    timeout: command === "xcrun" || command === "xcodebuild" ? 120000 : 15000,
  });
  return {
    status: result.status,
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    stdout: typeof result.stdout === "string" ? result.stdout : "",
  };
}

export async function installIos({
  yes = false,
  dryRun = false,
  ctx = {},
  deps = {},
}: {
  yes?: boolean;
  dryRun?: boolean;
  ctx?: CacheDirContext;
  deps?: IOSInstallerDeps;
} = {}): Promise<InstallReport[]> {
  const logger = deps.logger ?? (() => {});
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRun;

  if (dryRun) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "dry-run",
        notes: [
          "would verify xcode-select and xcrun simctl availability on macOS",
          "would report guidance for XCUITest/WebDriverAgent prerequisites",
          "would verify or perform a WebDriverAgent prebuild (keyed by Xcode + driver version) for fast first XCUITest sessions",
        ],
      },
    ];
  }

  if (platform !== "darwin") {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "iOS simulator tooling is only available on macOS hosts",
          "run on macOS and rerun: doc-detective install ios --yes",
        ],
      },
    ];
  }

  if (!yes) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "requires --yes to run host checks and emit install guidance",
          "rerun with: doc-detective install ios --yes",
        ],
      },
    ];
  }

  const xcodeSelect = run("xcode-select", ["-p"]);
  if (xcodeSelect.status !== 0) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "Xcode command-line tools are not configured",
          "install Xcode and run xcode-select --install (or xcode-select -s <Xcode.app>)",
          (xcodeSelect.stderr || "").trim(),
        ].filter(Boolean),
      },
    ];
  }

  const simctl = run("xcrun", ["simctl", "list", "devices"]);
  if (simctl.status !== 0) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "xcrun simctl is unavailable or failed",
          "open Xcode once to finish component installation, then rerun",
          (simctl.stderr || "").trim(),
        ].filter(Boolean),
      },
    ];
  }

  logger("iOS toolchain checks passed (xcode-select + simctl).", "info");
  const toolchainReport: InstallReport = {
    kind: "ios",
    assetId: "ios-toolchain",
    action: "already-up-to-date",
    notes: [
      "xcode-select and simctl are available",
      "use a macOS fixture leg to validate iOS app-surface execution",
    ],
  };

  // Best-effort to the last: even an unexpected throw (ENOSPC on a mkdir,
  // a spawn ENOMEM, an unwritable installed.json) must degrade to a skipped
  // row — `install ios` never exits non-zero because a prebuild couldn't
  // happen, and a plain `run:` step in CI must not fail the job over it.
  let wdaReport: InstallReport;
  try {
    wdaReport = await prebuildWda({ ctx, deps, run, logger });
  } catch (error) {
    wdaReport = {
      kind: "ios",
      assetId: "ios-wda",
      action: "skipped",
      notes: [
        "the WebDriverAgent prebuild failed unexpectedly; the first iOS session will build WDA itself",
        String((error as Error)?.message ?? error),
      ],
    };
  }
  return [toolchainReport, wdaReport];
}

/* c8 ignore start — real spawn; unit tests inject runBuild. */
// Keep only the tail of each output stream: the transient-signature scan and
// the reported failure tail both live at the end, and a cold WDA build can
// emit tens of MB that would otherwise sit in memory for ~20 minutes.
const BUILD_OUTPUT_TAIL_BYTES = 64 * 1024;

function defaultRunBuild(
  command: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    // detached: give xcodebuild its own process group so a ceiling kill can
    // take down XCBBuildService/clang children too — an orphaned build
    // service holding the DerivedData would poison the keyed dir.
    const child = spawn(command, args, { windowsHide: true, detached: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (buf: string, d: unknown) =>
      (buf + d).slice(-BUILD_OUTPUT_TAIL_BYTES);
    child.stdout?.on("data", (d) => (stdout = append(stdout, d)));
    child.stderr?.on("data", (d) => (stderr = append(stderr, d)));
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        stderr += `\nxcodebuild killed at the ${opts.timeoutMs} ms ceiling`;
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, opts.timeoutMs);
      timer.unref?.();
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
/* c8 ignore stop */

// --- WebDriverAgent prebuild (docs/design/ios-wda-prebuild.md, phase 2) ---
//
// Best-effort: every failure degrades to a `skipped` report row with
// guidance; `install ios` never exits non-zero because a prebuild couldn't
// happen (the session-time fallback is today's behavior — WDA builds inside
// the first XCUITest session).

async function prebuildWda({
  ctx,
  deps,
  run,
  logger,
}: {
  ctx: CacheDirContext;
  deps: IOSInstallerDeps;
  run: NonNullable<IOSInstallerDeps["run"]>;
  logger: Logger;
}): Promise<InstallReport> {
  const fs = deps.fs ?? (fsDefault as unknown as WdaFs);
  const runBuild = deps.runBuild ?? defaultRunBuild;
  const ensureInstalled =
    deps.ensureInstalled ??
    ((packages: string[], options?: { ctx?: CacheDirContext }) =>
      ensureRuntimeInstalled(packages, options));
  const resolveDriverPath = deps.resolveDriverPath ?? resolveHeavyDepPath;
  const resolveDriverVersion =
    deps.resolveDriverVersion ?? resolveHeavyDepVersion;
  const acquire = deps.acquire ?? acquireLock;
  const readRecord = deps.readRecord ?? readInstalledRecord;
  const writeRecord = deps.writeRecord ?? writeInstalledRecord;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;

  const report = (action: string, notes: string[]): InstallReport => ({
    kind: "ios",
    assetId: "ios-wda",
    action,
    notes,
  });
  const skipped = (notes: string[]) => report("skipped", notes);

  // Only full Xcode ships xcodebuild; the Command Line Tools alone cannot
  // build WDA (and `xcode-select -p` can't tell the two apart).
  const versionProbe = run("xcodebuild", ["-version"]);
  const xcode =
    versionProbe.status === 0
      ? parseXcodebuildVersion(versionProbe.stdout)
      : null;
  if (!xcode) {
    return skipped([
      "full Xcode is required to prebuild WebDriverAgent (xcodebuild is unavailable — Command Line Tools alone are not enough)",
      "install Xcode from the App Store, run xcode-select -s <Xcode.app path>, then rerun: doc-detective install ios --yes",
      (versionProbe.stderr || "").trim(),
    ].filter(Boolean));
  }

  if (xcodeMajor(xcode) < MIN_XCODE_MAJOR) {
    return skipped([
      `Xcode ${xcode.version} is below the minimum (Xcode ${MIN_XCODE_MAJOR}) supported for the WebDriverAgent prebuild`,
      "update Xcode, then rerun: doc-detective install ios --yes",
    ]);
  }

  // The driver install is the heavy part of `install ios` now — routed
  // through the loader so the npm-prune defenses stay engaged.
  try {
    await ensureInstalled(["appium-xcuitest-driver"], { ctx });
  } catch (error) {
    return skipped([
      "installing appium-xcuitest-driver failed; the first iOS session will retry the install",
      String((error as Error)?.message ?? error),
    ]);
  }

  const driverEntry = resolveDriverPath("appium-xcuitest-driver", ctx);
  const driverVersion = resolveDriverVersion("appium-xcuitest-driver", ctx);
  if (!driverEntry || !driverVersion) {
    return skipped([
      "appium-xcuitest-driver did not resolve after install; cannot locate the WebDriverAgent source",
    ]);
  }

  // Mirror the session locator's floor: products built for a driver below it
  // would never be consumed (the locator returns null there), so a build
  // would be up to 20 minutes and ~1 GB of pure waste. Happens only with a
  // user-pinned old driver in the shim's node_modules.
  const driverMajor = Number.parseInt(driverVersion, 10);
  if (
    !Number.isFinite(driverMajor) ||
    driverMajor < MIN_PREBUILT_WDA_DRIVER_MAJOR
  ) {
    return skipped([
      `appium-xcuitest-driver ${driverVersion} is below the minimum (${MIN_PREBUILT_WDA_DRIVER_MAJOR}.x) supported for prebuilt-WDA consumption — sessions would ignore the products`,
      "upgrade the pinned driver (or remove the pin so doc-detective installs its declared version), then rerun: doc-detective install ios --yes",
    ]);
  }

  const wdaSource = findWdaSource(driverEntry, fs);
  if (!wdaSource) {
    return skipped([
      "the appium-webdriveragent package (WebDriverAgent.xcodeproj) was not found under the installed driver",
    ]);
  }

  // Normalize so the root always uses the platform separator — every keyDir
  // below goes through path.join, and a separator mismatch on an injected
  // root would silently break the prune pass's readdir prefix matching.
  const wdaRoot = path.normalize(deps.wdaRootDir ?? getWdaRoot(ctx));
  const key = computeWdaKey(xcode, driverVersion);
  const keyDir = path.join(wdaRoot, key);

  // Pre-lock fast path: a completed build for this exact toolchain.
  if (readProductsMarker(keyDir, fs)) {
    touchLastUsed(keyDir, fs, now);
    return report("already-up-to-date", [
      `WebDriverAgent build products present for ${key}`,
    ]);
  }

  const lock = await acquire({
    dir: path.join(wdaRoot, WDA_LOCK_DIRNAME),
    waitMs: WDA_LOCK_WAIT_MS,
  });
  if (!lock) {
    return skipped([
      "another install is currently building WebDriverAgent (lock wait elapsed); rerun later or let the concurrent build finish",
    ]);
  }

  try {
    // Re-check under the lock: a contender that waited out a concurrent
    // build finds the now-valid marker and must not build again (the
    // check-then-lock TOCTOU close from the design doc).
    if (readProductsMarker(keyDir, fs)) {
      touchLastUsed(keyDir, fs, now);
      return report("already-up-to-date", [
        `WebDriverAgent build products present for ${key} (built concurrently)`,
      ]);
    }

    logger(
      `Prebuilding WebDriverAgent for ${key} (first build takes ~10 minutes)…`,
      "info"
    );
    const derivedDataPath = path.join(keyDir, "DerivedData");
    fs.mkdirSync(derivedDataPath, { recursive: true });

    const buildArgs = [
      "build-for-testing",
      "-project",
      path.join(wdaSource, "WebDriverAgent.xcodeproj"),
      "-scheme",
      "WebDriverAgentRunner",
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      derivedDataPath,
    ];

    for (let attempt = 1; attempt <= WDA_BUILD_MAX_ATTEMPTS; attempt++) {
      const build = await runBuild("xcodebuild", buildArgs, {
        timeoutMs: WDA_BUILD_TIMEOUT_MS,
      });
      if (build.status === 0) break;
      const failureText = `${build.stderr ?? ""}\n${build.stdout ?? ""}`;
      // A ceiling kill is never retried: a second ceiling-length attempt
      // would double the worst case to ~40 minutes and blow the CI jobs'
      // budgets — and a build that needs >20 minutes isn't transient.
      if (build.timedOut) {
        return skipped([
          `the WebDriverAgent build was killed at the ${WDA_BUILD_TIMEOUT_MS} ms ceiling; the first iOS session will build WDA itself`,
          tail(failureText),
        ]);
      }
      if (
        attempt < WDA_BUILD_MAX_ATTEMPTS &&
        isTransientXcodebuildError(failureText)
      ) {
        logger(
          `Transient xcodebuild failure (attempt ${attempt}/${WDA_BUILD_MAX_ATTEMPTS}); retrying: ${tail(failureText)}`,
          "warn"
        );
        await sleep(attempt * 2000);
        continue;
      }
      return skipped([
        "the WebDriverAgent build failed; the first iOS session will build WDA itself",
        tail(failureText),
      ]);
    }

    const runnerApp = path.join(keyDir, RUNNER_APP_RELATIVE);
    if (!fs.existsSync(runnerApp)) {
      return skipped([
        "the WebDriverAgent build completed but its products are missing (WebDriverAgentRunner-Runner.app not found)",
        `expected: ${runnerApp}`,
      ]);
    }

    // Publish the completeness marker LAST and atomically (temp + rename) so
    // a lock-free reader never observes a half-built dir as valid.
    const marker: WdaProductsMarker = {
      key,
      driverVersion,
      xcode,
      runnerApp,
      builtAt: new Date(now()).toISOString(),
    };
    const markerPath = path.join(keyDir, PRODUCTS_MARKER);
    // Unique tmp name (the writeInstalledRecord pattern) — belt over the
    // writer lock's suspenders, so even an out-of-band writer can't clobber
    // a half-written tmp.
    const tmpPath = `${markerPath}.${now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(marker, null, 2));
    fs.renameSync(tmpPath, markerPath);
    touchLastUsed(keyDir, fs, now);

    // Record + prune in the same pass so installed.json never references a
    // deleted key. Keys are additive subdirs: "updated" means the current
    // toolchain moved to a new key, never a rebuild in place.
    const record = readRecord(ctx);
    const previousKeys = record.ios?.wdaKeys ?? [];
    const survivors = pruneStaleKeys({ wdaRoot, keepKey: key, fs, now });
    record.ios = {
      wdaKeys: survivors,
      updatedAt: new Date(now()).toISOString(),
    };
    writeRecord(record, ctx);

    const action =
      previousKeys.length > 0 && !previousKeys.includes(key)
        ? "updated"
        : "installed";
    logger(`WebDriverAgent prebuilt for ${key}.`, "info");
    return report(action, [
      `WebDriverAgent built for ${key}`,
      `products: ${runnerApp}`,
    ]);
  } finally {
    lock.release();
  }
}

/**
 * Under the writer lock: delete sibling key dirs that are provably stale —
 * no completeness marker (a crashed half-build; invisible to readers and
 * safe to clear since we hold the only writer lock), or a last-used stamp
 * older than the prune window. Returns the surviving keys, current first.
 */
function pruneStaleKeys({
  wdaRoot,
  keepKey,
  fs,
  now,
}: {
  wdaRoot: string;
  keepKey: string;
  fs: WdaFs;
  now: () => number;
}): string[] {
  const survivors = [keepKey];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(wdaRoot);
  } catch {
    return survivors;
  }
  for (const entry of entries) {
    // Skip the live lock dir itself; its `.lock.stale-*` takeover-trash
    // siblings are markerless and get cleaned like any crashed half-build.
    if (entry === keepKey || entry === WDA_LOCK_DIRNAME) continue;
    const dir = path.join(wdaRoot, entry);
    let stale = false;
    if (!readProductsMarker(dir, fs)) {
      stale = true;
    } else {
      try {
        const stamp = fs.statSync(path.join(dir, LAST_USED_STAMP));
        stale = now() - stamp.mtimeMs > WDA_PRUNE_AFTER_MS;
      } catch {
        // Marked but stampless (pre-stamp layout or manual tampering):
        // keep it — deleting live products is the worse failure.
        stale = false;
      }
    }
    if (stale) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        survivors.push(entry);
      }
    } else {
      survivors.push(entry);
    }
  }
  return survivors;
}

function tail(text: string, max = 400): string {
  const trimmed = (text || "").trim();
  return trimmed.length <= max ? trimmed : `…${trimmed.slice(-max)}`;
}
