---
status: accepted
date: 2026-11-19
decision-makers: hawkeyexl
---

# The emulator package is part of the Android toolchain check

## Context and Problem Statement

A run that targets `android` on a capable host installs the Android toolchain on first use
([ADR 01025](01025-managed-android-emulators-and-uiautomator2-app-surfaces.md)). The Android
preflight asks `planAndroidToolchain` whether the toolchain is `ready`, needs an `install`, or the
host must `skip`. The plan looked at two things: whether an SDK was detected, and whether a system
image exists for each requested Android version.

`detectAndroidSdk` accepts an SDK that has `adb` or the emulator. An SDK with `platform-tools` and
a system image but no `emulator` package therefore planned as `ready`. `avdmanager create` then
failed with `"emulator" package must be installed!`, the context skipped, and the run exited `2`
([#1006](https://github.com/doc-detective/doc-detective/issues/1006)).

That state is easy to reach. The SDK on GitHub-hosted `ubuntu-latest` runners has `platform-tools`
and no emulator. A cache step that restores `$ANDROID_HOME/system-images` alone produces it
([ADR 01214](01214-cache-mobile-tooling-in-the-action.md) hit it while benchmarking).

What should the preflight do when the SDK has the images but no emulator package?

## Decision Drivers

* The docs already say the lazy install covers "the SDK, a system image, and the emulator".
* `installAndroid` already installs a missing `emulator` package. The preflight only has to call it.
* A host that can't run the emulator never downloads anything (ADR 01025).
* `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL` keeps turning every lazy install into a skip.
* A warning in the report has to say what the run downloaded.

## Considered Options

* **A. The plan treats a missing emulator package as an install.**
* **B. `detectAndroidSdk` rejects an SDK without the emulator.**
* **C. Skip the context with a reason that names the missing package.**

## Decision Outcome

Chosen option: **A**. `planAndroidToolchain` takes `emulatorPresent`, which the preflight sets from
the detected SDK's `emulator` path. On a capable host:

* A missing SDK or a missing system image plans an install, with the same warning as before.
* Otherwise a missing emulator package plans an install too. Its warning names the emulator
  package and leaves out the multi-GB note, because only that package downloads:
  ``Android tests require the Android SDK's emulator package, which isn't installed. Doc Detective
  is installing it now. Pre-install with `doc-detective install android` to avoid this delay at
  test time.``
* With `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL` set, the context skips with the existing
  ``Skipped: the Android toolchain isn't fully installed, …`` reason.

The check after the install uses the same plan, so an install that leaves the emulator missing
skips with the existing "still incomplete" reason.

`adb` isn't part of the check. The device layer falls back to `adb` on `PATH` when the SDK has
none, so an SDK without `platform-tools` can still work. Requiring it would start an install on
hosts that run today.

### Consequences

* Good: a partly restored SDK repairs itself instead of skipping the context.
* Good: the install lands in the SDK the run detected, where `avdmanager` looks for it.
* Bad: a run can now download the emulator package (about 320 MiB compressed) where it used to
  skip. The warning in the terminal and in the report says so.
* Neutral: the install also creates the default `doc-detective` AVD, as every lazy install does.
* Neutral: on macOS and Windows the preflight still skips before the plan when the SDK has no
  emulator, because it can't probe hardware acceleration without the emulator binary. Its reason
  points at `doc-detective install android`, which installs the package.

### Confirmation

`test/android-emulator.test.js` covers the plan: an installed image with no emulator package plans
an install with no `osVersion` and the emulator warning, a missing image still wins and names its
version, and an incapable host skips. The preflight that calls the plan is effectful and isn't unit
tested. No fixture covers it either: it needs a KVM host whose SDK has an image and no emulator.

## Pros and Cons of the Options

### A. The plan treats a missing emulator package as an install

* Good: matches the documented toolchain and reuses the installer's existing step.
* Good: the decision stays in the pure, tested plan.
* Bad: one more state that downloads at test time.

### B. `detectAndroidSdk` rejects an SDK without the emulator

* Good: no new input to the plan.
* Bad: the installer reads the same detection. It would bootstrap a second SDK in the cache
  directory and download the system image again, while the detected SDK already has it.

### C. Skip with a reason that names the package

* Good: no download.
* Bad: the user has to run `install android` for something the lazy install already promises.
