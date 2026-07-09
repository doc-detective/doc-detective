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
  "appium-xcuitest-driver",
  "sharp",
  "@ffmpeg-installer/ffmpeg",
  "@puppeteer/browsers",
  "geckodriver",
  "pixelmatch",
  "pngjs",
  // API-identical fork of node-pty with prebuilt binaries for macOS (incl.
  // arm64), Windows, and Linux across Node ABIs. Upstream node-pty has no Windows
  // prebuild and ships a non-executable macOS spawn-helper, so it can't be relied
  // on across the CI matrix; the fork can.
  "@homebridge/node-pty-prebuilt-multiarch",
] as const;

export type HeavyDepName = (typeof HEAVY_NPM_DEPS)[number];

/**
 * Heavy deps whose install is **best-effort**: a failure to install them (e.g.
 * no prebuilt binary for the runner's platform/arch + no build toolchain) must
 * NOT abort the whole `install all` batch. The corresponding feature degrades to
 * SKIP at runtime instead. The PTY backend is native; even with the
 * prebuilt-multiarch fork's broad coverage, an exotic platform/arch could miss a
 * binary, so it is installed on its own, failure-tolerant, as a safety net.
 */
// Public type is ReadonlySet<string> so `.has(someString)` callsites compile,
// but the literal is typed Set<HeavyDepName> so a typo in an entry (a name not in
// HEAVY_NPM_DEPS) is a compile error.
export const BEST_EFFORT_NPM_DEPS: ReadonlySet<string> = new Set<HeavyDepName>([
  "@homebridge/node-pty-prebuilt-multiarch",
]);

/**
 * Optional peer dependencies that npm will NOT auto-install, but a heavy dep
 * needs for full functionality. `@puppeteer/browsers@3` moved `proxy-agent`
 * from a regular dependency (2.x) to an `optional` peer, so a bare
 * `npm install @puppeteer/browsers` into <cacheDir>/runtime omits it and
 * proxy-based browser downloads break. We install each companion alongside
 * its owner so the cached install matches what 2.x shipped.
 */
export const RUNTIME_PEER_COMPANIONS: Record<string, string[]> = {
  "@puppeteer/browsers": ["proxy-agent"],
};

/**
 * Expand a list of runtime package names to include any peer companions
 * (see RUNTIME_PEER_COMPANIONS), preserving order and de-duplicating.
 */
export function withPeerCompanions(names: string[]): string[] {
  const out = [...names];
  for (const name of names) {
    for (const companion of RUNTIME_PEER_COMPANIONS[name] ?? []) {
      if (!out.includes(companion)) out.push(companion);
    }
  }
  return out;
}

/**
 * Every npm package name the shim itself may install into <cacheDir>/runtime.
 * This is the sweep list recordRuntimeDependencies uses to find packages
 * physically on disk but missing from installed.json — the orphans an
 * interrupted install batch (killed npm child, install timeout, cancelled CI
 * job) leaves behind, which would otherwise be invisible to the recorded
 * sources and pruned as extraneous by the next install's reify.
 */
export function managedDepNames(): string[] {
  return resolveManagedDepNames(readShimPackageJson());
}

/**
 * Pure union of every field the shim declares runtime installs from, split
 * out from managedDepNames so it can be unit-tested against synthetic
 * manifests: HEAVY_NPM_DEPS (the loader's own list) plus the keys of
 * `ddRuntimeDependencies` / `optionalDependencies` — the app-surface drivers
 * (appium-novawindows-driver, appium-mac2-driver, appium-uiautomator2-driver)
 * are JIT-installed by the platform preflights but live ONLY in those
 * manifest fields, not in HEAVY_NPM_DEPS — expanded with peer companions.
 *
 * `dependencies` is deliberately EXCLUDED: those are the shim's regular
 * runtime deps, whose names can collide with transitives hoisted into the
 * cache's node_modules — sweeping them would promote a hoisted transitive to
 * a direct dependency, distorting every future ideal tree. (It only exists
 * as a legacy fallback in resolveDeclaredVersion, predating the cache.)
 */
export function resolveManagedDepNames(pkg: ShimPackageJson): string[] {
  const names = new Set<string>([
    ...HEAVY_NPM_DEPS,
    ...Object.keys(pkg.ddRuntimeDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
  return withPeerCompanions([...names]);
}

export interface ShimPackageJson {
  // The published manifest carries heavy-dep version constraints here:
  // the publish step moves `optionalDependencies` into this custom field so npm
  // never auto-installs them, while the source manifest keeps
  // `optionalDependencies` for Dependabot. See scripts/publish-manifest.js.
  ddRuntimeDependencies?: Record<string, string>;
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
 * for `name`. The version source differs between the published package and
 * a source/CI checkout, so we check in priority order:
 *   1. `ddRuntimeDependencies` — the published state. The publish step moves the
 *      heavy deps here so npm never auto-installs them.
 *   2. `optionalDependencies` — the source/CI state (kept for Dependabot).
 *   3. `dependencies` — the legacy state, pre lazy-install migration.
 * The first non-empty match wins.
 *
 * Throws for unknown names; the resolver is the only caller and a missing
 * entry is a programming error, not a user-facing one.
 */
export function getDeclaredVersion(name: string): string {
  return resolveDeclaredVersion(readShimPackageJson(), name);
}

/**
 * Pure field-priority resolution, split out from getDeclaredVersion so it can
 * be unit-tested against synthetic manifests without touching the filesystem.
 */
export function resolveDeclaredVersion(
  pkg: ShimPackageJson,
  name: string
): string {
  for (const field of [
    pkg.ddRuntimeDependencies,
    pkg.optionalDependencies,
    pkg.dependencies,
  ]) {
    const declared = field?.[name];
    if (typeof declared === "string" && declared.length > 0) {
      return declared;
    }
  }
  throw new Error(
    `${name} is not declared in doc-detective's package.json (ddRuntimeDependencies, optionalDependencies, or dependencies). Add it before invoking the runtime loader.`
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
  // Anchor to the full string so composite/OR ranges (e.g. "1.2.3 || 2.0.0")
  // don't match their leading core and get mistaken for an exact version.
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
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
