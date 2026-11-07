---
status: accepted
date: 2026-10-11
decision-makers: hawkeyexl
---

# Bake Appium's helpers into the clean Android snapshot

## Context and Problem Statement

The UiAutomator2 driver installs helper APKs on the device: the
`io.appium.settings` helper and the UiAutomator2 server with its test APK.
Without the SDK build-tools, Appium has no `aapt2`. So it can't read the
version of a server that's already installed, reports its state as unknown,
and never replaces it. On the test host, the managed AVD ran server 7.4.0
while the driver (8.7.0) bundles 10.6.6.

The clean snapshot (ADR 01106) freezes whatever helpers the AVD held when the
snapshot was taken. That includes stale servers and helpers corrupted by past
hard-kill teardowns. The test host's snapshot held an `io.appium.settings`
with no launcher activity.

How should managed devices get current, intact helpers?

## Decision Drivers

* Sessions must run against the server version the driver expects.
* No session may fail because of a stale or corrupted helper.
* Startup and completion time must not regress.

## Considered Options

1. Install the helpers before the clean snapshot is saved, and retake the
   snapshot when the driver version changes.
2. Add the SDK build-tools, so Appium can read versions with `aapt2` and
   upgrade helpers itself.
3. Both.

## Decision Outcome

Chosen option: 1.

* After the settle step and before the save, Doc Detective installs the
  driver's bundled helper APKs with `adb install -r -g`. It finds them beside
  the runtime's `appium-uiautomator2-driver` package, nested or hoisted. Every
  resume then starts with intact helpers at the driver's version. A failed
  install still saves the snapshot, and Appium installs the helpers per
  session as before.
* Doc Detective writes `doc-detective.json` with the driver version beside
  the snapshot. On boot, a snapshot whose recorded version differs from the
  installed driver's, or that records none, is discarded and retaken. A
  driver upgrade therefore can't leave an old server baked in. Snapshots from
  before this change are retaken once. With no driver installed yet, there's
  nothing to compare, and the snapshot is kept.
* The SDK build-tools aren't added. With the helpers baked in, `aapt2` saved
  about 0.3 s per session. Session creation took 7.86-8.14 s with it and
  8.17-8.31 s without. That doesn't justify a download of about 137 MB for
  every user. Nor does it justify migration code for existing installs.
  `aapt2` also carries a risk for emulators Doc Detective doesn't boot.
  Appium would trust their on-device helper versions, and an old hard kill
  may have corrupted those helpers.

### Consequences

* Good: sessions on managed emulators run the bundled UiAutomator2 server.
  The test AVD went from 7.4.0 to 10.6.6.
* Good: corrupted helpers no longer survive in the snapshot.
* Good: Appium's per-session settings reinstall dropped from about 0.4 s to
  0.2 s, because it now overwrites a healthy copy. Steady-state startup was
  unchanged at about 17 s.
* Bad: creating a snapshot takes about 1.5 s longer, once per AVD and driver
  version.
* Bad: emulators that are already running (reuse mode) still get no server
  upgrades, as before.

### Confirmation

* `test/android-emulator.test.js` asserts the `prepare` step's place in the
  boot policy and that a failed prepare still saves. It also asserts the
  staleness rule and helper discovery for nested and hoisted layouts.
* `test/android-installer.test.js` asserts that the snapshot metadata reads
  and writes, and that a corrupt marker reads as absent.
* An end-to-end run on Windows reset the snapshot, created it with baked
  helpers, and resumed three times. The resumed device reported server 10.6.6
  and a healthy settings helper.
* The full `apps-android` group ran twice with the provisioning and
  multi-device AVDs. The first pass retook four pre-existing snapshots as
  stale, and the second resumed all of them. Results matched `main`.

## Pros and Cons of the Options

### Option 1: bake the helpers, version the snapshot

* Good: it fixes stale and corrupted helpers with no new download.
* Bad: it covers only emulators Doc Detective boots.

### Option 2: add build-tools

* Good: it also upgrades helpers on emulators Doc Detective doesn't boot.
* Bad: Appium would trust corrupted on-device helpers, and sessions would fail.
  That happened in testing before this change.
* Bad: it adds a download of about 137 MB for a gain of about 0.3 s per session.

### Option 3: both

* Bad: it carries option 2's costs for little additional benefit.
