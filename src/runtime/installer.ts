import {
  HEAVY_NPM_DEPS,
  BEST_EFFORT_NPM_DEPS,
  getDeclaredVersion,
  withPeerCompanions,
  satisfiesRange,
} from "./heavyDeps.js";
import {
  readInstalledRecord,
  type CacheDirContext,
} from "./cacheDir.js";
import {
  ensureRuntimeInstalled,
  resolveHeavyDepSource,
  resolveHeavyDepVersion,
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
  | "dry-run"
  | "skipped";

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

// Suppress `debug` by default (e.g., the npm install stdout/stderr that
// ensureRuntimeInstalled emits) so API-style callers that don't inject a
// logger don't get flooded. Mirrors the loader.ts pattern: opt back in
// with DOC_DETECTIVE_RUNTIME_DEBUG=1 for diagnostics. The CLI flow wires
// its own logger that respects config.logLevel, so this only governs
// the bare programmatic path.
const RUNTIME_DEBUG = process.env.DOC_DETECTIVE_RUNTIME_DEBUG === "1";
const defaultLogger: Logger = (msg, level = "info") => {
  if (level === "debug" && !RUNTIME_DEBUG) return;
  if (level === "error") console.error(msg);
  else console.log(msg);
};

/**
 * Per-npm-child wall-clock cap for bulk runtime installs. The full
 * HEAVY_NPM_DEPS batch is ~1000 packages and can legitimately outlast the
 * loader's 5-minute single-package default on slow CI runners — the
 * postinstall pre-warm's npm child was reliably killed at 5:00 there,
 * forfeiting the pre-warm and stranding the extracted packages as orphans
 * (ADR 01034 made the orphans safe; this cap stops the kill — ADR 01035).
 * Kept below the postinstall's 10-minute outer ceiling
 * (scripts/postinstall.js) so a genuinely hung npm still dies — and gets
 * reported by ensureRuntimeInstalled's timeout error — before the ceiling
 * silently tears the whole pre-warm down.
 */
export const BULK_INSTALL_TIMEOUT_MS = 9 * 60 * 1000;

export interface InstallRuntimeOptions {
  packages?: string[];
  ctx?: CacheDirContext;
  deps?: InstallerDeps;
  force?: boolean;
  dryRun?: boolean;
  /**
   * Wall-clock cap for each spawned npm child; defaults to
   * BULK_INSTALL_TIMEOUT_MS (not the loader's smaller single-package
   * default). Must be a non-negative number; pass `0` to disable.
   */
  installTimeoutMs?: number;
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
    installTimeoutMs = BULK_INSTALL_TIMEOUT_MS,
  } = options;
  // ensureRuntimeInstalled treats any value ≤ 0 as "no timeout" (its
  // `installTimeoutMs > 0` gate), so a negative/NaN value passed here by
  // mistake would silently remove hang protection. Only an explicit 0 may
  // disable; reject everything else that isn't a non-negative finite number.
  if (!Number.isFinite(installTimeoutMs) || installTimeoutMs < 0) {
    throw new Error(
      `installTimeoutMs must be a non-negative number of milliseconds (0 disables the timeout); got ${installTimeoutMs}.`
    );
  }
  const logger = deps.logger ?? defaultLogger;
  const targets = packages && packages.length > 0
    ? packages
    : [...HEAVY_NPM_DEPS];
  const before = readInstalledRecord(ctx);
  const reports: InstallReport[] = [];

  if (dryRun) {
    // `installedVersion` describes what is *on disk*; in a dry run nothing
    // has changed on disk yet. Surface the declared package.json range in
    // `notes` instead so consumers don't render a constraint string (e.g.
    // `^7.0.0`) in a column that elsewhere shows a resolved version.
    // Expand with peer companions so the dry-run report matches what the real
    // install actually fetches (e.g. proxy-agent alongside @puppeteer/browsers).
    for (const name of withPeerCompanions(targets)) {
      reports.push({
        assetId: name,
        kind: "npm",
        action: "dry-run",
        notes: [`would install ${name}@${getDeclaredVersion(name)}`],
      });
    }
    return reports;
  }

  // ensureRuntimeInstalled handles the "skip already-present" fast path
  // internally. Install the CORE deps in a single npm invocation (all resolved
  // together). Best-effort deps (native, no reliable prebuilds across the matrix
  // — e.g. node-pty) are installed SEPARATELY and failure-tolerant, so a build
  // failure on one platform doesn't abort the whole batch; the feature degrades
  // to SKIP at runtime instead.
  const coreTargets = targets.filter((t) => !BEST_EFFORT_NPM_DEPS.has(t));
  const optionalTargets = targets.filter((t) => BEST_EFFORT_NPM_DEPS.has(t));

  await ensureRuntimeInstalled(coreTargets, {
    ctx,
    deps: { logger, spawn: deps.spawn },
    force,
    installTimeoutMs,
  });

  const bestEffortFailed = new Set<string>();
  for (const name of optionalTargets) {
    try {
      await ensureRuntimeInstalled([name], {
        ctx,
        deps: { logger, spawn: deps.spawn },
        force,
        installTimeoutMs,
      });
    } catch {
      // Non-fatal: the dep has no installable binary here; runtime SKIPs it.
      bestEffortFailed.add(name);
    }
  }

  const after = readInstalledRecord(ctx);
  // ensureRuntimeInstalled also installs and records peer companions (e.g.
  // proxy-agent alongside @puppeteer/browsers), so report on the expanded set
  // — otherwise the result omits packages that were actually installed, and
  // diverges from the dry-run report.
  for (const name of withPeerCompanions(targets)) {
    if (bestEffortFailed.has(name)) {
      reports.push({
        assetId: name,
        kind: "npm",
        action: "skipped",
        notes: ["optional native dependency; install failed and was skipped"],
      });
      continue;
    }
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
    // A package counts as installed when it's recorded in the cache OR
    // resolvable from the shim's node_modules / runtime cache — the same
    // presence check `ensureRuntimeInstalled` uses to report
    // "already-up-to-date". Without the resolvable fallback, `status`
    // showed `installed=—` for pre-installed optionalDependencies (and dev
    // checkouts) that `install all` reports as present — an inconsistency.
    //
    // The package.json range is a constraint (e.g. ^7.0.0), not a target —
    // string equality would flag `7.1.2` against `^7.0.0` as outdated even
    // though npm legitimately resolved it; use a semver-range check, and
    // only where the installer would actually act on it:
    //   - cache record / cache resolution → freshness-checked (the
    //     installer reinstalls a stale cache);
    //   - shim resolution → never flagged outdated (the installer never
    //     overrides a shim-pinned version), matching `install all`.
    // Mirror the runtime resolution order: the shim's node_modules wins
    // over the cache. A shim-resolved package is never "outdated" because
    // ensureRuntimeInstalled never overrides a shim-pinned version — so a
    // stale cache record must NOT flag a shim-resolved dep as outdated.
    // Only genuine cache installs are freshness-checked against the range.
    const source = resolveHeavyDepSource(name, ctx);
    let installed = false;
    let installedVersion: string | undefined;
    let outdated = false;
    if (source === "shim") {
      installed = true;
      installedVersion = resolveHeavyDepVersion(name, ctx) ?? undefined;
    } else if (entry) {
      installed = true;
      installedVersion = entry.installedVersion;
      outdated = Boolean(expected && !satisfiesRange(entry.installedVersion, expected));
    } else if (source === "cache") {
      // Resolvable in the cache but no record entry (edge case) — still a
      // cache install, so apply the same freshness check.
      installed = true;
      installedVersion = resolveHeavyDepVersion(name, ctx) ?? undefined;
      outdated = Boolean(
        installedVersion && expected && !satisfiesRange(installedVersion, expected)
      );
    }
    rows.push({
      assetId: name,
      kind: "npm",
      installed,
      installedVersion,
      expectedVersion: expected,
      outdated,
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
