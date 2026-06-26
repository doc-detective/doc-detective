---
status: accepted
date: 2026-06-26
decision-makers: doc-detective maintainers
---

# Upgrade appium drivers to v3/v5 and resolve pure-ESM heavy deps via package.json

## Context and Problem Statement

The optional Appium browser drivers were held at their pre-v3 majors in the dependency-freshness
work (`appium-chromium-driver` `^2.2.5`, `appium-geckodriver` `^2.4.0`, `appium-safari-driver`
`^4.1.16`) because bumping them to v3/v5 made **every** browser fixture fail across all platforms
(Ubuntu/macOS/Windows) with:

```
WebDriverError: Could not find a driver for automationName 'Chromium' and platformName '<os>'
```

The initial hypothesis was that the v3 driver changed its `automationName` or registration name.
Investigation disproved that: the v3.0.0 breaking changes are (1) a **full migration to native
ESM** and (2) relocating the Chromedriver binary into the Appium strongbox cache. The
`automationName` (`Chromium` / `Gecko` / `Safari`) is unchanged.

The real cause is in **doc-detective's heavy-dep resolver**. All three drivers now publish a
pure-ESM `package.json`:

```json
{ ".": { "types": "./build/lib/index.d.ts", "import": "./build/lib/index.js" },
  "./package.json": "./package.json" }
```

The `.` export has **only** an `import` condition. The runner resolves a driver's path with
`require.resolve(name)` (`tryResolveFromShim` / `tryResolveFromCache` in
[src/runtime/loader.ts](../src/runtime/loader.ts)) to derive `APPIUM_HOME`
([src/core/appium.ts](../src/core/appium.ts)). For an ESM-only export map, `require.resolve(name)`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, so the path resolves to `null`, `APPIUM_HOME` is never
anchored at the driver's `node_modules`, and `appium driver list` reports no installed driver.

## Decision Drivers

* Fix the resolver generically — every Appium driver (and any future heavy dep) is migrating to
  ESM-only exports; a per-package patch would not scale.
* Keep the change behavior-neutral for packages that still expose a `require` entry (appium itself,
  webdriverio, sharp, …).
* Validate the resolver fix locally; defer end-to-end driver-launch validation to the CI browser
  matrix, which is the only environment that provisions Appium drivers and real browsers.

## Considered Options

* **A. Add a package.json fallback to the heavy-dep resolver, then bump the three drivers**
  (chosen).
* **B. Pin the drivers at their pre-v3 majors indefinitely.**
* **C. Run `appium driver install <name>` from the runner instead of resolving the npm package.**

## Decision Outcome

Chosen option **A**:

1. **Resolver fallback.** When `require.resolve(name)` throws, resolve `require.resolve(
   \`${name}/package.json\`)` (which stays exported) and derive the real entry from the package's
   `exports["."]` (`import` → `require` → `default` → `node`) or `main`. This returns the same
   `…/node_modules/<name>/build/lib/index.js` shape the existing `APPIUM_HOME` derivation and
   version walk-up already consume, so no downstream call site changes.
2. **Driver bump.** `appium-chromium-driver` → `^3.0.2`, `appium-geckodriver` → `^3.0.6`,
   `appium-safari-driver` → `^5.0.2`.

### Consequences

* Good: the runner resolves ESM-only drivers again; `APPIUM_HOME` anchors correctly; the bonus is
  a reduced `npm audit` surface (the newer `@appium/support` / `@appium/base-driver` trees drop the
  `shell-quote` / `ws` / `form-data` advisories the v2 trees carried).
* Risk / CI-gated: breaking change #2 (Chromedriver binary relocation) is **not** covered by the
  resolver fix. The runner passes an explicit `appium:executable`, which should bypass the default
  storage location, but only the CI fixture matrix can confirm the driver launches Chrome on each
  platform. If a second-layer issue surfaces it is handled within this change's CI iteration.

### Confirmation

* A red→green unit test in [test/runtime-loader.test.js](../test/runtime-loader.test.js) installs a
  fixture package whose `.` export omits a `require` condition and asserts `resolveHeavyDepPath`
  resolves it via the package.json fallback (it returned `null` before). The existing loader suite
  stays green.
* The lockfile is regenerated cross-platform and `npm ci` validated on Linux.
* End-to-end: the CI browser fixture matrix (`test/core-core.test.js`,
  `test/core-getrunner-provision.test.js`) must pass on Ubuntu/macOS/Windows × Node 22/24.

## Pros and Cons of the Options

### A. package.json-fallback resolver + driver bump (chosen)
* Good: generic, behavior-neutral, unblocks all ESM-migrated drivers.
* Bad: full validation is CI-bound; a possible second issue (executable relocation) may need a
  follow-up within this PR.

### B. Pin drivers at pre-v3 majors
* Good: zero risk now.
* Bad: stuck on EOL driver trees that carry the `npm audit` criticals/highs; diverges from upstream.

### C. `appium driver install` from the runner
* Good: matches Appium's documented driver-management flow.
* Bad: adds a network/install step to every run; larger behavior change than resolving the
  npm-installed package the runner already ships.
