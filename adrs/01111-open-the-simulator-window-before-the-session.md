---
status: proposed
date: 2026-10-11
decision-makers: doc-detective maintainers
---

# Open the Simulator window before the first iOS session

## Context and Problem Statement

Doc Detective boots simulators with `simctl boot`, which starts the device without a window. It
also reuses simulators that something else booted the same way, such as CI's pre-boot step.

The XCUITest driver runs simulators with a window unless `appium:isHeadless` is set. When it finds
the device booted but no Simulator UI client running, it shuts the device down and boots it again
through the Simulator app. Appium's log for the first `apps-ios` session on CI shows that restart:
"booted in 103.989s". The boot Doc Detective (or CI) already paid is thrown away, and the first
session of every iOS run waits for a second boot.

## Decision Drivers

* iOS session startup time on the first session of a run, for users and CI.
* Keep what users see: the driver opens the Simulator window today, just later and after a reboot.
* Never fail a run over a window that can't be opened.

## Considered Options

* **A. Open the Simulator window ourselves once the device is booted** (chosen).
* **B. Set `appium:isHeadless: true`.** The driver then keeps the windowless device, but users
  would no longer see the simulator, which changes a visible default.
* **C. Open the window in CI's pre-boot step only.** Fixes CI, but users still pay the reboot.

## Decision Outcome

Chosen option: **A**. `acquireSimulator` opens the Simulator window once per device per run:
after booting a device, and when reusing one that's already booted. The real effect runs
`open -F <xcode-select -p>/Applications/Simulator.app --args -CurrentDeviceUDID <udid>`. That's the
app path the driver checks for its UI client. `-n` isn't passed, so an already-open Simulator app is
reused rather than duplicated. The step is best-effort: a missing app or a failed `open` logs and
continues, and the driver then behaves as before.

### Consequences

* Good: the driver finds the UI client running and uses the device as booted, so the first
  session skips a full reboot.
* Neutral: users see the Simulator window when the device is ready instead of when the session
  starts. Nothing to configure, so there's no documentation change.
* Neutral: Xcode 27+ replaces the Simulator app with a different UI client. There the step skips,
  and the driver's own behavior applies.

### Confirmation

* Unit tests: the window opens after a boot and on reuse, once per device per run, and a failure
  never fails the acquire.
* Three single-leg runs per iOS fixture leg (`fixtures-debug.yml`). Each context's PASS/SKIP
  result matches the baseline. Appium's log no longer shows the restart, and median startup drops
  by more than the noise threshold.

## Pros and Cons of the Options

### A. Open the window ourselves

* Good: fixes users and CI with one best-effort step.
* Bad: depends on the driver's UI-client check, which can change across driver versions.

### B. Headless sessions

* Good: one capability, and no window at all on CI.
* Bad: changes what local users see.

### C. CI-only fix

* Good: no product change.
* Bad: users keep paying the reboot.
