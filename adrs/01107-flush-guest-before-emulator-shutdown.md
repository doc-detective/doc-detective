---
status: accepted
date: 2026-10-11
decision-makers: hawkeyexl
---

# Flush the guest page cache before shutting an emulator down

## Context and Problem Statement

At run end, Doc Detective shuts down the emulators it booted with the
console's `emu kill` (ADR 01106). That stops the virtual machine without an
Android shutdown. Writes still in the guest's page cache never reach the
AVD's `/data` disk.

A controlled test on Windows WHPX showed the loss. It cold-booted an AVD,
installed an APK, ran `emu kill`, and cold-booted again. The package came back
with `pkg=null` and no launcher activity in 4 of 4 rounds. An app that a test
installs, or one of Appium's helper APKs, can be lost or corrupted the same
way. Cold boots read that disk, and so does the boot that retakes the clean
snapshot after `install android --reset-snapshot`.

Should teardown change, and should `install android` also add the SDK
build-tools, so Appium gets `aapt2`?

## Decision Drivers

* Data a test or a user writes to an AVD must survive the run's teardown.
* Teardown must stay fast and must never hang on a wedged guest.
* Adding the SDK build-tools must not break sessions on existing AVDs.

## Considered Options

1. Run `adb shell sync` before `emu kill`.
2. Shut Android down from inside the guest (`adb shell reboot -p`) and wait
   for the emulator to exit.
3. Leave teardown as is.
4. Also add `build-tools` to `install android`, so Appium can read APK
   versions with `aapt2`.

## Decision Outcome

Chosen option: 1, and defer option 4.

* Teardown runs `adb shell sync` (bounded at 15 s) before `emu kill`. A failed
  or unresponsive sync never blocks the shutdown.
* The same controlled test with the sync kept the package intact in 4 of 4
  rounds, at about 0.2 s per shutdown. An end-to-end run through Doc
  Detective's own teardown left all three Appium helper packages intact on the
  next cold boot.
* `install android` doesn't add `build-tools` yet. Without `aapt2`, Appium
  can't read APK versions, so it reinstalls its settings helper every session.
  That reinstall currently repairs helpers that past hard-kill teardowns
  corrupted. The clean snapshot on the test host held exactly such a broken
  `io.appium.settings`. With `aapt2`, Appium trusts the on-device version,
  skips the reinstall, and the session fails. An earlier experiment confirmed
  this: every session failed.

### Consequences

* Good: data written to an AVD during a run survives teardown.
* Good: the cost is about 0.2 s per shutdown. Completion stayed at a 20.4 s
  median on the `android-app-flow` fixture.
* Bad: the stale-server problem remains, as it already did. Without `aapt2`,
  Appium reports the UiAutomator2 server's install state as unknown and never
  upgrades it. The test host's AVD ran server 7.4.0 while the driver bundles
  10.6.6.
* Neutral: fixing that needs Doc Detective to install Appium's helper APKs
  itself before saving the clean snapshot. It also needs the snapshot retaken
  when the driver version changes. With both in place, `build-tools` becomes
  safe to add. That's tracked as follow-up work.

### Confirmation

* `test/android-emulator.test.js` asserts that the shutdown flushes first, and
  that a failed flush still shuts down.
* The controlled test and the end-to-end run above, on Windows WHPX.

## Pros and Cons of the Options

### Option 1: sync, then `emu kill`

* Good: tiny and fast, and it reuses the existing shutdown path.
* Bad: it flushes the page cache but doesn't stop running apps cleanly. That's
  enough for files that are already written.

### Option 2: guest shutdown

* Good: the cleanest shutdown Android offers.
* Bad: it takes several seconds per emulator and depends on a responsive
  guest, so it needs its own timeout and fallback.

### Option 3: leave as is

* Bad: freshly written files are lost or corrupted.

### Option 4: add build-tools now

* Good: Appium skips redundant reinstalls and would upgrade a stale server.
* Bad: on AVDs that already hold corrupted helpers, every session fails until
  the helpers are reinstalled.
