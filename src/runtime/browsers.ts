import {
  getBrowsersDir,
  readInstalledRecord,
  writeInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import { loadHeavyDep, type Logger } from "./loader.js";

export type BrowserAssetName = "chrome" | "firefox" | "chromedriver" | "geckodriver";

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

const defaultLogger: Logger = (msg, level = "info") => {
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

/**
 * Install (or refresh) a browser asset into <cacheDir>/browsers.
 *
 * Missing → install latest channel buildId. Present and matches channel →
 * no-op. Present and outdated → warn (with update instructions) and proceed
 * with the installed version. force=true reinstalls and prunes the old
 * buildId from the cache.
 */
export async function ensureBrowserInstalled(
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
  if (!ctxBag.force && existing && isStillFresh(existing.latestCheckedAt, ctxBag.now)) {
    return {
      path: cacheDir,
      version: existing.installedVersion,
      outdated: existing.latestKnownVersion !== existing.installedVersion,
    };
  }
  const gecko = await loadGeckodriver(ctxBag.deps, ctxBag.ctx);
  // geckodriver writes binaries into the env-var-pointed dir; alias to ours.
  const prevEnv = process.env.GECKODRIVER_CACHE_DIR;
  process.env.GECKODRIVER_CACHE_DIR = cacheDir;
  try {
    logger(`Installing geckodriver into ${cacheDir}`, "info");
    const downloadResult: any = await gecko.download();
    const installedVersion: string =
      (typeof gecko.GECKODRIVER_VERSION === "string"
        ? gecko.GECKODRIVER_VERSION
        : undefined) ||
      (downloadResult && typeof downloadResult.version === "string"
        ? downloadResult.version
        : "latest");
    record.browsers.geckodriver = {
      installedVersion,
      installedAt: ctxBag.now.toISOString(),
      latestKnownVersion: installedVersion,
      latestCheckedAt: ctxBag.now.toISOString(),
    };
    writeInstalledRecord(record, ctxBag.ctx);
    return { path: cacheDir, version: installedVersion, outdated: false };
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
