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
