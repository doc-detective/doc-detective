---
status: accepted
date: 2026-10-13
decision-makers: hawkeyexl
---

# Load only the drivers each Appium server needs

## Context and Problem Statement

ADR 01111 homes every Appium server at `<cacheDir>/runtime`. That home collects
every driver a machine has ever used. It holds the desktop browser drivers
(chromium, gecko, safari). Once a run touches native apps or mobile web, it
also holds the heavy ones (xcuitest, uiautomator2, novawindows, mac2). By
default Appium `require`s every installed driver at startup, one after another,
before it opens its HTTP port.

So a browser run paid to load the iOS and Android drivers, and a Windows app
run paid to load the browser and mobile drivers. We measured this on Windows.
With six drivers in the home, a server took 3.0 seconds to answer `/status`.
Limited to the drivers it uses, the same server took 1.3 seconds. Every
`runTests` that drives a browser or app starts at least one server, and the
mocha suite starts 61. Server startup was the largest single slice of a typical
browser test: 2.5 of the 6.8 seconds in a single-screenshot test.

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

- **Browser pool servers** and the `getRunner` server load `chromium` and
  `gecko`, plus `safari` on macOS (`browserPoolDriverPackages`). They host only
  desktop browser sessions.
  Mobile web and native apps run on their own servers. The Safari driver only
  runs on macOS. Its package declares `platformNames` Mac and iOS.
- **App-surface servers** load the platform's driver from
  `APP_DRIVER_PLATFORMS`, for example `novawindows` on Windows.
- **Mobile servers** load the device's driver. Android's mobile-web context
  server and its warm-phase chromedriver prefetch load `uiautomator2`. The iOS
  mobile-web context server loads `xcuitest`.
- Each driver is named by its package's `appium.driverName`, the key Appium's
  manifest scan registers it under.
- Appium refuses to start when `--use-drivers` names a driver it doesn't know.
  An existing manifest may be stale, and Appium may or may not rescan it. A
  driver is therefore named only when its package is installed in the home. If
  a manifest exists, every installed requested driver must have a `drivers`
  entry that gives exactly its package as `pkgName`. Otherwise the manifest
  can't be trusted, and no flag is passed. A partial list would either name a
  driver Appium refuses, or leave out one a rescan would have loaded. An
  unparseable manifest also gets no flag. With no flag, Appium keeps its
  load-everything default, so a server never fails to start where it used to.

### Consequences

* Good, because each browser or app server starts in about half the time, on
  every run. On Windows that's about 1.3 seconds instead of 2.5 to 3.0.
* Good, because a broken, unrelated driver in the shared home can no longer
  slow or clutter a server's startup.
* Neutral, because the set of sessions each server hosts is unchanged.
* Bad, because the browser pool's driver list must grow if the pool ever hosts
  a new browser engine. A missing entry shows up as "Could not find a driver
  for automationName" at session creation.

### Confirmation

* [test/appium-use-drivers.test.js](../test/appium-use-drivers.test.js): only
  the requested, installed drivers whose manifest entry names the exact
  package are named. A substring match, an unparseable manifest, or a manifest
  missing any installed requested driver means no flag. Safari is in the pool
  list only on macOS. The Android chromedriver-prefetch server loads only
  `uiautomator2`.
* Verified on Windows before merge: the `apps/app-windows` fixture passes on
  NovaWindows, and a browser `goTo` and `screenshot` run passes.
* Still to confirm in CI: the browser fixture groups, the `apps` group on
  macOS (Mac2), and the `apps-android`, `mobile-web-android`, and
  `mobile-web-ios` groups.

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
