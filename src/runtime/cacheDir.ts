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
  // Trim env / ctx values so whitespace-only inputs ("   ") are
  // ignored. The schema enforces `pattern: \\S` on `config.cacheDir`
  // and the CLI override trims as well; doing the same here keeps
  // the env-var path consistent (DOC_DETECTIVE_CACHE_DIR doesn't
  // pass through schema validation) and prevents the surprise of
  // creating a "   " directory relative to the cwd.
  const resolved =
    trimOrUndefined(process.env.DOC_DETECTIVE_CACHE_DIR) ??
    trimOrUndefined(ctx.cacheDir) ??
    defaultCacheRoot();
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Reject paths that contain shell-metacharacters, so call sites that
 * must spawn a `.cmd` shim with `shell: true` on Windows (Node 18+
 * refuses `.cmd` without shell:true with EINVAL) can do so safely.
 * The cache dir comes from user-controlled inputs (DOC_DETECTIVE_CACHE_DIR
 * or config.cacheDir), so this is the validation that pairs with the
 * spawn-via-shell on Windows. Linux/macOS spawn the real `npm` binary
 * without a shell and don't need this gate, but applying it uniformly
 * keeps both platforms on the same contract.
 *
 * Characters rejected (matching `SHELL_METAS` exactly):
 *   - POSIX sh/bash:  ;  &  |  `  $  <  >  "  '  newline  carriage-return
 *   - cmd.exe:        %  (`%VAR%` expansion)
 *                     ^  (escape character)
 *                     !  (delayed-expansion variable, when /v:on active)
 *
 * Space is intentionally NOT rejected — Node properly quotes single
 * args containing spaces even with shell:true on Windows, and paths
 * like `C:\Users\John Doe\…` are common enough that rejecting space
 * would be hostile. Parens, backslashes, tildes, and dots are all
 * accepted for the same reason: real paths use them (`Program Files
 * (x86)`, `HAWKEY~1`, etc.).
 */
const SHELL_METAS = /[;&|`$<>"'\n\r%^!]/;

export function assertSafeRuntimePath(p: string, label: string): void {
  const match = SHELL_METAS.exec(p);
  if (match) {
    throw new Error(
      `${label} contains a shell-metacharacter (${JSON.stringify(match[0])}) in the runtime cache path: ${JSON.stringify(p)}. ` +
        `Shell metacharacters (;, &, |, \`, $, <, >, ", ', %, ^, !, newline) would let the path break out of \`npm exec\` argument boundaries on Windows, where the spawn must go through shell:true to invoke npm.cmd. ` +
        `Adjust DOC_DETECTIVE_CACHE_DIR / config.cacheDir to a path without these characters.`
    );
  }
}

export function getRuntimeDir(ctx: CacheDirContext = {}): string {
  return path.join(getCacheDir(ctx), "runtime");
}

export function getBrowsersDir(ctx: CacheDirContext = {}): string {
  // Respect explicit cacheDir / env-var overrides first — those callers know
  // exactly where they want browsers to live. Apply the same trim-and-
  // ignore-whitespace rule as getCacheDir so a whitespace-only override
  // doesn't bypass the legacy `./browser-snapshots/` probe.
  const fromEnv = trimOrUndefined(process.env.DOC_DETECTIVE_CACHE_DIR);
  const fromCfg = trimOrUndefined(ctx.cacheDir);
  if (fromEnv || fromCfg) {
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
  // Compiled output lives at <pkgRoot>/dist/runtime/cacheDir.js, so
  // `__dirname` is `<pkgRoot>/dist/runtime` and `path.resolve(..., "..", "..")`
  // climbs two segments (`dist/runtime` → `dist` → `<pkgRoot>`) — that's
  // the shim's package root, where the legacy postinstall would have
  // written `browser-snapshots/`. (Mirrors the `../../package.json`
  // pattern in src/runtime/heavyDeps.ts.)
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
