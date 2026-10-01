---
status: accepted
date: 2026-07-07
decision-makers: doc-detective maintainers
---

# Serialize recording native-app contexts under concurrency

## Context and Problem Statement

ADR 01001 introduced the resource-aware concurrency scheduler. Each context job declares a set of
exclusive resource names, and two jobs sharing a resource never run concurrently, while everything
else stays parallel. ADR 01025 added `"android-emulator"` for heavyweight emulators.
**ADR 01038** added `"native-app-driver"`, so two non-android native app-driver contexts never boot
the single per-host driver stack at once. Those are macOS Mac2, Windows NovaWindows, and
iOS/xcuitest, and two concurrent sessions clobber the stack.

ADR 01038 fixed iOS and the plain, non-recording macOS and Windows app flows. But the `apps` fixture
group **still** failed at `concurrentRunners: 2`, with the same per-host contention class. It now
showed up on the **recording** app fixtures:

```
# apps (macos-latest) — rec-app-macos-default-window (record + stopRecord on TextEdit):
App "com.apple.TextEdit" launched but never became ready:
... WebDriverError: Session does not exist when running "element" with method "POST"

# apps (windows-latest) — rec-app-default-window (record + stopRecord on charmap):
No element matched {"elementText":"Select","surface":{"app":"charmap"}} within 5000ms
```

The CI timelines are decisive. The recording app context (`rec-app-*`) and a **plain** native-app
context started within seconds of each other, and ran concurrently. That plain context is
`app-env-launch` on macOS, and `app-then-tty-app` on Windows. Both drove the single per-host Mac2 or
NovaWindows driver, and one session was clobbered mid-run. At `concurrentRunners: 1` the same
fixtures pass.

The root cause is in `jobDisplayResources` (`src/core/tests.ts`). ADR 01038 gated the
`"native-app-driver"` tag on `mobileBrowserGate(...).action === "proceed"`, borrowing the
`attemptsEmulator` gating discipline. That gate is meaningful only on **mobile** targets, where a
context that mixes native-app and device-browser steps deterministically SKIPs. But the gate reads
`hasBrowserStep = isBrowserRequired(context)`, and `isBrowserRequired` classifies any
`BROWSER_STEP_KEYS` step that is **not app-targeting** as a browser step. A **recording** app context
carries `record`, an object payload with `surface: { app }`, correctly app-targeting. It **also**
carries `stopRecord: true`, a bare `true` payload that is *not* app-targeting. So `isBrowserRequired`
reports a "browser step". `mobileBrowserGate` returns `skip`, interpreting it as mixed native-app
plus device browser. The desktop recording app context then **loses** the `"native-app-driver"`
bound, and holds only `"display"`. A plain app context holds `"native-app-driver"`. The two resource sets are
**disjoint**, so the scheduler runs them concurrently and they clobber the shared driver.

There is no device browser on desktop to mix with, so the gate never should have run there.

## Decision Drivers

* **Fix the actual seam, minimally.** The tag is otherwise correct; only the desktop gating is wrong.
  One predicate change, no new machinery, composing with ADR 01038/01025/01001 exactly as before.
* **Only serialize contexts that actually boot the shared driver.** A desktop context contends iff
  `isAppDriverRequired`. A plain desktop browser, firefox or chrome, still parallelizes.
* **Keep mobile gating intact.** On ios/android the gate genuinely SKIPs mixed app+web contexts and
  those must still take nothing; only desktop must bypass the gate.
* **Compose, don't collide.** A recording app context holds BOTH `"native-app-driver"` and
  `"display"`; the union order must stay the canonical `["native-app-driver", "display"]`.
* **`concurrentRunners: 1` stays byte-identical.** The `limit === 1` path bypasses the resource-aware
  pool entirely and must not change.

## Considered Options

* **Apply `mobileBrowserGate` only on mobile targets (chosen).** On mac/windows a native-app context
  (`isAppDriverRequired`) always contends for the shared driver, so it always takes
  `"native-app-driver"`. The gate still runs on ios/android. Order the resource union driver-bound
  first so the display bound composes as `["native-app-driver", "display"]` no matter which path
  added `"display"`.
* **Teach `isBrowserRequired` / `stepTargetsAppSurface` that `record`/`stopRecord` are app-driven.**
  Rejected. `stopRecord: true` has no surface to inspect, and `record`/`stopRecord` legitimately run
  on browser contexts too. So this would mis-tag real browser recordings. It also touches the runtime
  browser-need inference shared with `inferRuntimeNeeds`, far more blast radius than the crash needs.
* **Force the whole run serial when any native-app recording is present.** Rejected: it collapses all
  parallelism, the regression ADR 01001 exists to prevent.

## Decision Outcome

Chosen: **restrict `mobileBrowserGate` to mobile targets in `jobDisplayResources`.**

`jobDisplayResources` now computes `gateProceeds = !isMobileTarget || mobileBrowserGate(...) ===
"proceed"`, where `isMobileTarget` is `ios` or `android`. `attemptsNativeAppDriver` then tags a
desktop app-driver context with `"native-app-driver"` unconditionally, meaning
`isAppDriverRequired` on mac or windows. Mobile keeps the SKIP-aware gate. An ios context still
contends for the simulator, whether app or web. A mixed-mobile SKIP context still takes nothing.
The final union is ordered
`[...extra, ...base, ...displayPromotion]` so a recording app context resolves to
`["native-app-driver", "display"]`. At `concurrentRunners: 1` the code path is unchanged.

### Consequences

* Good: `concurrentRunners > 1` is now safe for **recording** native macOS and Windows app surfaces.
  A recording app context queues on `"native-app-driver"` against every other native app context,
  instead of clobbering the shared driver. iOS and plain-app flows (ADR 01038) are unaffected.
* Good: desktop browser contexts still parallelize, since they aren't `isAppDriverRequired`. Mobile
  gating is untouched.
* Neutral: recording app contexts on one host now run one-at-a-time alongside other native app
  contexts. That's physical reality, one shared driver stack, and no slower than the
  `concurrentRunners: 1` workaround.
* Neutral, and future work: the bound is exclusive, one-at-a-time, rather than a counted semaphore.
  That's the same limitation `"android-emulator"` and ADR 01038 carry.

### Confirmation

* Unit tests in `test/concurrency.test.js` were written first, red → green. `jobDisplayResources`
  returns `["native-app-driver", "display"]` for a **macOS** and a **Windows** recording app context
  (`startSurface` + `record` + `stopRecord`), when a display recording is present. Previously it
  returned `["display"]` only. A `runResourceAware` test confirms a recording app context and a plain
  app context, tagged by the real `jobDisplayResources`, never overlap on `"native-app-driver"`. The
  existing ADR 01038 cases (ios/android/browser/mixed/desktop-browser) still pass unchanged.
* End-to-end: the `apps` macOS and Windows fixtures jobs run at `concurrentRunners: 2`, in PR #532.
  Each exercises a recording app context concurrently with a plain app context. Each must reach PASS
  or SKIPPED, instead of the session-clobber FAIL those two jobs hit without this fix.

## Pros and Cons of the Options

### Restrict `mobileBrowserGate` to mobile targets (chosen)

* Good: it's minimal. One predicate reuses ADR 01001's scheduler and ADR 01038's resource name.
* Good: composes with `"display"`; keeps desktop-browser and mobile parallelism/SKIP semantics intact.
* Neutral: exclusive (one-at-a-time) rather than a counted semaphore.

### Teach `isBrowserRequired` that `record`/`stopRecord` are app-driven

* Good: would fix the misclassification at its source for app contexts.
* Bad: `stopRecord: true` has no surface to key on. `record`/`stopRecord` also run on real browser
  contexts, so this mis-tags browser recordings, and touches shared runtime browser-need inference.

### Force the whole run serial when a native-app recording is present

* Good: trivially correct.
* Bad: it destroys parallelism for every unrelated job, the regression ADR 01001 exists to prevent.
