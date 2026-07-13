---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Keep google_apis Android emulator images; reject ATD images

## Context and Problem Statement

The Android CI legs' costs are dominated by multi-GB `sdkmanager` system-image downloads and cold
emulator boots. Google's Automated Test Device (ATD) images (`aosp_atd`, `google_atd`) are
purpose-built for headless CI — smaller downloads and faster boots — and were evaluated during the
2026-07 CI wall-clock investigation as a replacement for the `google_apis` images used by
[`doc-detective install android`](../src/runtime/androidInstaller.ts), the lazy bootstrap, and the
[fixtures.yml](../.github/workflows/fixtures.yml) KVM legs. Should Doc Detective's managed Android
installs switch to (or offer) ATD images?

## Decision Drivers

* CI wall-clock time (download size, boot time) and download-flake exposure.
* Fixture coverage integrity: `mobile-web-android` drives **device Chrome** through the shared
  UiAutomator2 session; `apps-android` installs its own APK.
* Production representativeness: Doc Detective's premise is verifying what a user's reader
  actually sees; stripped images weaken that fidelity claim.
* API-level availability of image variants.

## Considered Options

* **Keep `google_apis` (full image) everywhere.**
* **Switch managed installs to ATD images.**
* **Split by requirement:** ATD for pure-app specs, `google_apis` where device Chrome is needed.

## Decision Outcome

Chosen option: **keep `google_apis` everywhere**, because ATD images strip preinstalled apps —
putting the `mobile-web-android` Chrome dependency at direct risk (`aosp_atd` lacks Chrome;
`google_atd`'s Chrome presence is unverified) — carry no Play Store and (on `aosp_atd`) no Google
Play services, disable services/animations that make them less production-representative, and
exist for a narrower API-level range than `google_apis`. The wall-clock problem is instead
attacked by the [warm phase](../docs/design/warm-phase.md) (overlapped boots) and the installer's
existing transient-download retry/verification, which don't trade away image fidelity.

### Consequences

* Good: `mobile-web-android` fixtures keep a guaranteed device Chrome; future GMS-dependent app
  fixtures stay possible; emulator behavior stays closest to real devices.
* Bad: managed installs keep paying the full `google_apis` download size and boot time; the
  truncated-download flake surface stays proportionally larger.
* Neutral: the split-by-requirement option remains available later without a breaking change (an
  installer image option is additive) if new evidence — e.g. a verified Chrome-bearing
  `google_atd` — changes the trade-off.

### Confirmation

The managed Android paths ([androidInstaller.ts](../src/runtime/androidInstaller.ts), the fixtures
KVM legs) continue to specify `google_apis` targets; the `mobile-web-android` required-PASS gate
on the KVM legs keeps proving device Chrome is present.

## Pros and Cons of the Options

### Keep `google_apis` (CHOSEN)

* Good: full stock-app surface (Chrome, Settings), GMS, Play-adjacent behavior; maximal fidelity.
* Good: broadest API-level availability.
* Bad: largest download and slowest boot of the options.

### Switch to ATD images

* Good: smaller downloads (less flake exposure), meaningfully faster boots, purpose-built for
  headless CI.
* Bad: preinstalled apps are stripped — breaks `mobile-web-android`'s device-Chrome dependency
  outright on `aosp_atd`, unverified on `google_atd`.
* Bad: no Play Store; `aosp_atd` has no GMS at all; disabled services reduce representativeness.
* Bad: narrower API-level availability.

### Split by requirement

* Good: captures ATD's speed for pure-app specs while keeping Chrome where needed.
* Bad: two image variants to install, cache, and debug; per-spec image selection logic; the KVM
  legs share one emulator across app and mobile-web groups, so a split forfeits the shared-boot
  savings that motivated it.
