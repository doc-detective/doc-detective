---
status: accepted
date: 2026-07-04
decision-makers: doc-detective maintainers
---

# Managed Android emulators + UiAutomator2 app surfaces (phase A3b)

## Context and Problem Statement

Phase A3a (ADR 01024) shipped `android` as a capability-gated target platform, the revised device
descriptor, and the opt-in toolchain installer. But android contexts always SKIPPED. Phase A3b
gives them a **PASS path**. That's a managed Android emulator, with boot, reuse, create, and
teardown. It adds the UiAutomator2 locator column, `.apk` install and activity launch, and multiple
apps sharing one device.

Four problems stand in the way. First, the desktop A1 and A2 flow is one Appium session per app on
the host. Android needs one session per *device*, shared across the device's apps. Second, devices
are heavyweight, at GBs of RAM and 30–90s boots, and must be created once and swept correctly.
Third, UiAutomator2's locator semantics differ from the desktop columns in ways that matter for
correctness. Fourth, real emulator coverage is only possible on a Linux CI runner with KVM, so the
runtime must gate cleanly everywhere else.

## Decision Drivers

* **Reuse the A1/A2 seam.** Android is a new row in the `APP_DRIVER_PLATFORMS` table and a new branch
  in `startAppSurface`; the desktop paths must stay byte-stable.
* **Launch ownership.** Doc Detective sweeps only the emulators *it* booted, leaving pre-existing
  ones (a developer's running emulator, the CI emulator-runner's) alive.
* **Preflight gates, steps fail.** Environment and resolvability gaps are SKIPs decided at
  preflight. Those are no acceleration, no image, no Java, or an unknown reference AVD. A boot or
  install crash at step time is a FAIL.
* **Correctness of the locator column.** UiAutomator2's attribute model is not the desktop model.
  Getting the `id`-strategy and name-attribute mapping wrong silently breaks every android test.
* **Honest CI.** The general matrix SKIPs android; dedicated KVM jobs carry the PASS gate.

## Considered Options

**Session model:**
* **One shared driver session per device, keyed by device name; switch by `activateApp`** (chosen).
* One session per app, the desktop model. Rejected, since UiAutomator2 sessions are per-device, and
  two sessions contending for one emulator is wasteful and racy.

**When devices are resolved/booted:**
* **Preflight validates resolvability, the device plan, and the first `startSurface` boots**
  (chosen). It keeps "preflight gates, steps fail", and a non-app step in an android context never
  pays a boot.
* Boot every device at preflight. Rejected, since it boots devices a test might not reach.

**Device registry scope:**
* **Run-level, mirroring `processRegistry`, swept in the run-end `finally`** (chosen). Devices
  outlive a single context, so two contexts wanting the same device share one boot.
* Per-context. Rejected, since it re-boots the same emulator per context.

**`elementId` locator strategy on UiAutomator2:**
* **`id` strategy for a lone id (resource-id, appPackage-prefixed)** (chosen).
* The A1 and A2 "accessibility id" fast path. **Rejected as a correctness bug.** "accessibility id"
  on UiAutomator2 resolves to **content-desc**, rather than resource-id.

## Decision Outcome

**Chosen:** a run-level device registry with reuse-or-create acquisition and launch-ownership
teardown. One shared UiAutomator2 session per device, with activate-on-switch. A preflight that
resolves the device plan and installs the driver. And the UiAutomator2 locator column with its
Android-specific rules.

### The device layer (`src/core/tests/androidEmulator.ts`)

The pure, unit-tested parts are the `adb`, `emu`, `-list-avds`, and `-accel-check` parsers,
`normalizeDeviceDescriptor` (context default ⊕ step override), `planDeviceAcquisition`
(reuse-running → boot-existing → create-and-boot → skip), `emulatorBootArgs`, and
`nextEmulatorPort`. The effectful parts are c8-ignored and CI-validated: the adb, emulator, and
avdmanager wrappers. `acquireDevice` memoizes an in-flight boot promise on the registry entry, so
concurrent acquirers of one device converge on a single boot. The registry is swept in the run-end
`finally`, killing only `bootedByUs` devices.

### The UiAutomator2 column (`appSurface.ts`)

`buildUiAutomator2Locator` maps `elementText` to `@text`. A lone `elementId` or `elementTestId` maps
to the **`id`** strategy, a resource-id auto-prefixed with the current `appPackage`. Combined
criteria map to a `@resource-id` XPath. `elementAria.role` maps to a widget class,
`android.widget.*`, and `elementAria.name` maps to `@content-desc`. `@text` and `@content-desc` are
**distinct** attributes, so the elementText and aria-name conflict rule is now per-platform. That's
`nameFieldsCollide`, true for Windows and macOS, and false for Android. The `~id` escape hatch stays
"accessibility id", and therefore means content-desc on Android, which is documented.

### Lazy toolchain install (behavior change)

The Android SDK and system image are **never installed by default**. But they **are lazily installed
when a run actually needs them on a capable host**, rather than SKIPping with a "run
`doc-detective install android`" pointer. `androidContextPreflight` probes host capability first, so
a host that couldn't run the emulator never triggers a multi-GB download. Only then, if the
toolchain or image is missing, does it run the installer. That's the same augment-or-bootstrap
`installAndroid` from A3a. The install is **loud**. A clear warning is emitted to **both** the
terminal and the output report, in `contextReport.warnings`. So a run that quietly downloaded the
SDK is auditable. Order matters: **capability → lazy install → device plan → driver**. Installing
before confirming the host can run the emulator would waste the download.

`doc-detective install android` is therefore no longer *required*. It stays the way to **pre-warm**
CI images and containers, so the cost isn't paid at test time. An escape hatch,
`DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL=1`, turns the lazy install back into a SKIP-with-pointer. That
serves environments that must never auto-download, such as air-gapped hosts, and the general
fixture-matrix legs, which only assert the skip paths. Capability without an SDK is probed cheaply,
through Linux `/dev/kvm` read and write access, exactly what enabling the KVM udev rule grants. With
an SDK it's the real `emulator -accel-check`, or an already-running emulator.

### Runtime wiring (`tests.ts`)

`androidContextPreflight` composes a host-capability probe → lazy toolchain install, above →
device-plan validation → UiAutomator2 driver install. The last runs through the shared
`appSurfacePreflight` with `platform: "android"`. On ok, `runContext` primes the app session with
the device layer, and **falls through** to the shared step-execution path. The one desktop
`!platformMatches` skip is guarded on `!appSession`. `startAppSurface`'s android branch acquires the
device, and gets or creates its shared session. The first app launches, and subsequent apps get
`installApp` plus `activateApp`. It registers the surface with its `deviceName`. Action handlers
call `ensureAppForeground` to switch apps on the shared session. The Appium server gets
`ANDROID_HOME` and `ANDROID_SDK_ROOT`. Android contexts take an `"android-emulator"` exclusive
scheduler resource, so they serialize. Each emulator is GBs of RAM, so exclusivity acts as the
bound. A counted semaphore is future work.

### Consequences

* Good: the algorithmic core is fully unit-tested with fakes. That's the locator column, plan logic,
  capabilities, and session lifecycle. The emulator-dependent runtime is c8-ignored and
  CI-validated.
* Good: launch ownership means a developer's running emulator survives a Doc Detective run.
* Bad, and accepted: the emulator PASS path is validated only on the KVM CI legs, rather than
  locally or on the general matrix. Those legs are expected to need boot-timeout and locator tuning
  as system images evolve.
* Good: both installer paths are wired. A bare host with no Android SDK bootstraps the portable
  command-line tools into the cache, and proceeds. The orchestration is unit-tested with injected
  download and extract, and the augment path is exercised by the managed-boot CI leg.

### Confirmation

- `test/app-surface.test.js` covers the UiAutomator2 locator matrix, including the `id`-strategy
  fast path, and text and aria coexistence on android versus conflict on desktop. It covers the
  android `startAppSurface` branch, for the shared session, install-plus-activate on the second app,
  and acquire-skip → FAIL. It also covers `ensureAppForeground` switching, and android close and
  teardown, meaning terminateApp then ending the device session.
- `test/android-emulator.test.js`: parsers, `planDeviceAcquisition` (all reuse/boot/create/skip
  paths), `acquireDevice` with injected effects (reuse/boot/create + boot-promise sharing), and
  launch-ownership teardown.
- `test/core-artifacts/apps-android/` holds five fixtures: app-flow, multi-app,
  install-plus-activity, provisioning, and image-missing-skip. They SKIP on every incapable host,
  with asserted gating. They PASS on the two KVM jobs in
  [.github/workflows/fixtures.yml](../.github/workflows/fixtures.yml), for reuse and managed-boot,
  gated with `DD_FIXTURES_REQUIRE_PASS=1`.

## Pros and Cons of the Options

### One shared session per device (chosen)

* Good, because it matches UiAutomator2's per-device session model and boots one emulator for many
  apps.
* Neutral: the session sharing is invisible in the schema. The authoring model stays one surface
  per app.

### Preflight resolves the plan; first startSurface boots

* Good, because gaps gate (SKIP) and boots are paid only when an app actually opens.
* Bad, because a device that dies between preflight and the boot surfaces as a step FAIL. That's
  correct, but it's a two-phase failure mode. Accepted.

### `id` strategy for lone resource-id

* Good, because it's the correct UiAutomator2 semantics (accessibility id ≠ resource-id there).
* Neutral: combined criteria need a fully-qualified `pkg:id/name` in the XPath form. That's
  documented, with auto-prefix sugar as possible later work.
