import {
  HEAVY_NPM_DEPS,
  getDeclaredVersion,
  satisfiesRange,
} from "./heavyDeps.js";
import {
  readInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import {
  ensureRuntimeInstalled,
  type Logger,
  type SpawnFn,
} from "./loader.js";
import {
  BROWSER_CHANNELS,
  ensureBrowserInstalled,
  type BrowserAssetName,
  type BrowserDeps,
} from "./browsers.js";

export type InstallAction =
  | "installed"
  | "updated"
  | "already-up-to-date"
  | "forced"
  | "dry-run";

export interface InstallReport {
  assetId: string;
  kind: "npm" | "browser";
  action: InstallAction;
  installedVersion?: string;
  notes?: string[];
}

export interface InstallerDeps {
  logger?: Logger;
  spawn?: SpawnFn;
  browserDeps?: BrowserDeps;
}

const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "error") console.error(msg);
  else console.log(msg);
};

export interface InstallRuntimeOptions {
  packages?: string[];
  ctx?: CacheDirContext;
  deps?: InstallerDeps;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Install the heavy npm packages into <cacheDir>/runtime. With no
 * `packages` filter, installs the full HEAVY_NPM_DEPS set. Returns one
 * structured report per package — the action describes whether the install
 * actually fired or whether the package was already current.
 */
export async function installRuntime(
  options: InstallRuntimeOptions = {}
): Promise<InstallReport[]> {
  const {
    packages,
    ctx = {},
    deps = {},
    force = false,
    dryRun = false,
  } = options;
  const logger = deps.logger ?? defaultLogger;
  const targets = packages && packages.length > 0
    ? packages
    : [...HEAVY_NPM_DEPS];
  const before = readInstalledRecord(ctx);
  const reports: InstallReport[] = [];

  if (dryRun) {
    for (const name of targets) {
      reports.push({
        assetId: name,
        kind: "npm",
        action: "dry-run",
        installedVersion: getDeclaredVersion(name),
      });
    }
    return reports;
  }

  // ensureRuntimeInstalled handles the "skip already-present" fast path
  // internally. We call it once with the full target list — single npm
  // invocation, all deps resolved together.
  await ensureRuntimeInstalled(targets, {
    ctx,
    deps: { logger, spawn: deps.spawn },
    force,
  });

  const after = readInstalledRecord(ctx);
  for (const name of targets) {
    const wasInstalled = before.npmPackages[name];
    const nowInstalled = after.npmPackages[name];
    const installedVersion = nowInstalled?.installedVersion;
    let action: InstallAction;
    if (force) action = "forced";
    else if (!wasInstalled && nowInstalled) action = "installed";
    else if (
      wasInstalled &&
      nowInstalled &&
      wasInstalled.installedVersion !== nowInstalled.installedVersion
    )
      action = "updated";
    else action = "already-up-to-date";
    reports.push({ assetId: name, kind: "npm", action, installedVersion });
  }
  return reports;
}

export interface InstallBrowsersOptions {
  names?: BrowserAssetName[];
  ctx?: CacheDirContext;
  deps?: InstallerDeps;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Install (or refresh) browser assets into <cacheDir>/browsers. Without
 * `names`, installs every supported asset.
 */
export async function installBrowsers(
  options: InstallBrowsersOptions = {}
): Promise<InstallReport[]> {
  const {
    names,
    ctx = {},
    deps = {},
    force = false,
    dryRun = false,
  } = options;
  const logger = deps.logger ?? defaultLogger;
  const targets: BrowserAssetName[] =
    names && names.length > 0
      ? names
      : (Object.keys(BROWSER_CHANNELS) as BrowserAssetName[]);
  const reports: InstallReport[] = [];

  if (dryRun) {
    for (const name of targets) {
      reports.push({
        assetId: name,
        kind: "browser",
        action: "dry-run",
        notes: [`channel: ${BROWSER_CHANNELS[name]}`],
      });
    }
    return reports;
  }

  for (const name of targets) {
    const before = readInstalledRecord(ctx).browsers[name];
    const result = await ensureBrowserInstalled(name, {
      ctx,
      deps: { ...deps.browserDeps, logger },
      force,
    });
    let action: InstallAction;
    if (force) action = "forced";
    else if (!before) action = "installed";
    else if (before.installedVersion !== result.version) action = "updated";
    else action = "already-up-to-date";
    reports.push({
      assetId: name,
      kind: "browser",
      action,
      installedVersion: result.version,
      notes: result.outdated
        ? [`installed buildId is older than channel "${BROWSER_CHANNELS[name]}"`]
        : undefined,
    });
  }
  return reports;
}

export interface StatusRow {
  assetId: string;
  kind: "npm" | "browser";
  installed: boolean;
  installedVersion?: string;
  expectedVersion?: string;
  latestKnownVersion?: string;
  outdated: boolean;
}

/**
 * Diff what's recorded in <cacheDir>/installed.json against the shim's
 * declared expectations (`package.json#optionalDependencies` for npm deps,
 * `latestKnownVersion` from the cache for browsers). The semver-range
 * check used here lives in `heavyDeps.ts` and is shared with the lazy
 * installer so both code paths see "satisfies the declared constraint"
 * the same way.
 */
export function status(ctx: CacheDirContext = {}): StatusRow[] {
  const record = readInstalledRecord(ctx);
  const rows: StatusRow[] = [];
  for (const name of HEAVY_NPM_DEPS) {
    const entry = record.npmPackages[name];
    const expected = (() => {
      try {
        return getDeclaredVersion(name);
      } catch {
        return undefined;
      }
    })();
    rows.push({
      assetId: name,
      kind: "npm",
      installed: Boolean(entry),
      installedVersion: entry?.installedVersion,
      expectedVersion: expected,
      // The package.json range is a constraint (e.g. ^7.0.0), not a
      // target — string equality would flag `7.1.2` against `^7.0.0` as
      // outdated even though npm legitimately resolved it. Use a small
      // semver-range check instead; missing data degrades to "not
      // outdated" so we don't surface false positives.
      outdated: Boolean(
        entry && expected && !satisfiesRange(entry.installedVersion, expected)
      ),
    });
  }
  for (const name of Object.keys(BROWSER_CHANNELS) as BrowserAssetName[]) {
    const entry = record.browsers[name];
    rows.push({
      assetId: name,
      kind: "browser",
      installed: Boolean(entry),
      installedVersion: entry?.installedVersion,
      latestKnownVersion: entry?.latestKnownVersion,
      outdated:
        Boolean(entry && entry.latestKnownVersion && entry.installedVersion !== entry.latestKnownVersion),
    });
  }
  return rows;
}
