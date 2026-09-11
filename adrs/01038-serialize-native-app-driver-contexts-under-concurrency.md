---
status: accepted
date: 2026-07-07
decision-makers: doc-detective maintainers
---

# Serialize native app-surface driver contexts under concurrency

## Context and Problem Statement

ADR 01001 introduced the resource-aware concurrency scheduler. Each context job may declare a set of
exclusive resource names. Two jobs sharing a resource never run concurrently, while everything
else stays parallel. ADR 01025 extended that pattern for Android. Each managed emulator is
heavyweight, so android app contexts take an `"android-emulator"` resource that bounds them to one at
a time.

Native **desktop** and **iOS-simulator** driver contexts were left out. macOS Mac2, Windows
NovaWindows, and iOS/xcuitest each drive their target through a **single, per-host driver stack**.
When `concurrentRunners > 1`, two such contexts start at once and clobber that shared stack. CI
reproduced this across **three** macOS jobs of PR #532 (which sets the fixtures to
`concurrentRunners: 2`), each the same per-host contention class:

```
# apps (Mac2):
App "/System/Applications/Calculator.app" launched but never became ready:
... 'POST /element' cannot be proxied to Mac2 Driver server because its
process is not running (probably crashed).

# apps-ios (xcuitest):
WebDriverError: Session does not exist ...
Could not proxy command to the remote server. Original error:
connect ECONNREFUSED 127.0.0.1:8100  (WebDriverAgent)

# mobile-web-ios (Safari on the iOS simulator):
WebDriverError: Missing parameter: appIdKey ... → "No elements matched
selector or text."  (the session was clobbered mid-run by the second
concurrent iOS-simulator session)
```

The `apps-ios` and `mobile-web-ios` failures are decisive on the iOS point. **Both** kinds of iOS
context contend on the *same* per-host iOS simulator and WebDriverAgent. Those are native app
(xcuitest) **and** mobile-web (Safari on the sim), so two of *either* clobber each other. The
`mobile-web-ios` job passes on Windows, where iOS contexts SKIP. That confirms it's per-host
simulator contention, not an unrelated element-matching bug.

At `concurrentRunners: 1` the same fixtures pass, confirming the crash is concurrency-induced. In
`jobDisplayResources` (`src/core/tests.ts`), a native desktop/iOS driver context took **no**
exclusive resource unless the run also had a shared-display recording, so nothing serialized them.

## Decision Drivers

* **Reuse the ADR 01001 seam.** The scheduler already serializes on named resources. The fix should
  be one more resource name, not new machinery, exactly how ADR 01025 added `"android-emulator"`.
* **Only serialize contexts that actually boot the shared per-host driver.** On macOS and Windows
  that means a native-**app** context. A plain desktop firefox or chrome browser uses its own
  browser session, and must still parallelize. On **iOS** it means *any* context that boots the
  simulator, native app **or** mobile-web Safari, since they share one simulator and WDA. Some
  contexts deterministically SKIP or FAIL, on the wrong platform, mixed native-app and browser on
  mobile, or unsupported. Such a context boots nothing and must take nothing. That's the same gating
  discipline as the existing `attemptsEmulator` branch.
* **Don't double-bound Android.** Android already serializes on `"android-emulator"`; the new
  resource is for non-android native app surfaces only.
* **Compose, don't collide.** A job may already hold `"display"` for recording. The new resource
  must union with it, not replace it.
* **`concurrentRunners: 1` stays byte-identical.** The `limit === 1` path bypasses
  `runResourceAware` entirely and must not change.

## Considered Options

* **A new `"native-app-driver"` exclusive resource for non-android native app-driver contexts**
  (chosen). Mirrors the `"android-emulator"` branch; composes with `"display"` via the existing
  `[...new Set([...])]` union.
* **Force the whole run serial when any native app context is present.** Rejected: collapses all
  parallelism (HTTP/shell/browser jobs too), the exact regression ADR 01001 was written to avoid.
* **Per-context private Appium server for native app surfaces.** Rejected as out of scope: a larger
  change to the driver-server lifecycle; the scheduler-level bound is minimal and sufficient. A
  counted semaphore (>1 concurrent native app driver on beefier hosts) is possible future work, the
  same way it is for `"android-emulator"`.

## Decision Outcome

Chosen option: **a new `"native-app-driver"` exclusive resource**.

`jobDisplayResources` now tags a job with `"native-app-driver"` under three conditions. The context
(a) sits on a non-android native app-driver platform (`mac` / `windows` / `ios`, through
`NATIVE_APP_DRIVER_PLATFORMS`), (b) will actually boot the shared per-host driver, and (c) clears
`mobileBrowserGate`. The "will actually boot" test is **platform-specific**:

* **`mac` and `windows`** require `isAppDriverRequired`, meaning a native app step. A plain desktop
  firefox or chrome browser context takes **nothing**, and keeps running in parallel.
* **`ios`** takes **any** context, app *or* mobile-web Safari. Both boot the single per-host iOS
  simulator and WebDriverAgent, and clobber each other. So an iOS browser context takes the resource
  even though `isAppDriverRequired` is false.

The resource composes with `"android-emulator"`, never both since android is excluded, and with
`"display"` through the existing set-union. A native app context in a recording run then holds
`["native-app-driver", "display"]`. Android emulator contexts stay exempt from the display promotion,
as before. At `concurrentRunners: 1` the code path is unchanged.

### Consequences

* Good: `concurrentRunners > 1` is now safe with native macOS and Windows app surfaces, AND with
  iOS-simulator contexts, native app or mobile-web. Two such contexts queue on the shared driver
  instead of crashing it. Disjoint jobs (HTTP, shell, **desktop** browser) still run in parallel.
* Good: The change is one platform-aware predicate and one resource name, entirely inside the
  existing scheduler contract; nothing downstream reads the new name specially.
* Neutral: iOS mobile-web contexts on one host now run one-at-a-time alongside iOS app contexts.
  They genuinely share the simulator, so this is physical reality, not over-serialization. Desktop
  browser contexts are unaffected.
* Neutral: Native driver contexts on one host now run one-at-a-time. That matches physical reality
  (one shared driver stack) and is no slower than the previously-required `concurrentRunners: 1`
  workaround.
* Neutral, and future work: the bound is one-at-a-time, exclusive, rather than a counted semaphore.
  A host that could support N parallel native drivers still runs them serially. That's the same
  limitation `"android-emulator"` carries.

### Confirmation

* Unit tests in `test/concurrency.test.js` check `jobDisplayResources`. It returns
  `["native-app-driver"]` for a non-android native app context (mac / windows / ios), **and** for an
  iOS mobile-web (Safari) context. It returns
  `["android-emulator"]`, not the new resource, for an android app context. It returns `[]` for a
  non-app (HTTP/shell) context, a browser-only context, and a **desktop (mac) browser** context,
  proving desktop browsers still parallelize. It also returns `[]` for a mixed app plus web mobile
  (gate-SKIP) context. It returns
  `["native-app-driver", "display"]` when a shared-display recording is present. A `runResourceAware`
  test confirms two `"native-app-driver"` jobs never overlap while a disjoint job does. These tests
  were written first (red → green).
* End-to-end: the `apps`, `apps-ios`, and `mobile-web-ios` macOS fixtures jobs run at
  `concurrentRunners: 2`, in PR #532, which depends on this change. Each exercises two concurrent
  same-host native driver or iOS-simulator contexts. Each must reach PASS or SKIPPED, instead of the
  session-clobber FAIL those three jobs hit without this fix.

## Pros and Cons of the Options

### A new `"native-app-driver"` exclusive resource (chosen)

* Good: it's minimal, reusing ADR 01001's resource-aware scheduler and ADR 01025's gating discipline.
* Good: composes cleanly with `"display"` and excludes already-bounded android.
* Good: keeps all non-native-app parallelism intact.
* Neutral: exclusive (one-at-a-time) rather than a counted semaphore.

### Force the whole run serial when a native app context is present

* Good: trivially correct.
* Bad: it destroys parallelism for every unrelated job, the regression ADR 01001 exists to prevent.

### Per-context private Appium server for native app surfaces

* Good: would allow real parallel native app drivers.
* Bad: large change to driver-server lifecycle and resource use; far more than the crash requires.
