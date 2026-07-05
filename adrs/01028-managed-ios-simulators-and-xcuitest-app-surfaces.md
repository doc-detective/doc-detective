---
status: accepted
date: 2026-07-05
decision-makers: [hawkeyexl]
---

# Managed iOS simulators and executable XCUITest app surfaces

## Context and Problem Statement

Phase A4's first step (ADR 01027) enabled iOS *preflight* — it removed the roadmap
skip, resolved/installed `appium-xcuitest-driver`, and gated on `xcode-select`/`simctl`
— but it did **not** give iOS a way to actually run. In `startAppSurface` an iOS context
fell through the *desktop* branch and created an XCUITest session with **no target
simulator** (no `udid`, no booted device). On a capable macOS host the preflight passed
and the session then failed for lack of a device, so no iOS fixture could reach PASS.
ADR 01027 explicitly deferred "the full simulator lifecycle parity (managed
boot/reuse/teardown)" as follow-on. This ADR is that follow-on.

The commit that introduced A4 preflight (`c4893c49`) also shipped defects that had to be
repaired first — an `npm ci`-breaking `optionalDependencies` entry with a stale lockfile,
stale generated schema outputs, a dead `mobileContextSkipReason` branch propped up by a
green-washing test, a `core-core` test that asserted iOS SKIPs on every host (failing the
macOS unit leg), and untested `installIos` branches. Those are corrected in a preceding
`fix` commit; this ADR covers the lifecycle feature.

## Decision Drivers

- Give iOS a real PASS path on capable macOS hosts, ending the "preflight-only" state.
- Reuse the Android managed-device architecture verbatim so the two mobile targets share
  one mental model (descriptor → plan → registry → shared session → activateApp).
- Keep everything deterministic and non-destructive off macOS (SKIP with guidance).
- Let `simctl` own the heavy lifting (boot/create) while Doc Detective owns *which*
  simulator and launch-ownership for the run-end sweep.
- Keep the cross-platform unit suite green and the coverage ratchet intact — the
  effectful simctl paths are macOS-only and exercised by the `apps-ios` fixtures, not the
  unit suite.

## Considered Options

1. Leave iOS at preflight-only (ADR 01027 state) and defer execution again.
2. Have the XCUITest driver auto-pick/boot a simulator (pass only `deviceName`/
   `platformVersion`, no Doc-Detective-owned lifecycle).
3. Implement a Doc-Detective-owned `simctl` simulator registry mirroring the Android
   emulator layer: resolve the newest iPhone (or a named/created device), boot/reuse it,
   attach XCUITest by `udid`, share one session per simulator with `activateApp`
   switching, and shut down only simulators we booted at run end.

## Decision Outcome

Chosen option: **3**.

- New `src/core/tests/iosSimulator.ts` mirrors `androidEmulator.ts`: pure `simctl … --json`
  parsers, runtime/device-type selection, `planSimulatorAcquisition`
  (reuse-booted → boot → create-boot → skip), and an effectful `SimulatorRegistry` /
  `acquireSimulator` / `teardownSimulatorRegistry` with all effects injected.
- The shared device descriptor (`normalizeDeviceDescriptor` + `DeviceDescriptor`) moves to
  `src/core/tests/mobileDevice.ts`, imported by both mobile layers.
- `startAppSurface`'s Android branch is generalized to all mobile targets
  (`isMobileTargetPlatform`): one XCUITest session per simulator, `activateApp` switching,
  and the shared-session readiness-failure handling. The `ios` driver row already builds
  `appium:udid` from the acquired simulator.
- `runContext` threads a run-level `simulatorRegistry` (parallel to `deviceRegistry`),
  `iosContextPreflight` validates the default simulator is resolvable and returns the
  injected simctl effect bundle, and the `serverDeps.acquireDevice` closure dispatches to
  `acquireSimulator` for iOS — the same `{ entry:{name,udid} } | { skip }` shape Android
  returns, so the launch path stays uniform.
- Default device = the newest installed iPhone device type + newest iOS runtime. A named
  device reuses/boots/creates under that name. `deviceType: "tablet"` targets iPad.
- No schema change: `deviceDescriptor` already carries `platform`/`name`/`deviceType`/
  `osVersion`/`install`. `headless` is documented as a no-op on iOS.

### Consequences

- Good: `ios` app contexts now PASS end-to-end on macOS (startSurface → find/click/
  screenshot → closeSurface), with reuse/create and a booted-by-us teardown sweep.
- Good: the `apps-ios` fixture leg is promoted to require ≥1 PASS on macOS
  (`DD_FIXTURES_REQUIRE_PASS`), so an environment regression can't hide as all-SKIPPED;
  Windows/Linux stay skip-tolerant.
- Good: Android and iOS now share one device-layer shape, reducing future surface area.
- Trade-off: deeper refinements (parallel multi-simulator boots, orientation, real
  devices/WebDriverAgent provisioning, mobile Safari) remain later-phase scope
  (A5–A8, Phase 6).

### Confirmation

- Unit tests cover the pure `iosSimulator` layer (parsers, selection, `planSimulator-
  Acquisition` reuse/boot/create/skip, `acquireSimulator` memoization + failure drop,
  teardown) and the generalized `startAppSurface` iOS path (udid/bundleId capabilities,
  shared session + `activateApp`, unsupported-field FAILs, acquire-skip FAIL).
- The `apps-ios` fixtures exercise the real end-to-end path on macOS via
  `.github/workflows/fixtures.yml` (require-pass) and the single-leg
  `fixtures-debug.yml` workflow dispatch from non-macOS development hosts.

## Pros and Cons of the Options

### 1. Preflight-only (defer again)

- Good, because it avoids implementation risk.
- Bad, because `ios` stays unusable despite full schema + driver-table support.

### 2. Driver-auto-picked simulator

- Good, because it is less code.
- Bad, because it is non-deterministic across Xcode versions, gives no reuse/teardown
  ownership, and diverges from the Android model (two mental models for one concept).

### 3. Doc-Detective-owned simctl registry (chosen)

- Good, because it delivers a deterministic PASS path and one shared mobile-device model.
- Good, because launch-ownership makes the run-end sweep safe (never kills a pre-existing
  booted simulator).
- Bad, because it is more code than option 2 — mitigated by mirroring the proven Android
  layer one-to-one.
