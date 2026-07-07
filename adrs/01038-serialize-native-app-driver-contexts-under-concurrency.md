---
status: accepted
date: 2026-07-07
decision-makers: doc-detective maintainers
---

# Serialize native app-surface driver contexts under concurrency

## Context and Problem Statement

ADR 01001 introduced the resource-aware concurrency scheduler: each context job may declare a set of
exclusive resource names, and two jobs sharing a resource never run concurrently while everything
else stays parallel. ADR 01025 extended that pattern for Android — each managed emulator is
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

The `apps-ios` and `mobile-web-ios` failures are decisive on the iOS point: **both** kinds of iOS
context — native app (xcuitest) **and** mobile-web (Safari on the sim) — contend on the *same*
per-host iOS simulator + WebDriverAgent, so two of *either* clobber each other. (The
`mobile-web-ios` job passes on Windows, where iOS contexts SKIP — confirming it's per-host simulator
contention, not an unrelated element-matching bug.)

At `concurrentRunners: 1` the same fixtures pass, confirming the crash is concurrency-induced. In
`jobDisplayResources` (`src/core/tests.ts`), a native desktop/iOS driver context took **no**
exclusive resource unless the run also had a shared-display recording, so nothing serialized them.

## Decision Drivers

* **Reuse the ADR 01001 seam.** The scheduler already serializes on named resources; the fix should
  be one more resource name, not new machinery — exactly how ADR 01025 added `"android-emulator"`.
* **Only serialize contexts that actually boot the shared per-host driver.** On macOS/Windows that
  means a native-**app** context (a plain desktop firefox/chrome browser uses its own browser session
  and must still parallelize). On **iOS** it means *any* context that boots the simulator — native
  app **or** mobile-web Safari — since they share one simulator + WDA. A context that
  deterministically SKIPs or FAILs (wrong platform, mixed native-app+browser on mobile, unsupported)
  boots nothing and must take nothing — the same gating discipline as the existing `attemptsEmulator`
  branch.
* **Don't double-bound Android.** Android already serializes on `"android-emulator"`; the new
  resource is for non-android native app surfaces only.
* **Compose, don't collide.** A job may already hold `"display"` (recording) — the new resource must
  union with it, not replace it.
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

`jobDisplayResources` now tags a job with `"native-app-driver"` when the context (a) sits on a
non-android native app-driver platform (`mac` / `windows` / `ios`, via `NATIVE_APP_DRIVER_PLATFORMS`),
(b) will actually boot the shared per-host driver, and (c) clears `mobileBrowserGate`. The
"will actually boot" test is **platform-specific**:

* **`mac` / `windows`** — requires `isAppDriverRequired` (a native app step). A plain desktop
  firefox/chrome browser context takes **nothing** and keeps running in parallel.
* **`ios`** — **any** context (app *or* mobile-web Safari), because both boot the single per-host iOS
  simulator + WebDriverAgent and clobber each other. So an iOS browser context takes the resource
  even though `isAppDriverRequired` is false.

The resource composes with `"android-emulator"` (never both — android is excluded) and with
`"display"` through the existing set-union, so a native app context in a recording run holds
`["native-app-driver", "display"]`. Android emulator contexts stay exempt from the display promotion,
as before. At `concurrentRunners: 1` the code path is unchanged.

### Consequences

* Good: `concurrentRunners > 1` is now safe with native macOS/Windows app surfaces AND iOS-simulator
  contexts (native app or mobile-web) — two such contexts queue on the shared driver instead of
  crashing it. Disjoint jobs (HTTP, shell, **desktop** browser) still run in parallel.
* Good: The change is one platform-aware predicate and one resource name, entirely inside the
  existing scheduler contract; nothing downstream reads the new name specially.
* Neutral: iOS mobile-web contexts on one host now run one-at-a-time alongside iOS app contexts —
  they genuinely share the simulator, so this is physical reality, not over-serialization. Desktop
  browser contexts are unaffected.
* Neutral: Native driver contexts on one host now run one-at-a-time. That matches physical reality
  (one shared driver stack) and is no slower than the previously-required `concurrentRunners: 1`
  workaround.
* Neutral / future work: the bound is one-at-a-time (exclusive), not a counted semaphore, so a host
  that could support N parallel native drivers still runs them serially — the same limitation
  `"android-emulator"` carries.

### Confirmation

* Unit tests in `test/concurrency.test.js`: `jobDisplayResources` returns `["native-app-driver"]` for
  a non-android native app context (mac / windows / ios) **and** for an iOS mobile-web (Safari)
  context, `["android-emulator"]` (not the new resource) for an android app context, and `[]` for a
  non-app (HTTP/shell) context, a browser-only context, a **desktop (mac) browser** context (proving
  desktop browsers still parallelize), and a mixed app+web mobile (gate-SKIP) context; it returns
  `["native-app-driver", "display"]` when a shared-display recording is present. A `runResourceAware`
  test confirms two `"native-app-driver"` jobs never overlap while a disjoint job does. These tests
  were written first (red → green).
* End-to-end: the `apps`, `apps-ios`, and `mobile-web-ios` macOS fixtures jobs at
  `concurrentRunners: 2` (PR #532, which depends on this change) each exercise two concurrent
  same-host native driver / iOS-simulator contexts and must reach PASS/SKIPPED instead of the
  session-clobber FAIL those three jobs hit without this fix.

## Pros and Cons of the Options

### A new `"native-app-driver"` exclusive resource (chosen)

* Good: minimal — reuses ADR 01001's resource-aware scheduler and ADR 01025's gating discipline.
* Good: composes cleanly with `"display"` and excludes already-bounded android.
* Good: keeps all non-native-app parallelism intact.
* Neutral: exclusive (one-at-a-time) rather than a counted semaphore.

### Force the whole run serial when a native app context is present

* Good: trivially correct.
* Bad: destroys parallelism for every unrelated job — the regression ADR 01001 exists to prevent.

### Per-context private Appium server for native app surfaces

* Good: would allow real parallel native app drivers.
* Bad: large change to driver-server lifecycle and resource use; far more than the crash requires.
