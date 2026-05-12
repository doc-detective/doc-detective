import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HEAVY_NPM_DEPS = [
  "webdriverio",
  "appium",
  "appium-chromium-driver",
  "appium-geckodriver",
  "appium-safari-driver",
  "sharp",
  "@ffmpeg-installer/ffmpeg",
  "@puppeteer/browsers",
  "geckodriver",
  "pixelmatch",
  "pngjs",
] as const;

export type HeavyDepName = (typeof HEAVY_NPM_DEPS)[number];

interface ShimPackageJson {
  optionalDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

let cachedPkg: ShimPackageJson | null = null;

function readShimPackageJson(): ShimPackageJson {
  if (cachedPkg) return cachedPkg;
  // dist/runtime/heavyDeps.js sits two directories below the shim root.
  const pkgPath = path.resolve(__dirname, "../../package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  cachedPkg = JSON.parse(raw) as ShimPackageJson;
  return cachedPkg;
}

/**
 * Returns the version constraint declared in the shim's own package.json
 * for `name`. During the migration window heavy deps may live in either
 * `optionalDependencies` (the target state) or `dependencies` (the legacy
 * state) — either is acceptable as the single source of truth.
 *
 * Throws for unknown names; the resolver is the only caller and a missing
 * entry is a programming error, not a user-facing one.
 */
export function getDeclaredVersion(name: string): string {
  const pkg = readShimPackageJson();
  const fromOptional = pkg.optionalDependencies?.[name];
  if (typeof fromOptional === "string" && fromOptional.length > 0) {
    return fromOptional;
  }
  const fromRegular = pkg.dependencies?.[name];
  if (typeof fromRegular === "string" && fromRegular.length > 0) {
    return fromRegular;
  }
  throw new Error(
    `${name} is not declared in doc-detective's package.json (optionalDependencies or dependencies). Add it before invoking the runtime loader.`
  );
}

/** Test seam: drop the cached package.json read. */
export function _resetCacheForTests(): void {
  cachedPkg = null;
}

/**
 * Minimal semver-range check covering the shapes that appear in this
 * repo's `package.json#optionalDependencies`: exact `X.Y.Z`, caret
 * `^X.Y.Z`, tilde `~X.Y.Z`. Anything else (`>=`, `||`, `*`, etc.)
 * degrades to "matches" so callers don't surface false positives.
 *
 * Pulling in the full `semver` package would put a runtime dep into
 * the shim we're explicitly trying to keep lean; this is sufficient
 * for the use sites that compare installed-cache versions against
 * declared ranges.
 */
export function satisfiesRange(installed: string, range: string): boolean {
  if (!range || !installed) return true;
  const installedParts = parseSemverCore(installed);
  if (!installedParts) return true;
  const trimmed = range.trim();
  if (trimmed.startsWith("^")) {
    const wanted = parseSemverCore(trimmed.slice(1));
    if (!wanted) return true;
    // ^X.Y.Z: same leading non-zero, gte. For X=0, caret pins minor.
    if (wanted[0] !== installedParts[0]) return false;
    if (wanted[0] === 0 && wanted[1] !== installedParts[1]) return false;
    return compareTuple(installedParts, wanted) >= 0;
  }
  if (trimmed.startsWith("~")) {
    const wanted = parseSemverCore(trimmed.slice(1));
    if (!wanted) return true;
    return (
      installedParts[0] === wanted[0] &&
      installedParts[1] === wanted[1] &&
      installedParts[2] >= wanted[2]
    );
  }
  // Exact-version constraint (`X.Y.Z`) — equality.
  const exact = parseSemverCore(trimmed);
  if (exact) return compareTuple(installedParts, exact) === 0;
  // Anything else (>=, ||, *) — don't flag.
  return true;
}

function parseSemverCore(v: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTuple(
  a: [number, number, number],
  b: [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
