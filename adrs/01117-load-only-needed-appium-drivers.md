---
status: accepted
date: 2026-10-13
decision-makers: hawkeyexl
---

# Load only the drivers each Appium server needs

## Context and Problem Statement

ADR 01111 homes every Appium server at `<cacheDir>/runtime`. That home collects
every driver a machine has ever used: the desktop browser drivers (chromium,
gecko, safari) and, once a run touches native apps or mobile web, the heavy
ones (xcuitest, uiautomator2, novawindows, mac2). By default Appium `require`s
every installed driver at startup, one after another, before it opens its HTTP
port.

So a browser run paid to load the iOS and Android drivers, and a Windows app
run paid to load the browser and mobile drivers. Measured on Windows, a server
in a home with six drivers took 3.0s to answer `/status`. The same server
limited to the one or two drivers it uses took 1.3s. Every `runTests` that
drives a browser or app starts at least one server. The mocha suite starts 55,
so this cost was the largest single slice of a typical browser test (2.5s of a
6.8s single-screenshot test).

## Decision Drivers

* Faster startup for every browser and native-app run, for users and CI alike.
* No change in which sessions a server can host.
* A server must never refuse to start where it used to start.

## Considered Options

1. **Pass `--use-drivers`** with just the drivers the server can host.
2. **Separate homes per driver family**, so each home holds only its drivers.
3. **Keep a warm Appium server across runs** to amortize startup.

## Decision Outcome

Chosen option: **1, `--use-drivers`**, built by `useDriversArgs` in
[src/core/appium.ts](../src/core/appium.ts).

- **Browser pool servers** load `chromium` and `gecko`, plus `safari` on macOS
  (`browserPoolDriverPackages`). The pool hosts only desktop browser sessions.
  Mobile web and native apps run on their own servers. The Safari driver only
  runs on macOS. Its package declares `platformNames` Mac and iOS.
- **App-surface servers** load the platform's driver from
  `APP_DRIVER_PLATFORMS`, for example `novawindows` on Windows.
- **Mobile servers** load the device's driver: `uiautomator2` for the Android
  mobile-web context server and the warm-phase chromedriver prefetch, and
  `xcuitest` for the iOS mobile-web context server.
- Each driver is named by its package's `appium.driverName`, the key Appium's
  manifest scan registers it under.
- Appium refuses to start when `--use-drivers` names a driver it doesn't know.
  It also trusts an existing manifest without rescanning. A driver is therefore
  named only when its package is installed in the home and, if a manifest
  exists, the manifest lists it. When nothing qualifies, no flag is passed and
  Appium keeps its load-everything default. A driver missing from the manifest
  fails exactly as it did before, at session creation, instead of taking the
  server down.

### Consequences

* Good, because each browser or app server starts in about half the time
  (~1.3s instead of 2.5–3.0s on Windows), on every run.
* Good, because a broken, unrelated driver in the shared home can no longer
  slow or clutter a server's startup.
* Neutral, because the set of sessions each server hosts is unchanged.
* Bad, because the browser pool's driver list must grow if the pool ever hosts
  a new browser engine. A missing entry shows up as "Could not find a driver
  for automationName" at session creation.

### Confirmation

* [test/appium-use-drivers.test.js](../test/appium-use-drivers.test.js): only
  the requested, installed, manifest-listed drivers are named. Nothing
  qualifying means no flag. Safari is in the pool list only on macOS. The
  Android chromedriver-prefetch server loads only `uiautomator2`.
* The existing browser fixture groups, the `apps` group (NovaWindows on
  Windows, Mac2 on macOS), and the `apps-android`, `mobile-web-android`, and
  `mobile-web-ios` groups run end to end with the restricted servers.

## Pros and Cons of the Options

### Option 1: `--use-drivers`

* Good, because it's one CLI flag on the existing spawn path.
* Good, because the shared home from ADR 01111 stays as it is.
* Bad, because a name Appium doesn't know is fatal, so the list needs the
  installed-and-registered guard above.

### Option 2: separate homes per driver family

* Good, because each home's default load would already be minimal.
* Bad, because it undoes ADR 01111's single home and duplicates Appium and its
  manifest per family.

### Option 3: warm Appium server across runs

* Good, because it would remove startup from all but the first run.
* Bad, because it changes process lifecycle and isolation between runs,
  which concurrency and port-conflict handling rely on.
