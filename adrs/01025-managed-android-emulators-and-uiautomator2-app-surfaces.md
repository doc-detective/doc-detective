---
status: accepted
date: 2026-07-04
decision-makers: doc-detective maintainers
---

# Managed Android emulators + UiAutomator2 app surfaces (phase A3b)

## Context and Problem Statement

Phase A3a (ADR 01024) shipped `android` as a capability-gated target platform, the revised device
descriptor, and the opt-in toolchain installer — but android contexts always SKIPPED. Phase A3b
gives them a **PASS path**: a managed Android emulator (boot / reuse / create / teardown), the
UiAutomator2 locator column, `.apk` install + activity launch, and multiple apps sharing one device.

The problems: (1) the desktop A1/A2 flow is one Appium session per app on the host — Android needs
one session per *device*, shared across the device's apps; (2) devices are heavyweight (GBs of RAM,
30–90s boots) and must be created once and swept correctly; (3) UiAutomator2's locator semantics
differ from the desktop columns in ways that matter for correctness; and (4) real emulator coverage
is only possible on a Linux CI runner with KVM, so the runtime must gate cleanly everywhere else.

## Decision Drivers

* **Reuse the A1/A2 seam.** Android is a new row in the `APP_DRIVER_PLATFORMS` table and a new branch
  in `startAppSurface`; the desktop paths must stay byte-stable.
* **Launch ownership.** Doc Detective sweeps only the emulators *it* booted, leaving pre-existing
  ones (a developer's running emulator, the CI emulator-runner's) alive.
* **Preflight gates, steps fail.** Environment/resolvability gaps (no acceleration, no image, no
  Java, an unknown reference AVD) are SKIPs decided at preflight; a boot/install crash at step time
  is a FAIL.
* **Correctness of the locator column.** UiAutomator2's attribute model is not the desktop model —
  getting the `id`-strategy and name-attribute mapping wrong silently breaks every android test.
* **Honest CI.** The general matrix SKIPs android; dedicated KVM jobs carry the PASS gate.

## Considered Options

**Session model:**
* **One shared driver session per device, keyed by device name; switch by `activateApp`** (chosen).
* One session per app (the desktop model) — rejected: UiAutomator2 sessions are per-device, and two
  sessions contending for one emulator is wasteful and racy.

**When devices are resolved/booted:**
* **Preflight validates resolvability (device plan); the first `startSurface` boots** (chosen) —
  keeps "preflight gates, steps fail," and a non-app step in an android context never pays a boot.
* Boot every device at preflight — rejected: boots devices a test might not reach.

**Device registry scope:**
* **Run-level, mirroring `processRegistry`, swept in the run-end `finally`** (chosen) — devices
  outlive a single context so two contexts wanting the same device share one boot.
* Per-context — rejected: re-boots the same emulator per context.

**`elementId` locator strategy on UiAutomator2:**
* **`id` strategy for a lone id (resource-id, appPackage-prefixed)** (chosen).
* The A1/A2 "accessibility id" fast path — **rejected as a correctness bug**: "accessibility id" on
  UiAutomator2 resolves to **content-desc**, not resource-id.

## Decision Outcome

**Chosen:** a run-level device registry with reuse-or-create acquisition and launch-ownership
teardown; one shared UiAutomator2 session per device with activate-on-switch; a preflight that
resolves the device plan and installs the driver; and the UiAutomator2 locator column with its
Android-specific rules.

### The device layer (`src/core/tests/androidEmulator.ts`)

Pure, unit-tested: `adb`/`emu`/`-list-avds`/`-accel-check` parsers, `normalizeDeviceDescriptor`
(context default ⊕ step override), `planDeviceAcquisition` (reuse-running → boot-existing →
create-and-boot → skip), `emulatorBootArgs`, `nextEmulatorPort`. Effectful (c8-ignored,
CI-validated): the adb/emulator/avdmanager wrappers. `acquireDevice` memoizes an in-flight boot
promise on the registry entry so concurrent acquirers of one device converge on a single boot; the
registry is swept in the run-end `finally`, killing only `bootedByUs` devices.

### The UiAutomator2 column (`appSurface.ts`)

`buildUiAutomator2Locator`: `elementText`→`@text`; a lone `elementId`/`elementTestId`→the **`id`**
strategy (resource-id, auto-prefixed with the current `appPackage`); combined criteria→`@resource-id`
XPath; `elementAria.role`→a widget class (`android.widget.*`); `elementAria.name`→`@content-desc`.
Because `@text` and `@content-desc` are **distinct** attributes, the elementText/aria-name conflict
rule is now per-platform (`nameFieldsCollide`, true for Windows/macOS, false for Android). The
`~id` escape hatch stays "accessibility id" and therefore means content-desc on Android — documented.

### Runtime wiring (`tests.ts`)

`androidContextPreflight` composes SDK detection → acceleration probe (SKIP with a KVM/HVF/WHPX
message when unaccelerated and no emulator is running) → device-plan validation → UiAutomator2 driver
install (via the shared `appSurfacePreflight` with `platform: "android"`). On ok, `runContext` primes
the app session with the device layer and **falls through** to the shared step-execution path (the
one desktop `!platformMatches` skip is guarded on `!appSession`). `startAppSurface`'s android branch
acquires the device, gets-or-creates its shared session (first app launches; subsequent apps
`installApp` + `activateApp`), and registers the surface with its `deviceName`. Action handlers call
`ensureAppForeground` to switch apps on the shared session. The Appium server gets `ANDROID_HOME`/
`ANDROID_SDK_ROOT`; android contexts take an `"android-emulator"` exclusive scheduler resource so
they serialize (each emulator is GBs of RAM — exclusivity-as-bound; a counted semaphore is future
work).

### Consequences

* Good: the algorithmic core (locator column, plan logic, capabilities, session lifecycle) is fully
  unit-tested with fakes; the emulator-dependent runtime is c8-ignored and CI-validated.
* Good: launch ownership means a developer's running emulator survives a Doc Detective run.
* Bad / accepted: the emulator PASS path is validated only on the KVM CI legs, not locally or on the
  general matrix — those legs are expected to need boot-timeout and locator tuning as system images
  evolve.
* Bad / accepted: the `install android` bootstrap-from-nothing path is still deferred (A3a); the
  managed-boot CI leg exercises the augment path against the runner's preinstalled SDK.

### Confirmation

- `test/app-surface.test.js`: the UiAutomator2 locator matrix (incl. the `id`-strategy fast path and
  text/aria coexistence on android vs. conflict on desktop), the android `startAppSurface` branch
  (shared session, install+activate on the second app, acquire-skip → FAIL), `ensureAppForeground`
  switching, and android close/teardown (terminateApp, then end the device session).
- `test/android-emulator.test.js`: parsers, `planDeviceAcquisition` (all reuse/boot/create/skip
  paths), `acquireDevice` with injected effects (reuse/boot/create + boot-promise sharing), and
  launch-ownership teardown.
- `test/core-artifacts/apps-android/`: five fixtures — app-flow, multi-app, install+activity,
  provisioning, and image-missing-skip — SKIP on every incapable host (asserted gating) and PASS on
  the two KVM jobs in [.github/workflows/fixtures.yml](../.github/workflows/fixtures.yml) (reuse +
  managed-boot), gated with `DD_FIXTURES_REQUIRE_PASS=1`.

## Pros and Cons of the Options

### One shared session per device (chosen)

* Good, because it matches UiAutomator2's per-device session model and boots one emulator for many
  apps.
* Neutral: the session sharing is invisible in the schema — the authoring model stays one surface
  per app.

### Preflight resolves the plan; first startSurface boots

* Good, because gaps gate (SKIP) and boots are paid only when an app actually opens.
* Bad, because a device that dies between preflight and the boot surfaces as a step FAIL (correct,
  but a two-phase failure mode) — accepted.

### `id` strategy for lone resource-id

* Good, because it's the correct UiAutomator2 semantics (accessibility id ≠ resource-id there).
* Neutral: combined criteria need a fully-qualified `pkg:id/name` in the XPath form — documented,
  with auto-prefix sugar as possible later work.
