# CI iOS simulator pre-boot

The `apps-ios` and `mobile-web-ios` fixture legs pre-boot an iOS simulator
early in the job, right after `setup-node` and marked by the `prebootIos: true`
matrix flag. The cold simulator boot then overlaps `npm ci`, build, link, and
server startup, instead of being paid serially inside the first XCUITest
session. On a warm-WDA run that first session was ~14 min, dominated by the
boot.

## The load-bearing coupling

This changes **which device the fixtures run on**, not just when it boots:

- Doc Detective's default-device plan reuses **any** already-booted iPhone
  before booting or creating its own. `reuse-booted` precedes boot and create in
  [`src/core/tests/iosSimulator.ts`](../../src/core/tests/iosSimulator.ts).
- Whatever the pre-boot step boots therefore becomes the device DD adopts. It
  is left running with `bootedByUs=false`, and the run-end sweep only shuts
  down devices DD itself booted.

Two consequences a maintainer must keep true:

1. **The pre-boot must pick the device DD would pick.** The step selects the
   newest iPhone by newest runtime, then highest model number. Pro and Max sort
   ahead of plain through a name-length proxy, and `iPhone SE` has no model
   number so it sorts last. If `iosSimulator.ts` changes its newest-device
   intent, update the step's sort to match. Otherwise the pre-boot warms a
   device DD would itself reject, and DD boots its own anyway. The overlap
   saving is then silently lost, while the build still goes green.
2. **The iOS fixtures must hold up across device models.** They target stock
   apps such as Settings, with version-tolerant selectors, precisely so the
   exact simulator model doesn't matter. Consider a fixture that asserts on a
   screenshot baseline or a model-specific viewport. It would become CI-only
   flaky the moment the runner image's newest iPhone changes. Keep iOS
   fixtures model-agnostic.

## Operational notes

- A **failed `simctl boot`** does not export `PREBOOT_UDID`. The wait step is
  therefore skipped, and DD boots its own device, with no wasted wait.
- The **wait step is not additive** on the happy path, since DD would wait for
  the same boot. It surfaces the boot cost as its own step. It also fails
  faster than DD's generous per-session timeout when a sim wedges, being
  bounded at 5 minutes.
- If iOS legs regress to roughly cold-boot timings, first check the pre-boot
  step's log. "no available iPhone", or a device DD didn't reuse, means the
  selection drifted from `iosSimulator.ts`.
