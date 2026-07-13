# CI iOS simulator pre-boot

The `apps-ios` and `mobile-web-ios` fixture legs pre-boot an iOS simulator
early in the job (right after `setup-node`, marked by the `prebootIos: true`
matrix flag) so the cold simulator boot overlaps `npm ci` / build / link /
server startup instead of being paid serially inside the first XCUITest
session. On a warm-WDA run that first session was ~14 min, dominated by the
boot.

## The load-bearing coupling

This changes **which device the fixtures run on**, not just when it boots:

- Doc Detective's default-device plan reuses **any** already-booted iPhone
  before booting or creating its own — `reuse-booted` precedes boot/create in
  [`src/core/tests/iosSimulator.ts`](../../src/core/tests/iosSimulator.ts).
- So whatever the pre-boot step boots becomes the device DD adopts
  (`bootedByUs=false`, left running; the run-end sweep only shuts down devices
  DD itself booted).

Two consequences a maintainer must keep true:

1. **The pre-boot must pick the device DD would pick.** The step selects the
   newest iPhone: newest runtime, then highest model number (Pro/Max ahead of
   plain via a name-length proxy; `iPhone SE` has no model number and sorts
   last). If `iosSimulator.ts` changes its newest-device intent, update the
   step's sort to match — otherwise the pre-boot warms a device DD would
   itself reject, DD boots its own anyway, and the overlap saving is silently
   lost (the build still goes green).
2. **The iOS fixtures must stay device-model-robust.** They target stock apps
   (Settings) with version-robust selectors precisely so the exact simulator
   model doesn't matter. A fixture that asserts on a screenshot baseline or a
   model-specific viewport would become CI-only flaky the moment the runner
   image's newest iPhone changes. Keep iOS fixtures model-agnostic.

## Operational notes

- A **failed `simctl boot`** does not export `PREBOOT_UDID`, so the wait step
  is skipped and DD boots its own device — no wasted wait.
- The **wait step is not additive** on the happy path (DD would wait for the
  same boot); it exists to surface the boot cost as its own step and to fail
  faster (5-min bound) than DD's generous per-session timeout if a sim wedges.
- If iOS legs regress to ~cold-boot timings, first check the pre-boot step's
  log: "no available iPhone" or a device DD didn't reuse means the selection
  drifted from `iosSimulator.ts`.
