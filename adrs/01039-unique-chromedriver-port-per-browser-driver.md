---
status: accepted
date: 2026-07-07
decision-makers: doc-detective maintainers
---

# Assign a unique chromedriver port per browser-driver session under concurrency

## Context and Problem Statement

Each concurrent runner gets its own Appium server on its own free port (`startAppiumServer` /
`createAppiumPool` in [src/core/tests.ts](../src/core/tests.ts)), so parallel contexts never share an
Appium instance. For a Chrome context, that Appium server loads `appium-chromium-driver`, which spawns
a **chromedriver** child and proxies WebDriver commands to it.

The capabilities `getDriverCapabilities` builds for Chrome
([src/core/tests.ts](../src/core/tests.ts)) set `appium:automationName: "Chromium"` and
`appium:executable` (the chromedriver binary), but **no chromedriver port**. When
`appium:chromedriverPort` is undefined, `appium-chromium-driver` passes `port: undefined` to
`appium-chromedriver`, which falls back to its fixed `DEFAULT_PORT = 9515`. So every concurrent Chrome
context's chromedriver tries to bind the **same** port. One binds; the other's chromedriver either
fails to bind or the two Appium servers proxy to whichever chromedriver won 9515 — and a command later
lands on the wrong / dead one.

At `concurrentRunners: 2` (PR #532), `fixtures / capture (windows-latest)` FAILed exactly this way,
mid-session rather than at session creation:

```text
goTo action timed out after 4245ms
✗ DOM stability timeout: WebDriverError: Could not proxy command to the remote server.
  Original error: connect ECONNREFUSED 127.0.0.1:9515 when running "execute/sync" with method "POST"
```

`9515` is chromedriver's default port. The same suite passes at `concurrentRunners: 1`, where only one
chromedriver ever exists, so the fixed port never collides.

Two properties were missing on the browser-driver path:

1. **A unique port per concurrent chromedriver.** Firefox is unaffected — `appium-geckodriver`
   auto-selects a free `systemPort` from a range (and errors only if none is free); Safari has no such
   port. Only the Chromium path pins the fixed default.
2. **The Appium path's ECONNREFUSED retry, applied to the browser rebind race.** `driverStart` already
   retries `isRetryableSessionError` failures (which include `ECONNREFUSED`), but on a *fixed* port a
   retry just re-races the same 9515; a retry only helps if it lands on a fresh port.

## Decision Drivers

- The `fixtures / capture` job runs under `concurrentRunners: 2`; this collision fails PR CI outright
  and is deterministic on Windows once two Chrome contexts overlap.
- The `concurrentRunners: 1` path (and every non-Chrome engine) must stay behavior-preserving — no
  spurious port churn where none is needed.
- Port assignment must be unit-testable without webdriverio, a driver, or a network (repo convention:
  small pure helpers).
- Reuse the existing retry machinery (`isRetryableSessionError`, `findFreePort`) rather than adding a
  parallel one.

## Considered Options

1. **Assign a unique free `appium:chromedriverPort` per Chromium session inside `driverStart`, with a
   fresh port per retry attempt**, via a pure `withChromedriverPort` helper.
2. Bake a free port into `getDriverCapabilities` at cap-build time (one port per context, not per
   attempt).
3. Serialize all Chrome contexts on a shared resource (like the native-app-driver bound in ADR 01038).
4. Do nothing runner-side; only cap `concurrentRunners: 1` for browser groups.

## Decision Outcome

Chosen option: **1**. A pure `withChromedriverPort(capabilities, port)` helper in
[src/core/tests.ts](../src/core/tests.ts) returns a copy with `appium:chromedriverPort` set **only**
when the caps are Chromium and no explicit port was supplied; every other engine's caps pass through
untouched. `driverStart` allocates a fresh `findFreePort()` for Chromium caps **on each attempt**
before calling `wdio.remote`, so a retryable `ECONNREFUSED` (the rebind race the Appium path already
retries) moves to a new free port instead of re-racing the same one. Nothing else about the retry loop
(attempt counts, linear backoff, ceiling derivation) changes, and non-Chromium sessions skip the
allocation entirely.

### Consequences

- Good: two concurrent Chrome contexts now bind distinct chromedriver ports, so the mid-session
  `ECONNREFUSED 127.0.0.1:9515` collision cannot occur. The observed `capture (windows-latest)` failure
  becomes a PASS at `concurrentRunners: 2`.
- Good: Firefox/Safari/native/mobile-web sessions are bit-for-bit unchanged — `withChromedriverPort`
  returns their caps object as-is and `driverStart` skips the port allocation for them.
- Neutral: a Chrome session at `concurrentRunners: 1` now binds a specific free chromedriver port
  instead of the default 9515. This is behavior-preserving (chromedriver works identically on any free
  port); the wire caps gain one field. It is the minimal change that makes the port unique, and it is
  by definition not byte-identical for Chrome — that is the fix.
- Neutral: an explicit `appium:chromedriverPort` (a caller pinning a port) is preserved, not
  overridden.

### Confirmation

- Unit: `withChromedriverPort` and `getDriverCapabilities` cases in
  [test/context-resolution.test.js](../test/context-resolution.test.js) — Chrome caps carry no fixed
  port; the helper assigns a port for Chromium, returns a copy, does not override an explicit port,
  leaves non-Chromium caps untouched, and two concurrent allocations yield distinct ports.
- Unit: `isRetryableSessionError` cases in
  [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js) — the exact CI failure
  string (`Could not proxy command … ECONNREFUSED 127.0.0.1:9515 … execute/sync`) and a bare
  `ECONNREFUSED …:9515` are retryable, confirming the browser driver gets the Appium path's resilience.
- End-to-end: the `fixtures / capture` job under `concurrentRunners: 2` — two Chrome contexts complete
  instead of one FAILing with a 9515 proxy error.

## Pros and Cons of the Options

### Option 1: unique free chromedriver port per Chromium session, fresh per attempt (chosen)

- Good: targets exactly the sessions that collide (Chromium); zero behavior change for every other
  engine and for the single-runner path beyond the added port field.
- Good: pure, unit-testable helper; `driverStart` stays boring and reuses `findFreePort` +
  `isRetryableSessionError`.
- Good: fresh port per attempt makes the existing ECONNREFUSED retry actually resolve the rebind race
  instead of re-racing a fixed port.
- Bad: one extra ephemeral bind/close (`findFreePort`) per Chromium attempt — negligible.

### Option 2: bake a free port into `getDriverCapabilities`

- Good: one place to change.
- Bad: `getDriverCapabilities` is synchronous and pure; `findFreePort` is async — it would have to
  become async or take an injected port at all four call sites. And a per-context (not per-attempt)
  port means a retry re-uses a port that may have just been grabbed in the rebind window, losing the
  retry's benefit.

### Option 3: serialize Chrome contexts on a shared resource

- Good: no port handling.
- Bad: collapses browser concurrency to one at a time — the opposite of the `concurrentRunners` goal —
  to work around a problem a unique port solves outright.

### Option 4: cap browser groups at `concurrentRunners: 1`

- Good: no code change.
- Bad: permanently forfeits parallel browser execution to dodge a one-line-root-cause bug; leaves the
  runner unable to ever run two Chrome contexts safely.
