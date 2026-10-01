---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Retry a timed-out session POST when the session declared a slow-startup ceiling

## Context and Problem Statement

`driverStart` ([src/core/tests.ts](../src/core/tests.ts)) creates every WebDriver session through
`wdio.remote()`, whose `connectionRetryTimeout` bounds the `POST /session` HTTP request. Since
phase A4, native sessions derive that bound from the slow-startup capabilities they declare. Those
are `appium:wdaLaunchTimeout`, `appium:wdaConnectionTimeout`, and `appium:serverStartupTimeout`,
feeding the `startupCeiling` with a 2-minute floor. The first XCUITest session on a cold host
compiles WebDriverAgent through `xcodebuild`, routinely 10–25 minutes on a hosted macOS runner.

Even with a 15-minute ceiling (`startSurface.timeout: 900000` in the iOS fixtures), CI showed the
build losing the race. In run 28808626492, `fixtures / apps-ios (macos-latest)` restored the WDA
build cache (`dd-wda-v1-darwin-Xcode-16.4`). Yet the first session's `POST /session` aborted after
the full 900 s. The message: "The operation was aborted due to timeout when running
"http://127.0.0.1:49216/session" with method "POST"". The restored cache was stale. Its key
carries only OS and Xcode version, while the JIT-installed `appium-xcuitest-driver`, and with it the
WDA source, had moved on. So `xcodebuild` did a near-full rebuild.

The decisive observation: **the very next spec in the same job created its session quickly.** The
client abort does not stop the server-side `xcodebuild`. The build completes regardless, and a
fresh `POST /session` then binds in seconds. But `driverStart` classified the abort as fatal. Its
transient-error list (`ECONNREFUSED`, `socket hang up`, "session not created", …) predates native
sessions, and does not include the wdio timeout abort. So the spec FAILed after 15 minutes of
mostly-successful work.

## Decision Drivers

- The `apps-ios (macos-latest)` fixture leg gates on ≥1 PASS (`DD_FIXTURES_REQUIRE_PASS=1`), so
  this flake fails PR CI outright; it repeatedly hit PR #517.
- A retry after the abort is near-free. The WDA build the first attempt paid for is finished, or
  nearly finished, when the second attempt starts.
- Browser, Windows, and Android sessions must keep today's fail-fast behavior. They declare no
  slow-startup capabilities, and for them a 2-minute `POST /session` means something is genuinely
  wrong. Retrying would double the hang on a dead server.
- Classification logic must be unit-testable without a driver or network (repo convention: pure
  helpers in [src/core/utils.ts](../src/core/utils.ts)).

## Considered Options

1. **Classify the timeout abort as retryable only when a slow-startup ceiling was declared**
   (`startupCeiling > 120000`), via a pure helper.
2. Add "aborted due to timeout" to the transient list unconditionally.
3. Raise the fixture timeouts further (e.g. `startSurface.timeout: 1500000`).
4. Do nothing runner-side; fix only the WDA cache key in doc-detective/github-action.

## Decision Outcome

Chosen option: **1**. `isRetryableSessionError(message, startupCeiling)` lives in
[src/core/utils.ts](../src/core/utils.ts). It returns true for the pre-existing transient patterns at
any ceiling. It also returns true for the wdio timeout abort (`/aborted due to timeout/i`) when the
session declared a ceiling above the 2-minute default. `driverStart` delegates its retry decision
to the helper; nothing else about the retry loop (attempt counts, linear backoff, ceiling
derivation) changes. App-surface and mobile-web callers already pass `maxAttempts: 2`, so the
worst case for a native session is two ceiling-length attempts.

### Consequences

- Good: a stale-cache or cold WDA build that outruns one ceiling no longer fails the spec. The
  second attempt binds against the completed build, and the observed CI failure mode becomes a PASS.
- Good: browser/Windows/Android sessions are bit-for-bit unchanged (no slow-startup caps → ceiling
  stays at the 120000 floor → timeout aborts still propagate immediately).
- Bad: a genuinely hung native server now takes up to 2× the ceiling to surface, plus the second
  spec's budget. That's 30 min at the fixtures' 900 s. The `apps-ios` and `mobile-web-ios` fixture
  jobs' `timeout-minutes` rises 45 → 55 to keep headroom.
- Neutral: the companion fix is a driver-version-aware WDA cache key in doc-detective/github-action.
  It removes the main *cause* of >15-minute builds, and this decision removes the *sensitivity* to
  them.

### Confirmation

- Unit: `isRetryableSessionError` cases live in
  [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js). A timeout abort is
  retryable at ceiling > 120000, and fatal at the default ceiling. Transient patterns are unchanged,
  and other errors stay fatal.
- End-to-end: the `fixtures / apps-ios (macos-latest)` job. On a stale-cache run the log shows one
  abort followed by a successful session bind, instead of a spec FAIL.

## Pros and Cons of the Options

### Option 1: ceiling-gated retryability (chosen)

- Good: targets exactly the sessions where the abort is known-recoverable; zero behavior change
  elsewhere.
- Good: pure, unit-testable classification; `driverStart` stays boring.
- Bad: doubles worst-case wall clock for genuinely hung native servers (bounded by
  `maxAttempts: 2`).

### Option 2: unconditionally retryable timeout abort

- Good: one-line change.
- Bad: a dead Appium or Chromedriver behind a browser session would hang 4 × 2 minutes instead of 2.
  That's across every session `driverStart` creates, a regression for the overwhelmingly common path.

### Option 3: raise fixture timeouts further

- Good: no code change.
- Bad: it pays the full worst case, 25 min, on every stale-cache run *serially before any retry*. It
  still fails when a build exceeds the new number, and job budgets balloon for everyone.

### Option 4: cache-key fix only

- Good: removes the dominant cause (stale WDA cache never refreshing).
- Bad: it leaves the runner brittle to every other source of slow first builds. Those are new Xcode
  images, cache evictions, and cold keys after a `CACHE_VERSION` bump, all of which recur naturally.
