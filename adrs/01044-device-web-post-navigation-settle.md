---
status: accepted
date: 2026-07-08
decision-makers: doc-detective maintainers
---

# Bounded post-navigation settle for device (iOS/Android) web contexts

## Context and Problem Statement

On the iOS simulator, a `find` step issued immediately after a successful `goTo` occasionally FAILs
with "No elements matched selector or text" even though the page loaded correctly — the very next
context that navigates to the same URL finds its element fine. The failure is transient, the
page/server is healthy, and it is **not** a concurrency bug: it reproduces on one simulator with
sequential sessions (the `native-app-driver` serialization of ADR 01038 already holds). It is
single-session, post-navigation timing noise.

The root cause is two **separate query paths** that `goTo` and `find` walk:

- `goTo`'s readiness gate ([src/core/tests/goTo.ts](../src/core/tests/goTo.ts), lines ~190–345) gates
  on `document.readyState === "complete"` plus network-idle and DOM-stable, all evaluated through the
  **JS bridge** via `driver.execute()`.
- The first `find` after `goTo` (`findElementByShorthand` →
  `waitForExist({ timeout: 5000 })` in [src/core/tests/findStrategies.ts](../src/core/tests/findStrategies.ts))
  walks the **WebDriver element tree** — the remote-debugger DOM, a different query path.

On a **freshly-built WebDriverAgent** under macOS-runner load, an iOS Safari (XCUITest web) context can
momentarily hand back an **empty element tree** to WebDriver right after navigation while `readyState`
already reports `complete`. `goTo` returns PASS (its JS-bridge gate is satisfied), then `find` races an
element tree that is briefly empty and can spuriously miss before it re-populates.

`goTo`'s existing gate cannot see this: it never queries the element tree. The fix must not weaken that
gate, must not mask a genuinely-absent element, and — critically — must leave **desktop** (mac/windows/
linux browser) and **all app** contexts byte-identical, since they don't exhibit the split-path race and
must take on no added latency or changed control flow.

## Decision Drivers

- Eliminate the intermittent first-`find`-after-`goTo` miss on device web contexts.
- **Desktop and app contexts must be byte-identical** — no added latency, no changed control flow.
- Must not weaken `goTo`'s existing readiness gate.
- Must not mask a real "element genuinely absent" failure — `find`'s own 5s wait stays the authority.
- Prefer the smallest effective mechanism and reuse existing wait helpers; no fixed sleeps.

## Considered Options

1. **A bounded, device-web-only post-navigation settle in `goTo`** (chosen): after the existing
   readiness gate passes, for device web contexts only, bound-wait (via the driver's own `waitUntil`)
   until the element tree is queryable, returning as soon as satisfied, with a low ceiling.
2. **Retry/settle inside `find`.** Rejected: `find` is walked by every platform, so any change there
   risks altering desktop behavior, and it conflates "navigation just happened" timing with the generic
   find path.
3. **A fixed post-navigation sleep on device.** Rejected: adds unconditional latency, is either too
   short (still races) or too long (slows every device navigation), and is not adaptive.
4. **Strengthen the readiness gate to also probe the element tree for everyone.** Rejected: changes
   desktop control flow and latency for a device-only problem, violating the byte-identical constraint.

## Decision Outcome

Chosen option: **option 1 — a bounded, device-web-only post-navigation settle in `goTo`.**

After the existing readiness gate's parallel checks succeed (and only then), `goTo` checks
`isDeviceWebContext(driver)` and, if true, runs a single `driver.waitUntil` that polls `driver.$$("body *")`
until the element tree is non-empty, with a ceiling of `min(3000ms, remaining goTo timeout)`. It returns
as soon as the tree is queryable — it is not a fixed sleep. The settle is **best-effort**: if the ceiling
elapses with the tree still empty, `goTo` proceeds to PASS anyway and hands control to `find`, which
retains its own 5s wait and remains the sole authority on a genuinely-absent element.

The gate is the pure helper `isDeviceWebContext(driver)` in
[src/core/utils.ts](../src/core/utils.ts):

```ts
function isDeviceWebContext(driver: any): boolean {
  if (!driver) return false;
  const isMobile = driver.isMobile === true;
  const browserName = driver.capabilities?.browserName;
  return isMobile && typeof browserName === "string" && browserName.length > 0;
}
```

- `driver.isMobile` is WebdriverIO's own device flag (true only when `platformName` is iOS/Android or
  Appium caps are present). **Desktop browser sessions have it falsy**, so `isDeviceWebContext` is
  `false` and desktop skips the settle entirely — byte-identical control flow, no added latency.
- `driver.capabilities.browserName` (Safari on iOS, Chrome on Android — see
  `buildMobileBrowserCapabilities` in [src/core/tests/mobileBrowser.ts](../src/core/tests/mobileBrowser.ts))
  distinguishes a mobile-**web** session from a native-app session (which has no `browserName`). A
  native-app context never reaches `goTo`, but gating on `browserName` keeps the predicate honest.

### Consequences

- Good: the intermittent iOS first-`find`-after-`goTo` miss is absorbed by a short, adaptive wait that
  returns the instant the tree is ready.
- Good: desktop and app paths are untouched — the settle body is only reached when
  `isDeviceWebContext` is `true`, which is impossible for desktop (`isMobile` falsy) and app (no
  `browserName`) contexts.
- Good: the readiness gate is unchanged and the settle never fails `goTo`, so real element-absent
  failures still surface through `find`.
- Neutral: device web navigations that momentarily have an empty tree pay up to 3s once; a healthy
  navigation pays only the poll interval (a few ms) because `waitUntil` returns on the first non-empty
  read.

### Confirmation

- Unit tests in [test/goTo-device-settle.test.js](../test/goTo-device-settle.test.js):
  - `isDeviceWebContext` is true for iOS Safari and Android Chrome drivers, and false for desktop
    browsers (with and without an `isMobile` field), native mobile-app drivers (no `browserName`), and
    null/undefined drivers.
  - An iOS web context whose element tree is briefly empty post-navigation runs the settle (a second
    `waitUntil`, re-polling the tree) and then PASSes.
  - A **desktop** web context runs exactly one `waitUntil` (the document-ready gate) and never polls the
    element tree — proving the desktop path is unchanged.
  - An iOS web context whose tree stays empty past the ceiling still PROCEEDS to PASS (the settle never
    fails `goTo`).
- The existing device web path is exercised end-to-end by the mobile-web iOS fixtures (Safari on the
  simulator), which run `goTo` followed by `find`; no new fixture is required to cover this reliability
  hardening (it changes timing, not the observable step contract).

## Pros and Cons of the Options

### Option 1 — bounded device-web-only settle in `goTo` (chosen)

- Good: scoped to exactly the contexts that exhibit the split-path race; desktop/app byte-identical.
- Good: adaptive (returns on first non-empty read), reuses `driver.waitUntil`, no fixed sleep.
- Good: best-effort — cannot mask a genuinely-absent element or fail a good navigation.
- Bad: adds a small, device-web-only code path in `goTo` to maintain.

### Option 2 — settle inside `find`

- Good: single choke point for all element lookups.
- Bad: `find` is walked by every platform, so any change risks altering desktop behavior and latency.
- Bad: conflates post-navigation timing with the generic find path; harder to gate to "just navigated".

### Option 3 — fixed post-navigation sleep on device

- Good: trivially simple.
- Bad: unconditional latency on every device navigation; either too short (still races) or too long.
- Bad: not adaptive — pays the full cost even when the tree is already ready.

### Option 4 — strengthen the readiness gate for everyone

- Good: one gate, no separate settle.
- Bad: changes desktop control flow and latency for a device-only problem — violates the
  byte-identical constraint.

## More Information

Sibling to the transient-startup-resilience decisions ADR 01033 (native-session retry), ADR 01039, and
ADR 01042 (retry geckodriver startup crash under concurrency). Those retry a failed session
*bring-up*; this one absorbs a post-navigation *element-tree* settle window on device web contexts. No
schema change: the settle is internal timing, not a new step field, config key, or CLI flag.
