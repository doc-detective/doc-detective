/**
 * Transform the manifest for publishing. Returns a new object; does not mutate
 * the input. Two changes:
 *   1. Drop `workspaces` — npx/global installs of the published package must not
 *      see the monorepo workspaces field (see PR #236).
 *   2. Move `optionalDependencies` (which by this point holds only the heavy
 *      lazy-installed runtime deps) into the custom `ddRuntimeDependencies`
 *      field. npm never auto-installs a custom field, so a default
 *      `npm i doc-detective` no longer drags in webdriverio/appium/sharp/etc.
 *      and their deprecated transitive deps. The runtime loader reads versions
 *      from `ddRuntimeDependencies` via getDeclaredVersion(). The source
 *      manifest keeps `optionalDependencies` so Dependabot still bumps them.
 *
 * This MUST be applied to package.json on disk *before* `npm publish` is
 * invoked — not from a `prepack`/`prepare` lifecycle hook. `npm publish` builds
 * the registry metadata (the packument that `npm install` resolves
 * dependencies from) by reading package.json via pacote *before* lifecycle
 * scripts run, then packs the tarball *after* them. A prepack edit therefore
 * lands in the tarball but never in the packument, so the heavy
 * optionalDependencies still install on `npm i`. scripts/publish-staged-release.js
 * rewrites package.json with this transform before spawning `npm publish`.
 *
 * Exported so test/publish-manifest.test.js can exercise it in isolation.
 */
export function transformForPublish(pkg) {
  const out = { ...pkg };
  delete out.workspaces;
  // Preserve any declared heavy deps under the custom field...
  if (
    out.optionalDependencies &&
    typeof out.optionalDependencies === "object" &&
    Object.keys(out.optionalDependencies).length > 0
  ) {
    out.ddRuntimeDependencies = { ...out.optionalDependencies };
  }
  // ...then always drop optionalDependencies, including an empty `{}`, so the
  // published manifest never carries the field (and the publish guardrail never
  // sees a stray empty object).
  delete out.optionalDependencies;
  return out;
}
