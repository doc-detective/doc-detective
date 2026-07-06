---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Require a browser driver in the runtime cache before anchoring APPIUM_HOME there

## Context and Problem Statement

Browser detection (`getAvailableApps` in [src/core/config.ts](../src/core/config.ts)) decides Chrome
is available only when three things line up: the Chrome binary, chromedriver, and a `chromium
[installed (npm)]` line in `appium driver list`. That last check reads
`<APPIUM_HOME>/node_modules` — so the process's `APPIUM_HOME`, set by `setAppiumHome`
([src/core/appium.ts](../src/core/appium.ts)), must point at a home whose `node_modules` actually
contains `appium-chromium-driver`.

`setAppiumHome` resolved `APPIUM_HOME` in three steps. **Step 1** short-circuited to
`<cacheDir>/runtime` the moment `<cacheDir>/runtime/node_modules/appium` existed — on the assumption
that a cache-installed appium is the canonical, complete home. That assumption is false.

The lazy-install path installs heavy deps into `<cacheDir>/runtime` with `npm install --prefix`.
When a package that resolves from the shim (the doc-detective package's own `node_modules`) is
requested, it is skipped — so `appium` and `appium-chromium-driver`, being real dependencies of this
repo, are *never* copied into the cache by name. But installing a **native** driver that does not
resolve from the shim — most notably `appium-xcuitest-driver`, which every `doc-detective install
all` installs — pulls `appium` into `<cacheDir>/runtime/node_modules` as a **peer dependency**,
*without* any browser driver.

The result is a partial runtime home: appium present, `appium-chromium-driver` absent. Step 1
anchored `APPIUM_HOME` there, `appium driver list` reported `chromium [not installed]`, and browser
detection returned no Chrome — surfacing to callers as
`Error: Chrome browser is not available. Please ensure Chrome is installed and accessible.`

### Observed impact

The reusable test matrix (`.github/workflows/test.yml`) runs `doc-detective install all` to pre-warm
the cache, then `npm test`. On **ubuntu-latest** and **macos-latest** (node 22 and 24) this pre-warm
seeded the partial runtime home above, so ~29 real browser-driving unit tests in
[test/core-core.test.js](../test/core-core.test.js) failed with the Chrome-unavailable error
(the whole `getRunner()` block, `autoRecord`, `goTo`, `screenshot`/`runBrowserScript`
regression tests, the `type`-to-surface tests, and the `Screenshot sourceIntegration` block).
**windows-latest passed** because its `install all` seeds a different cache layout that happened not
to trip step 1 the same way — masking the defect as an OS-specific flake. The failure was
pre-existing and stable (red on every recent PR since the lazy-install/`install all` pre-warm
landed).

## Decision Drivers

* Browser detection must resolve Chrome/Firefox on every OS the matrix runs, given the same
  `install all` pre-warm.
* The fix must not regress the native-app (`appSurface`) path, which computes its own per-driver
  APPIUM_HOME and legitimately relies on drivers lazy-installed into `<cacheDir>/runtime`.
* Prefer a product fix (benefits every user whose cache ends up in this state) over a
  CI-workflow-only patch.

## Considered Options

1. **Require a browser driver in the runtime home before step 1 selects it.** Only anchor
   `APPIUM_HOME` at `<cacheDir>/runtime` when that home holds appium **and** a browser driver
   (`appium-chromium-driver` or `appium-geckodriver`); otherwise fall through to step 2, which homes
   at the driver's actual location (the shim, which carries the full driver set).
2. **Register the chromium driver in the pre-warm step** (`appium driver install chromium` against
   the runtime home) — CI-only, doesn't help end users whose cache reaches the same partial state,
   and risks a redundant network fetch of an already-npm-present driver.
3. **Drop the runtime-first step entirely** and always home at the shim/driver — regresses the
   genuine case where a browser driver *was* lazy-installed into the cache (lean shim without the
   optional driver).

## Decision Outcome

Chosen option: **1**. `setAppiumHome` now gates step 1 on
`runtimeHomeHasBrowserDriver(<cacheDir>/runtime)` — true only when `node_modules/appium` and at
least one of `appium-chromium-driver` / `appium-geckodriver` are present. A partial runtime home
(appium pulled in as a peer of a native driver, no browser driver) is no longer selected; resolution
falls through to step 2 and lands on the shim home whose `node_modules` carries every driver, so
`appium driver list` reports the browser driver as installed and detection succeeds.

The native-app path is unaffected: `appSurface.ts` derives its APPIUM_HOME per-driver
(`resolveHeavyDepPath(driverPackage)` → `appiumHomeForDriverPath`) and does not go through this
step-1 heuristic.

### Consequences

* Good: browser detection succeeds on ubuntu/macOS/Windows with the same `install all` pre-warm; the
  ~29 browser unit tests pass on all three OSes.
* Good: end users whose runtime cache reaches the partial state (any `install all` that installs a
  native driver but no browser driver) now resolve Chrome instead of hitting a spurious
  "not available".
* Neutral: when the runtime cache *does* hold a browser driver (a genuine lazy browser-driver
  install), step 1 still selects it — behavior unchanged for that case.

### Confirmation

* Red→green on the same machine + cache state: with a partial runtime home
  (`<cacheDir>/runtime/node_modules` = `{appium, appium-xcuitest-driver}`, no chromium driver), the
  `getRunner()` "create a runner with correct defaults" test fails pre-fix with the exact
  Chrome-unavailable error and passes post-fix with a real Chrome session.
* Unit tests in [test/tier2-core-guards.test.js](../test/tier2-core-guards.test.js): the pure
  `runtimeHomeHasBrowserDriver` truth table (empty / appium-only / appium+native-driver → false;
  appium+browser-driver → true; browser-driver-without-appium → false), plus `setAppiumHome`
  selecting the complete runtime home and rejecting the partial one.

## Pros and Cons of the Options

### Option 1 — require a browser driver in the runtime home

* Good: one product-level change fixes detection for CI and end users alike.
* Good: preserves the native-app path and the genuine cache-installed-browser-driver case.
* Neutral: adds two `existsSync` probes to a function called on every browser detection (cheap).

### Option 2 — register the driver in the CI pre-warm

* Good: no product code change.
* Bad: CI-only; leaves end users with the same broken cache state.
* Bad: an extra `appium driver install` may re-fetch a driver already present via npm.

### Option 3 — drop the runtime-first step

* Good: simplest.
* Bad: regresses lean-shim setups where the browser driver was legitimately lazy-installed into the
  cache.
