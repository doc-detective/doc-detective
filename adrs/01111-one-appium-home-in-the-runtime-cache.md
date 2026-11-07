---
status: accepted
date: 2026-10-11
decision-makers: hawkeyexl
---

# Home every Appium server in the runtime cache

## Context and Problem Statement

Doc Detective starts Appium servers for browser contexts and for native app
surfaces. Each server reads its drivers from `<APPIUM_HOME>/node_modules`. Two
code paths chose that home differently.

- **Browser servers** used `setAppiumHome`. It picked `<cacheDir>/runtime` only
  when the runtime held Appium *and* a browser driver (ADR 01031). Otherwise it
  homed at whatever `node_modules` the browser driver resolved from, usually
  the package's own (the "shim").
- **App-surface servers** used `appSurfacePreflight`. A shim-resolved driver got
  the shim home. A cache-resolved driver got `<cacheDir>/runtime`, plus a forced
  Appium install there.

In a source checkout, where the shim carries `appium` and the browser drivers
as `optionalDependencies`, one run could start servers from two homes. Each
home had its own Appium copy, its own driver copies, and its own extension
manifest. Driver fixes, manifest invalidation, and the clean-snapshot helper
bake (ADR 01108) had to reason about both. Published installs never hit this.
The publish step moves the heavy deps out of the dependency tree, so they
always land in the runtime cache.

## Decision Drivers

* One Appium home per run, the same for browser and app surfaces.
* Published installs and source checkouts behave the same way.
* A driver installed after the manifest was built must still be found.
* No new network cost for published installs, which already use the runtime.

## Considered Options

1. **Runtime cache only.** Resolve and install `appium` and every `appium-*`
   package only in `<cacheDir>/runtime`, and home every server there.
2. **Shim when present.** Home every server at the shim when it has Appium,
   else the runtime.
3. **Keep two homes** and keep reconciling them per path.

## Decision Outcome

Chosen option: **1, runtime cache only**.

- `tryResolveFromShim` in [src/runtime/loader.ts](../src/runtime/loader.ts)
  returns `null` for `appium` and `appium-*` names. Every resolver
  (`resolveHeavyDepPath`, `resolveHeavyDepSource`, `loadHeavyDep`) and the
  install skip check in `ensureRuntimeInstalled` therefore see only the
  runtime copy. A shim copy never satisfies a request. The JIT pre-flight,
  `install runtime`, `install all`, and the postinstall pre-warm therefore
  install Appium and its drivers into the runtime.
- `ensureRuntimeInstalled` deletes `<runtime>/node_modules/.cache/appium` after
  it installs any Appium package. Appium trusts an existing manifest and never
  rescans, so this keeps a newly installed driver visible to the shared home.
- `setAppiumHome` sets `APPIUM_HOME` to `<cacheDir>/runtime`, unconditionally.
  The completeness gate from ADR 01031 and the legacy directory walk are gone.
- `appSurfacePreflight` installs whichever of the platform driver and `appium`
  the runtime lacks, then homes the server at `<cacheDir>/runtime`.

This supersedes the homing mechanism of ADR 01031. Its problem was a runtime with
Appium but no browser driver. That can't recur. Browser detection now resolves
the browser drivers from the runtime too. A missing driver reads as missing,
and the pre-flight installs it.

### Consequences

* Good, because every Appium server in a run shares one home, one manifest, and
  one copy of each driver.
* Good, because source checkouts and CI now exercise the same layout users get.
* Neutral, because published installs don't change. Their Appium tree already
  lived in the runtime.
* Bad, because a source checkout installs Appium and its drivers into the
  runtime once, even though `npm ci` already put copies in the shim. Those shim
  copies are now unused. Dropping them from `optionalDependencies` is a
  separate change.
* Bad, because a run that installs a driver deletes the shared manifest. A
  server that's starting at that moment rebuilds it again. Appium tolerates
  that.

### Confirmation

* [test/runtime-loader.test.js](../test/runtime-loader.test.js): Appium
  packages never resolve from the shim. They resolve from and install into the
  runtime even when the shim has them. Installing one drops the manifest, and
  installing anything else keeps it.
* [test/appium-home.test.js](../test/appium-home.test.js): `setAppiumHome`
  homes at `<cacheDir>/runtime` with nothing installed.
* [test/app-surface.test.js](../test/app-surface.test.js): the preflight
  installs only what the runtime lacks and returns the runtime home and entry.
* The existing browser (`navigation/`), app (`apps-android/`), and mobile-web
  (`mobile-web-android/`) fixture groups run end to end through the shared
  home.

## Pros and Cons of the Options

### Option 1: runtime cache only

* Good, because one rule in one function decides where Appium lives.
* Good, because it matches the published layout.
* Bad, because source checkouts pay a one-time install.

### Option 2: shim when present

* Good, because source checkouts reuse the shim copies.
* Bad, because the native drivers live only in the runtime, so the shim home
  would need them installed there too. That reintroduces two copies.
* Bad, because published installs and checkouts would still differ.

### Option 3: keep two homes

* Good, because nothing changes.
* Bad, because every Appium-adjacent fix keeps paying for both layouts.
