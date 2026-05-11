import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // No override — honor the legacy `./browser-snapshots/` directory if one
  // exists from a prior install. The old postinstall ran the browser
  // download from the package root (it `chdir`'d there before calling
  // `path.resolve('browser-snapshots')`), so we have to look in BOTH
  // places: the user's current cwd (covers same-project dev loops) and
  // the shim's install root (covers global installs invoked from
  // anywhere). First hit wins; the tmpdir cache is only used when neither
  // legacy location exists.
  for (const candidate of legacyBrowserSnapshotCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(getCacheDir(ctx), "browsers");
}

function legacyBrowserSnapshotCandidates(): string[] {
  const out = [path.resolve("browser-snapshots")];
  // dist/runtime/cacheDir.js → ../.. → the shim's package root.
  const shimRoot = path.resolve(__dirname, "..", "..");
  const fromShim = path.join(shimRoot, "browser-snapshots");
  if (fromShim !== out[0]) out.push(fromShim);
  return out;
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
  try {
    fs.renameSync(tmp, filePath);
  } catch (err: any) {
    // POSIX `rename` is overwrite-atomic, but on Windows a destination
    // that's open in another process (or sometimes just exists) can
    // throw EEXIST/EPERM. Fall back to remove-then-rename so repeated
    // writes don't break `install …` and lazy installs. Still not as
    // strong as the POSIX guarantee — a crash between the unlink and
    // the rename leaves the cache without an installed.json — but the
    // readers already degrade to an empty record in that case.
    if (err && (err.code === "EEXIST" || err.code === "EPERM")) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // best-effort
      }
      fs.renameSync(tmp, filePath);
    } else {
      throw err;
    }
  }
}
