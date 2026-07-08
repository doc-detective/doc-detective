---
status: accepted
date: 2026-07-07
decision-makers: doc-detective maintainers
---

# Retry a geckodriver startup crash under concurrent browser context-starts

## Context and Problem Statement

Each concurrent runner gets its own Appium server on its own free port
(`createAppiumPool` in [src/core/tests.ts](../src/core/tests.ts)), and for a Firefox context that
Appium server loads `appium-geckodriver`, which spawns a **geckodriver** child and proxies WebDriver
commands to it. A `startSurface` step can also open several browser surfaces **in parallel** within a
single test (Phase 6, PR #539): the array lanes are gathered with `Promise.allSettled`, so two Firefox
sessions in one test open at once, on top of the context's default Firefox session — up to three
concurrent geckodriver spawns on one runner.

At `concurrentRunners: 2` (PR #532), the sessions group runs two specs at once, compounding with this
spec's own parallel opens — up to ~4 concurrent geckodriver spawns on a 2-core runner. The
`fixtures / sessions (ubuntu-latest)` job then FAILed on the new `start-surface-parallel` fixture:

```text
beta (browser): PASS — Opened browser surface "beta" (firefox).
alpha (browser): FAIL — Couldn't open browser surface "alpha" (firefox). Failed to start context 'firefox' on 'linux'.
```

The runner's fixture JSON swallows the underlying driver error; the raw CI log shows it:

```text
ERROR webdriver: WebDriverError: 'GET /session/54907282-…/window' cannot be proxied to Gecko
Driver server because its process is not running (probably crashed). Check the Appium log for more
details when running "window" with method "GET"
```

The `POST /session` succeeded (the message carries a session id), then the immediately-following window
command — issued by webdriverio's `remote()` during session bring-up, so it is inside `driverStart`'s
`wdio.remote(...)` call — found the geckodriver child already dead. This is the **Firefox analog of the
ChromeDriver "crashed during startup" race**: several browsers launching at once briefly starve a
2-core runner and one driver child dies right after its session is created.

`driverStart` in [src/core/tests.ts](../src/core/tests.ts) already retries transient
session-creation failures with linear backoff — but only those enumerated by `isRetryableSessionError`
in [src/core/utils.ts](../src/core/utils.ts). Its `TRANSIENT_SESSION_ERROR` pattern was
ChromeDriver-centric (`crashed during startup`, `DevToolsActivePort`, `could not proxy command`, …) and
did **not** match geckodriver's crash phrasing (`cannot be proxied to Gecko Driver server because its
process is not running`). So the Gecko crash propagated immediately, with no retry. The
`startDriverForBrowser` headed→headless fallback doesn't help either: these surfaces declare
`headless: true`, so `wantHeadless` is already true and it fails fast rather than re-attempting.

The suite passes at `concurrentRunners: 1`, where fewer geckodrivers ever coexist and the startup race
does not manifest — confirming this is a transient concurrency-startup race, not a `#539`-intrinsic
flake nor a hard resource cap.

## Decision Drivers

- The `fixtures / sessions` job runs under `concurrentRunners: 2` (PR #532); this crash fails PR CI on
  a legitimate, supported feature (parallel `startSurface`).
- The fix should mirror the ChromeDriver concurrency-startup fix (ADR 01039): **reuse the existing
  retry machinery** (`isRetryableSessionError` + `driverStart`'s bounded backoff loop) rather than add
  a parallel one.
- The `concurrentRunners: 1` path and every non-crash start must stay behavior-preserving — a start
  that succeeds on the first attempt never touches the retry path.
- The classifier must stay unit-testable without webdriverio, a driver, or a network (repo convention:
  small pure helpers).

## Considered Options

1. **Add geckodriver's startup-crash phrasing to `TRANSIENT_SESSION_ERROR`** so `driverStart`'s
   existing bounded retry loop absorbs it — the direct analog of the ChromeDriver strings already there.
2. Add a Firefox-specific retry wrapper around the browser-surface open path, separate from
   `driverStart`.
3. Serialize all Firefox context-starts on a shared "browser-start" mutex.
4. Cap the sessions group (or browser groups) at `concurrentRunners: 1`.

## Decision Outcome

Chosen option: **1**. `TRANSIENT_SESSION_ERROR` gains one alternative,
`cannot be proxied to Gecko Driver server`, so `isRetryableSessionError` classifies the geckodriver
startup crash as retryable exactly as it already does the ChromeDriver equivalents. Nothing else about
`driverStart` (attempt count, linear backoff, ceiling derivation) changes: the same loop that retries a
ChromeDriver `crashed during startup` now retries a geckodriver "probably crashed", and the contention
clears on a subsequent attempt. The added pattern matches only the geckodriver crash phrase, so no
other engine's or non-crash path's classification changes.

### Consequences

- Good: a geckodriver child that crashes during concurrent startup is retried with backoff instead of
  failing the context; the observed `sessions (ubuntu-latest)` failure becomes a PASS at
  `concurrentRunners: 2`.
- Good: reuses the ADR 01039 machinery end-to-end — one regex alternative, zero new control flow.
- Neutral: a genuinely broken geckodriver (e.g. a real crash on every attempt) now costs a few extra
  bounded, backed-off attempts before it surfaces the same failure — the same trade `driverStart`
  already makes for every ChromeDriver transient.
- Neutral: `concurrentRunners: 1` and any start that succeeds first try are byte-for-byte unchanged —
  they never enter the retry branch.

### Confirmation

- Unit: `isRetryableSessionError` cases in
  [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js) — the exact CI failure string
  (`'GET /session/…/window' cannot be proxied to Gecko Driver server … (probably crashed)`) and a bare
  `cannot be proxied to Gecko Driver server … (probably crashed)` are retryable at every ceiling,
  confirming the Firefox browser driver now gets the same resilience as the Chrome path; the existing
  "treats anything else as a real session-creation failure" cases confirm no over-broadening.
- End-to-end: the `fixtures / sessions` job under `concurrentRunners: 2` (PR #532) — the
  `start-surface-parallel` two-firefox spec completes instead of FAILing on a geckodriver crash.

## Pros and Cons of the Options

### Option 1: add the geckodriver crash phrase to `TRANSIENT_SESSION_ERROR` (chosen)

- Good: exact analog of the ChromeDriver strings already in the pattern; reuses `driverStart`'s bounded
  retry with zero new control flow.
- Good: pure, unit-testable classifier change; the retry loop stays boring.
- Good: matches only the geckodriver crash phrase, so single-runner and non-crash paths are unchanged.
- Bad: a permanently broken geckodriver pays a few extra backed-off attempts — the same trade already
  accepted for ChromeDriver.

### Option 2: a Firefox-specific retry wrapper on the surface-open path

- Good: co-located with the parallel-open feature.
- Bad: duplicates the retry/backoff logic `driverStart` already owns; two retry mechanisms to keep in
  sync, and it wouldn't cover the default (non-`startSurface`) Firefox context-start that hits the same
  race.

### Option 3: serialize Firefox context-starts on a shared mutex

- Good: no error-string handling.
- Bad: collapses browser-start concurrency to one at a time — the opposite of the `concurrentRunners`
  goal — to work around a race a bounded retry absorbs outright.

### Option 4: cap browser groups at `concurrentRunners: 1`

- Good: no code change.
- Bad: permanently forfeits the parallel execution the fixtures exist to validate, to dodge a transient
  startup race with a one-alternative root cause.
