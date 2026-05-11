import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface InstalledNpmPackage {
  installedVersion: string;
  installedAt: string;
}

export interface InstalledBrowser {
  installedVersion: string;
  installedAt: string;
  latestKnownVersion?: string;
  latestCheckedAt?: string;
}

export interface InstalledRecord {
  npmPackages: Record<string, InstalledNpmPackage>;
  browsers: Record<string, InstalledBrowser>;
}

export interface CacheDirContext {
  cacheDir?: string;
}

function emptyRecord(): InstalledRecord {
  return { npmPackages: {}, browsers: {} };
}

function defaultCacheRoot(): string {
  return path.join(os.tmpdir(), "doc-detective");
}

/**
 * Resolve the cache root, honoring DOC_DETECTIVE_CACHE_DIR > config.cacheDir
 * > <os.tmpdir()>/doc-detective. The directory is created if missing — every
 * downstream helper depends on it existing, and lazy-mkdir at first read is
 * the single chokepoint that lets us avoid sprinkling existsSync/mkdirSync
 * across the codebase.
 */
export function getCacheDir(ctx: CacheDirContext = {}): string {
  const fromEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
  const fromCfg = typeof ctx.cacheDir === "string" ? ctx.cacheDir : undefined;
  const resolved =
    (typeof fromEnv === "string" && fromEnv.length > 0 && fromEnv) ||
    (fromCfg && fromCfg.length > 0 && fromCfg) ||
    defaultCacheRoot();
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function getRuntimeDir(ctx: CacheDirContext = {}): string {
  return path.join(getCacheDir(ctx), "runtime");
}

export function getBrowsersDir(ctx: CacheDirContext = {}): string {
  // Respect explicit cacheDir / env-var overrides first — those callers know
  // exactly where they want browsers to live.
  const fromEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
  const fromCfg = typeof ctx.cacheDir === "string" ? ctx.cacheDir : undefined;
  if ((typeof fromEnv === "string" && fromEnv.length > 0) || (fromCfg && fromCfg.length > 0)) {
    return path.join(getCacheDir(ctx), "browsers");
  }
  // No override — honor the legacy `./browser-snapshots/` directory if it
  // exists alongside the project (postinstall's pre-warm path, or a user
  // who's been running the previous version). Falling back to the tmpdir
  // cache only when the legacy dir is absent keeps existing dev / test
  // setups working through the transition.
  const legacy = path.resolve("browser-snapshots");
  if (fs.existsSync(legacy)) return legacy;
  return path.join(getCacheDir(ctx), "browsers");
}

export function getInstalledRecordPath(ctx: CacheDirContext = {}): string {
  return path.join(getCacheDir(ctx), "installed.json");
}

/**
 * Reads the installed-asset record. Returns an empty record when:
 *   - the file is missing (wipe-on-reboot, first run)
 *   - the file is unparseable (interrupted write, hand-corruption)
 *
 * Never throws. The lazy resolver treats "empty record" as "install
 * everything you need," which is the safe degradation.
 */
export function readInstalledRecord(ctx: CacheDirContext = {}): InstalledRecord {
  const filePath = getInstalledRecordPath(ctx);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") return emptyRecord();
    // Permission errors etc. — degrade rather than crash the lazy load.
    return emptyRecord();
  }
  try {
    const parsed = JSON.parse(raw);
    // Defensive shape coercion. A malformed record (corrupt write, future
    // schema change, hand-edit) shouldn't crash a reader OR a subsequent
    // writer. Both top-level slots must end up as plain objects so that
    // later `record.npmPackages[name] = …` assignments don't throw.
    return {
      npmPackages: isPlainObject(parsed?.npmPackages) ? parsed.npmPackages : {},
      browsers: isPlainObject(parsed?.browsers) ? parsed.browsers : {},
    };
  } catch {
    return emptyRecord();
  }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Atomically write the installed record. Write-to-tmp + rename ensures the
 * file is never observed half-written by a concurrent reader (e.g., another
 * `doc-detective install …` invocation racing on the same cache).
 */
export function writeInstalledRecord(
  record: InstalledRecord,
  ctx: CacheDirContext = {}
): void {
  const filePath = getInstalledRecordPath(ctx);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `installed.json.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}
