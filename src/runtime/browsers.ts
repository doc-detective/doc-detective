import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getBrowsersDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import { loadHeavyDep, type Logger } from "./loader.js";

export type BrowserAssetName = "chrome" | "firefox" | "chromedriver" | "geckodriver";

/** Outcome of executing a driver binary to confirm it actually works. */
export interface DriverVerifyResult {
  ok: boolean;
  version?: string;
  error?: string;
}

/**
 * Injectable executor for `verifyDriverBinary`. Resolves with the child's
 * exit code (null when the process couldn't be spawned) plus its captured
 * output. Tests inject a fake; production uses {@link defaultDriverExec}.
 */
export type DriverExec = (
  binaryPath: string,
  args: string[],
  timeoutMs: number
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

// Every WebDriver we manage answers `--version`. Kept as a table so adding
// an engine later is a one-line change rather than a new code branch.
const DRIVER_VERSION_ARGS: Record<string, string[]> = {
  geckodriver: ["--version"],
  chromedriver: ["--version"],
  safaridriver: ["--version"],
};

const DRIVER_VERIFY_TIMEOUT_MS = 10_000;

// The only executables `verifyDriverBinary` is ever allowed to run. The path it
// receives is derived from the (user-configurable) cache dir, so before it
// reaches a child-process call we constrain the value itself: it must be an
// absolute path ending in a recognized WebDriver filename (a path separator
// immediately precedes the name, so it's the final segment). Testing the whole
// path with a single anchored regex — rather than a derived basename — both
// refuses an arbitrarily-named binary and gives static analysis a barrier on
// the exact value that reaches the child process.
const ALLOWED_DRIVER_PATH =
  /[\\/](?:geckodriver|chromedriver|safaridriver)(?:\.exe)?$/i;

function isAllowedDriverPath(binaryPath: string): boolean {
  return (
    typeof binaryPath === "string" &&
    path.isAbsolute(binaryPath) &&
    ALLOWED_DRIVER_PATH.test(binaryPath)
  );
}

// A version is any dotted numeric run in the output ("geckodriver 0.36.0",
// "ChromeDriver 124.0.6367.207", "Included with Safari 17.4 ..."). A binary
// that runs but emits nothing version-shaped is treated as broken — that is
// exactly the partial-download symptom this guards against.
function parseDriverVersion(output: string): string | undefined {
  const m = output.match(/(\d+\.\d+(?:\.\d+)*)/);
  return m ? m[1] : undefined;
}

const defaultDriverExec: DriverExec = (binaryPath, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      binaryPath,
      args,
      { timeout: timeoutMs, windowsHide: true },
      (err: any, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : String(stdout ?? "");
        const errOut = typeof stderr === "string" ? stderr : String(stderr ?? "");
        if (err && typeof err.code === "number") {
          // Real process exit with a non-zero status.
          resolve({ code: err.code, stdout: out, stderr: errOut });
        } else if (err) {
          // Spawn failure (ENOENT, EACCES, timeout, …) — no exit code.
          resolve({ code: null, stdout: out, stderr: `${errOut}${String(err)}` });
        } else {
          resolve({ code: 0, stdout: out, stderr: errOut });
        }
      }
    );
  });

/**
 * Execute a driver binary and confirm it is functional — i.e. it runs and
 * reports a parseable version. This is the single guard that stops a
 * present-but-broken driver (e.g. a partially downloaded geckodriver on
 * Windows that exists on disk but doesn't run) from being trusted as
 * installed. Driver-agnostic: works for geckodriver, chromedriver, and
 * safaridriver.
 */
export async function verifyDriverBinary(
  driverName: string,
  binaryPath: string,
  options: { exec?: DriverExec; timeoutMs?: number } = {}
): Promise<DriverVerifyResult> {
  if (!binaryPath || typeof binaryPath !== "string") {
    return { ok: false, error: "No driver binary path to verify." };
  }
  // Constrain the executable to a known WebDriver at an absolute path before it
  // reaches a child process. The path derives from the user-configurable cache
  // dir, so refuse anything that isn't a recognized driver binary.
  if (!isAllowedDriverPath(binaryPath)) {
    return {
      ok: false,
      error: `Refusing to execute '${binaryPath}': not a recognized driver binary path.`,
    };
  }
  const key = String(driverName ?? "").toLowerCase();
  const args = DRIVER_VERSION_ARGS[key] ?? ["--version"];
  const exec = options.exec ?? defaultDriverExec;
  const timeoutMs = options.timeoutMs ?? DRIVER_VERIFY_TIMEOUT_MS;

  let res: { code: number | null; stdout: string; stderr: string };
  try {
    res = await exec(binaryPath, args, timeoutMs);
  } catch (err) {
    return { ok: false, error: `Failed to execute ${driverName}: ${String(err)}` };
  }
  if (res.code === null) {
    // No exit code means the process never ran (ENOENT, EACCES, timeout, …) —
    // report it as a spawn failure rather than the misleading "exited with
    // code null".
    const detail = (res.stderr || res.stdout || "").trim();
    return {
      ok: false,
      error: `${driverName} could not be executed (spawn failed)${detail ? `: ${detail}` : ""}`,
    };
  }
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    return {
      ok: false,
      error: `${driverName} exited with code ${res.code}${detail ? `: ${detail}` : ""}`,
    };
  }
  const version = parseDriverVersion(`${res.stdout}\n${res.stderr}`);
  if (!version) {
    return {
      ok: false,
      error: `${driverName} ran but did not report a parseable version (likely a partial or corrupt download).`,
    };
  }
  return { ok: true, version };
}

/**
 * Map a browser name to the installable asset(s) it needs to drive — the
 * browser binary plus its WebDriver. This is the single source of truth the
 * runtime install paths share (the runTests pre-flight and the runner's
 * on-demand context-gate install both consume it). Safari/webkit ship with
 * macOS, so they have no installable assets; unknown names map to nothing.
 *
 * Only schema-valid driver browser names are mapped. "chromium" is
 * intentionally absent: it isn't in the runner's KNOWN_BROWSERS, so installing
 * Chrome for it wouldn't make the context runnable end-to-end (isSupportedContext
 * and getDriverCapabilities key off the exact name) — mapping it would install
 * assets that then go unused.
 */
export function requiredBrowserAssets(name: string | undefined): BrowserAssetName[] {
  switch ((name ?? "").toLowerCase()) {
    case "chrome":
      return ["chrome", "chromedriver"];
    case "firefox":
      return ["firefox", "geckodriver"];
    default:
      return [];
  }
}

/**
 * The one place browser channel selection lives. Exact buildIds are NOT
 * pinned in source — they are resolved against @puppeteer/browsers at
 * install time so an `install browsers --force` always picks up the
 * channel's current build.
 */
export const BROWSER_CHANNELS = {
  chrome: "stable",
  firefox: "latest",
  chromedriver: "stable",
  geckodriver: "latest",
} as const;

const FRESHNESS_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESOLVE_TIMEOUT_MS = 5_000;

export interface EnsureBrowserResult {
  /** Absolute path to the executable (or driver binary). */
  path: string;
  /** Resolved buildId / version string for the installed asset. */
  version: string;
  /** True when the installed buildId is older than the channel's current. */
  outdated: boolean;
}

export interface BrowserDeps {
  logger?: Logger;
  /**
   * Injected `@puppeteer/browsers` namespace for tests. When omitted the
   * helper lazy-loads it via loadHeavyDep.
   */
  browsersModule?: any;
  /** Injected `geckodriver` namespace for tests. */
  geckodriverModule?: any;
  /** Injected driver executor for `verifyDriverBinary` (tests stub it). */
  verifyExec?: DriverExec;
  /** Wall-clock for freshness gating — tests inject a fixed time. */
  now?: () => Date;
}

// Suppress `debug` by default — ensureBrowserInstalled uses it for
// recoverable situations (channel-resolve timeouts, prune failures, etc.)
// that callers shouldn't see when they don't inject a logger. Mirrors
// the loader.ts / installer.ts pattern: opt back in with
// DOC_DETECTIVE_RUNTIME_DEBUG=1 for diagnostics. The CLI/test-runner
// flow wires its own logger that respects config.logLevel, so this only
// governs the bare programmatic path.
const RUNTIME_DEBUG = process.env.DOC_DETECTIVE_RUNTIME_DEBUG === "1";
const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "debug" && !RUNTIME_DEBUG) return;
  if (level === "error") console.error(msg);
  else console.log(msg);
};

async function loadPuppeteerBrowsers(deps: BrowserDeps, ctx: CacheDirContext) {
  if (deps.browsersModule) return deps.browsersModule;
  return await loadHeavyDep<any>("@puppeteer/browsers", { ctx, deps: { logger: deps.logger } });
}

async function loadGeckodriver(deps: BrowserDeps, ctx: CacheDirContext) {
  if (deps.geckodriverModule) return deps.geckodriverModule;
  return await loadHeavyDep<any>("geckodriver", { ctx, deps: { logger: deps.logger } });
}

function isStillFresh(latestCheckedAt: string | undefined, now: Date): boolean {
  if (!latestCheckedAt) return false;
  const t = Date.parse(latestCheckedAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < FRESHNESS_TTL_MS;
}

async function resolveChannelBuildId(
  browsersModule: any,
  assetName: BrowserAssetName,
  platform: any
): Promise<string> {
  const channel = BROWSER_CHANNELS[assetName];
  return await withTimeout(
    Promise.resolve(
      browsersModule.resolveBuildId(assetName, platform, channel)
    ),
    RESOLVE_TIMEOUT_MS,
    `resolveBuildId(${assetName}, ${channel})`
  );
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    // unref so a still-pending timer doesn't keep the event loop alive
    // (e.g., if the wrapped promise rejects and the caller has nothing
    // else holding the process open).
    if (typeof t.unref === "function") t.unref();
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

export interface EnsureBrowserOptions {
  ctx?: CacheDirContext;
  deps?: BrowserDeps;
  force?: boolean;
}

// Process-wide dedupe for concurrent installs targeting the same
// (name, cacheDir). Without this, two parallel `runTests` invocations
// (e.g., the appium-port-conflict.test.js parallel scenario) would
// both pass the not-installed check, both call @puppeteer/browsers'
// `install`, and race on the extract step — leaving a half-written
// archive on disk that fails Firefox's own binary self-check with
// "binary is not a Firefox executable" on the next launch.
const inFlightInstalls = new Map<string, Promise<EnsureBrowserResult>>();

/**
 * Install (or refresh) a browser asset into <cacheDir>/browsers.
 *
 * Missing → install latest channel buildId. Present and matches channel →
 * no-op. Present and outdated → warn (with update instructions) and proceed
 * with the installed version. force=true reinstalls and prunes the old
 * buildId from the cache.
 *
 * Concurrent calls for the same (name, cacheDir) share a single
 * in-flight promise so parallel installs can't corrupt each other.
 */
export async function ensureBrowserInstalled(
  name: BrowserAssetName,
  options: EnsureBrowserOptions = {}
): Promise<EnsureBrowserResult> {
  const { ctx = {} } = options;
  const dedupeKey = `${name}:${getBrowsersDir(ctx)}`;
  const inFlight = inFlightInstalls.get(dedupeKey);
  if (inFlight) return inFlight;
  const p = ensureBrowserInstalledImpl(name, options).finally(() => {
    inFlightInstalls.delete(dedupeKey);
  });
  inFlightInstalls.set(dedupeKey, p);
  return p;
}

async function ensureBrowserInstalledImpl(
  name: BrowserAssetName,
  options: EnsureBrowserOptions = {}
): Promise<EnsureBrowserResult> {
  const { ctx = {}, deps = {}, force = false } = options;
  const logger = deps.logger ?? defaultLogger;
  const now = (deps.now ?? (() => new Date()))();
  const cacheDir = getBrowsersDir(ctx);
  const record = readInstalledRecord(ctx);
  const existing = record.browsers[name];

  if (name === "geckodriver") {
    return await ensureGeckodriver(
      { ctx, deps: { ...deps, logger }, force, now },
      record,
      existing,
      logger
    );
  }

  const browsersModule = await loadPuppeteerBrowsers(deps, ctx);
  const platform: any = browsersModule.detectBrowserPlatform
    ? browsersModule.detectBrowserPlatform()
    : undefined;
  // `@puppeteer/browsers` returns `undefined` from detectBrowserPlatform
  // on unsupported OSes. Downstream APIs — resolveBuildId, install,
  // computeExecutablePath — require a real BrowserPlatform value; if
  // we pass undefined, computeExecutablePath in particular throws with
  // a less actionable "No platform specified" deep inside the lib.
  // Surface a clean error from the same call site that owns the rest
  // of the install flow.
  if (!platform) {
    throw new Error(
      `Unable to determine browser platform on ${process.platform}/${process.arch}. @puppeteer/browsers does not recognize this OS; ${name} cannot be installed automatically. Set DOC_DETECTIVE_CACHE_DIR to a pre-warmed cache or skip browser-driven steps.`
    );
  }

  // Fast path: present and the freshness check says we already know the
  // current channel buildId — no resolveBuildId network call needed.
  if (!force && existing && isStillFresh(existing.latestCheckedAt, now)) {
    if (existing.latestKnownVersion === existing.installedVersion) {
      const path = await locateExecutable(
        browsersModule,
        name,
        existing.installedVersion,
        cacheDir,
        platform
      );
      return { path, version: existing.installedVersion, outdated: false };
    }
    // Cached metadata says we're stale.
    const path = await locateExecutable(
      browsersModule,
      name,
      existing.installedVersion,
      cacheDir,
      platform
    );
    logger(
      `${name} ${existing.installedVersion} installed in ${cacheDir}; "${BROWSER_CHANNELS[name]}" channel is now ${existing.latestKnownVersion}. Run \`doc-detective install browsers ${name} --force\` to update.`,
      "warn"
    );
    return { path, version: existing.installedVersion, outdated: true };
  }

  // Slow path: re-resolve the channel buildId. Bounded by a short timeout so
  // a network hiccup never blocks the run — we degrade to "still current."
  let latest: string;
  try {
    latest = await resolveChannelBuildId(browsersModule, name, platform);
  } catch (err) {
    logger(`Channel resolution for ${name} skipped: ${String(err)}`, "debug");
    if (existing) {
      const path = await locateExecutable(
        browsersModule,
        name,
        existing.installedVersion,
        cacheDir,
        platform
      );
      return { path, version: existing.installedVersion, outdated: false };
    }
    throw err;
  }

  if (!force && existing && existing.installedVersion === latest) {
    record.browsers[name] = {
      ...existing,
      latestKnownVersion: latest,
      latestCheckedAt: now.toISOString(),
    };
    writeInstalledRecord(record, ctx);
    const path = await locateExecutable(
      browsersModule,
      name,
      latest,
      cacheDir,
      platform
    );
    return { path, version: latest, outdated: false };
  }

  if (!force && existing) {
    // Present but stale — warn-only, do NOT replace.
    record.browsers[name] = {
      ...existing,
      latestKnownVersion: latest,
      latestCheckedAt: now.toISOString(),
    };
    writeInstalledRecord(record, ctx);
    logger(
      `${name} ${existing.installedVersion} installed in ${cacheDir}; "${BROWSER_CHANNELS[name]}" channel is now ${latest}. Run \`doc-detective install browsers ${name} --force\` to update.`,
      "warn"
    );
    const path = await locateExecutable(
      browsersModule,
      name,
      existing.installedVersion,
      cacheDir,
      platform
    );
    return { path, version: existing.installedVersion, outdated: true };
  }

  // Install path (missing OR force).
  logger(`Installing ${name} ${latest} into ${cacheDir}`, "info");
  await browsersModule.install({
    browser: name,
    buildId: latest,
    cacheDir,
  });

  // If we're replacing an existing buildId, prune the old install so old
  // versions don't accumulate.
  if (existing && existing.installedVersion !== latest) {
    try {
      await browsersModule.uninstall({
        browser: name,
        buildId: existing.installedVersion,
        cacheDir,
      });
    } catch (err) {
      logger(
        `Failed to prune old ${name} buildId ${existing.installedVersion}: ${String(err)}`,
        "debug"
      );
    }
  }

  let path = await locateExecutable(
    browsersModule,
    name,
    latest,
    cacheDir,
    platform
  );

  // For drivers, validate by execution before recording the install. A
  // browser binary (chrome/firefox) is launched by the driver and self-checks
  // at session start, but the driver itself is the thing that, when partially
  // downloaded, runs and fails — so confirm it actually reports a version. On
  // failure, reinstall exactly once (force a clean extract), then give up.
  if (name === "chromedriver") {
    let verify = await verifyDriverBinary(name, path, { exec: deps.verifyExec });
    if (!verify.ok) {
      logger(
        `Installed ${name} ${latest} failed validation (${verify.error}); reinstalling once.`,
        "warn"
      );
      try {
        await browsersModule.uninstall({ browser: name, buildId: latest, cacheDir });
      } catch (err) {
        logger(`Failed to prune broken ${name} ${latest}: ${String(err)}`, "debug");
      }
      await browsersModule.install({ browser: name, buildId: latest, cacheDir });
      path = await locateExecutable(browsersModule, name, latest, cacheDir, platform);
      verify = await verifyDriverBinary(name, path, { exec: deps.verifyExec });
    }
    if (!verify.ok) {
      throw new Error(
        `${name} ${latest} is present but non-functional after a reinstall (${verify.error}). It may be a partial or corrupt download; delete ${path} or reinstall.`
      );
    }
  }

  record.browsers[name] = {
    installedVersion: latest,
    installedAt: now.toISOString(),
    latestKnownVersion: latest,
    latestCheckedAt: now.toISOString(),
  };
  writeInstalledRecord(record, ctx);
  return { path, version: latest, outdated: false };
}

async function locateExecutable(
  browsersModule: any,
  name: BrowserAssetName,
  buildId: string,
  cacheDir: string,
  platform: any
): Promise<string> {
  if (typeof browsersModule.computeExecutablePath === "function") {
    return browsersModule.computeExecutablePath({
      browser: name,
      buildId,
      cacheDir,
      platform,
    });
  }
  // Fallback: report the cache dir; consumer can probe further.
  return cacheDir;
}

// Geckodriver lives in its own npm package (not under @puppeteer/browsers).
// Channel resolution is "always latest stable from Mozilla" via
// geckodriver.download(); the package's GECKODRIVER_VERSION env var would
// pin a specific version, but we leave it unset to track latest.
async function ensureGeckodriver(
  ctxBag: {
    ctx: CacheDirContext;
    deps: BrowserDeps;
    force: boolean;
    now: Date;
  },
  record: ReturnType<typeof readInstalledRecord>,
  existing: any,
  logger: Logger
): Promise<EnsureBrowserResult> {
  const cacheDir = getBrowsersDir(ctxBag.ctx);
  // Resolve the actual geckodriver binary path. The npm package exports
  // a `.path` field that points at the resolved binary; if that's
  // missing (older versions, future shape changes), fall back to the
  // cache directory so callers at least have a useful starting point.
  const resolveBinaryPath = (gecko: any): string => {
    const fromModule =
      gecko && typeof gecko.path === "string" && gecko.path.length > 0
        ? gecko.path
        : null;
    if (fromModule) return fromModule;
    // The geckodriver module doesn't always expose `.path` (it can be empty
    // until/at download). Probe the cache for the actual binary the download
    // wrote — the bare cacheDir would otherwise fail the driver-binary
    // validation and trigger an avoidable reinstall+throw. Look at the cache
    // root and one level deep (some layouts nest under a version dir).
    const binName =
      process.platform === "win32" ? "geckodriver.exe" : "geckodriver";
    const rootCandidate = path.join(cacheDir, binName);
    try {
      if (fs.existsSync(rootCandidate)) return rootCandidate;
    } catch {
      // ignore and fall through to the shallow scan
    }
    try {
      for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const nested = path.join(cacheDir, entry.name, binName);
        if (fs.existsSync(nested)) return nested;
      }
    } catch {
      // cacheDir unreadable/missing — fall back to the dir (validation will
      // then surface a clear "non-functional" error, which is accurate).
    }
    return cacheDir;
  };

  if (!ctxBag.force && existing && isStillFresh(existing.latestCheckedAt, ctxBag.now)) {
    // Load the geckodriver module so the returned `path` is the actual
    // binary path, not just the cache directory — matches the contract
    // EnsureBrowserResult documents. Tests can inject `geckodriverModule`
    // via deps to skip the real loader; in production we lazy-resolve.
    // geckodriver resolves `.path` from GECKODRIVER_CACHE_DIR at module load,
    // so point it at our cache before loading (and restore after).
    const prevEnv = process.env.GECKODRIVER_CACHE_DIR;
    process.env.GECKODRIVER_CACHE_DIR = cacheDir;
    let gecko: any;
    try {
      gecko =
        ctxBag.deps.geckodriverModule ??
        (await loadGeckodriver(ctxBag.deps, ctxBag.ctx));
    } finally {
      if (prevEnv === undefined) delete process.env.GECKODRIVER_CACHE_DIR;
      else process.env.GECKODRIVER_CACHE_DIR = prevEnv;
    }
    return {
      path: resolveBinaryPath(gecko),
      version: existing.installedVersion,
      // Only mark outdated when we actually KNOW a different latest
      // version exists. If `latestKnownVersion` is undefined (e.g., the
      // installer couldn't determine a version and we recorded
      // `installedVersion: "unknown"` with `latestKnownVersion: undefined`),
      // a naive `!==` comparison would flag the entry as outdated on
      // every run.
      outdated:
        typeof existing.latestKnownVersion === "string" &&
        existing.latestKnownVersion.length > 0 &&
        existing.latestKnownVersion !== existing.installedVersion,
    };
  }
  // geckodriver writes binaries into — and resolves `.path`/version from — the
  // env-var-pointed dir at module load, so alias it to our cache BEFORE loading
  // the module; otherwise resolveBinaryPath(gecko) can point at the wrong path.
  const prevEnv = process.env.GECKODRIVER_CACHE_DIR;
  process.env.GECKODRIVER_CACHE_DIR = cacheDir;
  try {
    const gecko = await loadGeckodriver(ctxBag.deps, ctxBag.ctx);
    logger(`Installing geckodriver into ${cacheDir}`, "info");
    await gecko.download();
    // Validate by execution, not just presence: a partial download (seen on
    // Windows) leaves a binary on disk that doesn't actually run. If the
    // first download fails validation, quarantine the artifact and
    // re-download exactly once before giving up.
    let binaryPath = resolveBinaryPath(gecko);
    let verify = await verifyDriverBinary("geckodriver", binaryPath, {
      exec: ctxBag.deps.verifyExec,
    });
    if (!verify.ok) {
      logger(
        `Downloaded geckodriver failed validation (${verify.error}); re-downloading once.`,
        "warn"
      );
      try {
        if (binaryPath && binaryPath !== cacheDir && fs.existsSync(binaryPath)) {
          fs.rmSync(binaryPath, { force: true });
        }
      } catch {
        // Best-effort quarantine; re-download will overwrite regardless.
      }
      await gecko.download();
      binaryPath = resolveBinaryPath(gecko);
      verify = await verifyDriverBinary("geckodriver", binaryPath, {
        exec: ctxBag.deps.verifyExec,
      });
    }
    if (!verify.ok) {
      // Don't launder a broken binary into a "valid" record. Throwing lets
      // the install-gate caller record this asset as failed, and the runner
      // surface a diagnostic skip / fall back to another browser.
      throw new Error(
        `geckodriver is present but non-functional after a re-download (${verify.error}). It may be a partial or corrupt download; delete ${binaryPath} or reinstall.`
      );
    }
    // The validated binary's own --version output is the source of truth —
    // never record "unknown".
    const installedVersion: string = verify.version as string;
    record.browsers.geckodriver = {
      installedVersion,
      installedAt: ctxBag.now.toISOString(),
      latestKnownVersion: installedVersion,
      latestCheckedAt: ctxBag.now.toISOString(),
    };
    writeInstalledRecord(record, ctxBag.ctx);
    return {
      path: binaryPath,
      version: installedVersion,
      outdated: false,
    };
  } finally {
    if (prevEnv === undefined) delete process.env.GECKODRIVER_CACHE_DIR;
    else process.env.GECKODRIVER_CACHE_DIR = prevEnv;
  }
}

/**
 * Read the installed-browsers record without resolving or installing
 * anything. Mirrors @puppeteer/browsers.getInstalledBrowsers() but reads
 * from our cache record rather than rescanning the filesystem.
 */
export function getInstalledBrowsers(ctx: CacheDirContext = {}): Array<{
  name: string;
  installedVersion: string;
  installedAt: string;
  latestKnownVersion?: string;
}> {
  const record = readInstalledRecord(ctx);
  return Object.entries(record.browsers).map(([name, entry]) => ({
    name,
    installedVersion: entry.installedVersion,
    installedAt: entry.installedAt,
    latestKnownVersion: entry.latestKnownVersion,
  }));
}
