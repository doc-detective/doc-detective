# Runtime (heavy-dep JIT install): agent guide

Guidance for the lazy-install runtime. That's the managed cache under the user's cache dir. Heavy
optional dependencies such as appium, drivers, node-pty, and webdriverio install there just-in-time.
Repo-wide rules live in [../../CLAUDE.md](../../CLAUDE.md).

## The npm prune hazard (issue #501 mechanism): do not regress

`npm install --prefix <runtime> <pkg>` makes npm's arborist treat every package in the runtime
that isn't recorded in the runtime `package.json#dependencies` as **extraneous, and it prunes
them**. A single-dep JIT install can therefore destroy all sibling heavy deps on disk. Meanwhile
already-loaded modules keep running from stale module caches until they touch a missing file.
Historically, a mid-run driver install pruned node-pty's JS files, and the next `pty.spawn`
froze the whole Node process synchronously and forever).

The defenses (keep all of them intact when touching install paths):

- `recordRuntimeDependencies` in [loader.ts](loader.ts) records every managed package physically
  on disk into the runtime `package.json#dependencies`, called **before** each npm spawn (protects
  existing packages) and **after** success (protects arrivals). Only-on-disk rule prevents
  resurrecting failed best-effort deps. (ADR 01025)
- The candidate set includes the managed-name sweep (`resolveManagedDepNames`: heavy deps ∪
  `ddRuntimeDependencies` ∪ optionalDependencies keys) so packages extracted by an interrupted
  bulk install are still protected. `dependencies` is deliberately excluded to avoid promoting
  hoisted transitives. (ADR 01034)
- Bulk installs (postinstall `install all`) use the 9-minute `BULK_INSTALL_TIMEOUT_MS` in
  `installer.ts`. That sits under the 10-minute outer postinstall ceiling, so the diagnosable inner
  timeout fires first. Single-package JIT installs keep the loader's 5-minute default. (ADR 01035)
- `ensurePtyBackendOnDisk` (`src/core/ptyWatchdog.ts`) fs-verifies the resolved node-pty entry
  before spawn and force-reinstalls if files vanished.

A regression shows a mid-run "Installing dependencies…" line followed by a frozen process, where
the log goes silent after a STEP debug line. It can also show `ERR_MODULE_NOT_FOUND` on a
previously-working heavy dep. In npm output, look for a suspicious `removed <hundreds>` count on a
single-package install.

## ESM-only Appium drivers

`appium-chromium-driver` v3, `appium-geckodriver` v3, `appium-safari-driver` v5 (and future
majors) are native ESM: `exports["."]` has only `types` + `import`, so `require.resolve(name)`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. The loader falls back to resolving
`<name>/package.json` and deriving the entry from `exports["."].import`/`main` (ADR 01006,
PR #391).

Diagnostic: `Could not find a driver for automationName '<X>'` right after a driver version bump
is almost always this resolution failure. The `automationName` values don't change across driver
majors, so don't chase capability renames. Quick confirmation: `require.resolve("<driver>")`
throws while `require.resolve("<driver>/package.json")` succeeds.

## Heavy deps whose CommonJS entry re-exports ESM

`loadHeavyDep` resolves with CommonJS conditions, then `import()`s the file. When a package's
CJS entry is `module.exports = require('../index.js')` (require of its ESM build), Node's CJS
lexer can't see the named exports, so the namespace exposes them only on `default`. geckodriver 8
ships that shape (ADR 01143). Unwrap with `mod.default ?? mod` at the call site, as the
geckodriver, sharp, and pixelmatch loads do. Diagnostic: `<x>.<fn> is not a function` right after a
heavy-dep major bump, while `Object.keys(mod)` shows only `default` and `module.exports`.

## Appium extension manifest cache

Appium only scans `APPIUM_HOME/node_modules` for drivers when its manifest cache
(`node_modules/.cache/appium/extensions.yaml`) is **absent**. A lazily-installed driver added to a
home with an existing manifest is invisible, reporting "Could not find a driver for automationName
…". `ensureRuntimeInstalled` therefore deletes the manifest cache after installing any Appium
package, and the app-surface preflight also deletes a manifest that doesn't list its driver.
Preserve that behavior in any install-flow refactor.

Every Appium server, browser and app surface alike, is homed at `<cacheDir>/runtime` (ADR 01111).
The loader never resolves `appium` or `appium-*` from the shim, even in a source checkout whose
`node_modules` has them. Don't reintroduce a shim fallback for them: it splits Appium across two
homes. For the same reason they're declared in `ddRuntimeDependencies`, not `optionalDependencies`,
so `npm ci` never installs an unused copy. Dependabot doesn't read that custom field, so bump their
ranges by hand.

## Testing note

Unit tests around preflight/install paths must stub `resolvePathInCache`/`ensureInstalled` (with
throwers if unexpected). A test that falls through to the real runtime cache can trigger a real
forced install and manifest invalidation mid-suite. That corrupts the environment for every later
driver-dependent test in the same run.
