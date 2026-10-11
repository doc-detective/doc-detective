---
status: proposed
date: 2026-10-11
decision-makers: doc-detective maintainers
---

# Launch the prebuilt WebDriverAgent on simulators without xcodebuild

## Context and Problem Statement

Every iOS context opens a new XCUITest session, and every session starts WebDriverAgent (WDA)
again. The driver quits WDA when a session ends (`deleteSession → stop → stopWda`), so reusing an
Appium server between contexts can't keep it alive. With the managed products from
`doc-detective install ios`, sessions run `appium:usePrebuiltWDA` with the keyed `derivedDataPath`.
That skips the compile but still launches WDA through `xcodebuild test-without-building`, on every
session.

That launch dominates iOS test time. The baseline is 3 runs of each iOS fixture leg. In it,
`apps-ios` spent a median of 578.7 s starting sessions and about 50 s on test actions.
`mobile-web-ios` spent 343.6 s against about 65 s. Later sessions on an already-booted simulator still took
62–117 s each.

`appium-xcuitest-driver` 12 can instead install a prebuilt runner app onto a simulator and launch
it with `simctl launch` (`appium:usePreinstalledWDA` plus `appium:prebuiltWDAPath`). The managed
products already contain that app at `DerivedData/Build/Products/Debug-iphonesimulator/
WebDriverAgentRunner-Runner.app`.

## Decision Drivers

* iOS session startup time, for users and for the PR gate's critical path.
* Keep the managed products read-only, since concurrent sessions share them.
* No change for older drivers or for users who set `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH`.
* Every fixture context's PASS/SKIP result stays the same.

## Considered Options

* **A. Launch the managed runner app directly on driver 12+** (chosen).
* **B. Reuse one Appium server across iOS contexts.** The driver quits WDA at every session end,
  so this saves only the server start (about 2.5 s per context).
* **C. Keep WDA running between sessions and attach with `appium:webDriverAgentUrl`.** Doc
  Detective would have to own WDA's lifecycle, port, and crash recovery outside the driver.

## Decision Outcome

Chosen option: **A**. When the managed-products locator finds products and the installed
`appium-xcuitest-driver` is major 12 or later (`MIN_PREINSTALLED_WDA_DRIVER_MAJOR`), it also returns
the runner app's path. `applyManagedWdaCapabilities` then adds `appium:usePreinstalledWDA: true` and
`appium:prebuiltWDAPath`. Both iOS capability builders share it: native apps and Safari.
`appium:derivedDataPath` and `appium:usePrebuiltWDA` stay set; the driver ignores them once it
skips xcodebuild.

### Consequences

* Good: each session launches WDA in seconds instead of going through `xcodebuild`.
* Good: the products stay read-only. The driver copies the app onto the simulator.
* Neutral: older drivers, a products miss, and the environment-variable override all behave as
  before.
* Bad: the driver's launch path requires iOS 17 or later. The driver reads the version from the
  selected simulator and fails the session start on older runtimes. The ADR 01033 retry doesn't
  change the capabilities, so such a simulator would fail rather than fall back. Current Xcode
  images ship iOS 17+ runtimes only.

### Confirmation

* Unit tests: the locator returns the runner app on driver 12 and not on driver 10. Both builders
  set the two capabilities on a hit that has it.
* Three single-leg runs per iOS fixture leg (`fixtures-debug.yml`). Each context's PASS/SKIP result
  matches the baseline exactly. Median startup drops by more than the baseline spread, about
  100 s across the two legs.

## Pros and Cons of the Options

### A. Launch the runner app directly

* Good: a small change at the one place both builders share.
* Bad: depends on the driver's simulator launch path, which is newer than the xcodebuild path.

### B. Reuse one Appium server

* Good: fewer server processes.
* Bad: doesn't address the cost, because WDA still restarts per session.

### C. Attach to a long-lived WDA

* Good: the fastest possible session start.
* Bad: moves WDA's lifecycle into Doc Detective, a much larger change.
