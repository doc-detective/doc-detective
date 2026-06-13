import {
  getBrowsersDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import { loadHeavyDep, type Logger } from "./loader.js";

export type BrowserAssetName = "chrome" | "firefox" | "chromedriver" | "geckodriver";

/**
 * Map a browser name to the installable asset(s) it needs to drive — the
 * browser binary plus its WebDriver. This is the single source of truth the
 * runtime install paths share (the runTests pre-flight and the runner's
 * on-demand context-gate install both consume it). Safari/webkit ship with
 * macOS, so they have no installable assets; unknown names map to nothing.
 */
export function requiredBrowserAssets(name: string | undefined): BrowserAssetName[] {
  switch ((name ?? "").toLowerCase()) {
    case "chrome":
    case "chromium":
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

  record.browsers[name] = {
    installedVersion: latest,
    installedAt: now.toISOString(),
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
    return fromModule ?? cacheDir;
  };

  if (!ctxBag.force && existing && isStillFresh(existing.latestCheckedAt, ctxBag.now)) {
    // Load the geckodriver module so the returned `path` is the actual
    // binary path, not just the cache directory — matches the contract
    // EnsureBrowserResult documents. Tests can inject `geckodriverModule`
    // via deps to skip the real loader; in production we lazy-resolve.
    const gecko =
      ctxBag.deps.geckodriverModule ??
      (await loadGeckodriver(ctxBag.deps, ctxBag.ctx));
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
  const gecko = await loadGeckodriver(ctxBag.deps, ctxBag.ctx);
  // geckodriver writes binaries into the env-var-pointed dir; alias to ours.
  const prevEnv = process.env.GECKODRIVER_CACHE_DIR;
  process.env.GECKODRIVER_CACHE_DIR = cacheDir;
  try {
    logger(`Installing geckodriver into ${cacheDir}`, "info");
    const downloadResult: any = await gecko.download();
    const resolvedVersion: string | undefined =
      (typeof gecko.GECKODRIVER_VERSION === "string"
        ? gecko.GECKODRIVER_VERSION
        : undefined) ||
      (downloadResult && typeof downloadResult.version === "string"
        ? downloadResult.version
        : undefined);
    // If neither the module nor the download result expose a version,
    // the literal string "latest" used to land in installedVersion —
    // which then broke later freshness comparisons against real
    // numeric versions. Mark as "unknown" instead and warn so the user
    // sees that future version checks will be unreliable.
    if (!resolvedVersion) {
      logger(
        "Could not determine geckodriver version after install. Freshness checks for geckodriver will be unreliable until the next forced reinstall.",
        "warn"
      );
    }
    const installedVersion: string = resolvedVersion ?? "unknown";
    record.browsers.geckodriver = {
      installedVersion,
      installedAt: ctxBag.now.toISOString(),
      latestKnownVersion: resolvedVersion,
      latestCheckedAt: ctxBag.now.toISOString(),
    };
    writeInstalledRecord(record, ctxBag.ctx);
    return {
      path: resolveBinaryPath(gecko),
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
