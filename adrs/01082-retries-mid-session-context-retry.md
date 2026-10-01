---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# `retries`: retry a whole context on a fresh session when the session dies or the page breaks mid-run

## Context and Problem Statement

On constrained CI runners, notably `windows-latest`, a browser or app session intermittently **dies
mid-run**. An early step (`goTo`) passes, reporting "all wait conditions met". A later step then
fails because the session or DOM is gone. That shows up as `WebDriverError: ECONNREFUSED`, an
`invalid session id`, or an element that can't be found because the context is dead. This is the
same root cause behind three separate flakes. Those are the recording `annotate` legs, the
`getRunner` unit tests, and `android-skip` element lookups.

Two prior mitigations don't fix the class:

- **Fixture-level `find` guards plus long timeouts**
  ([`test/core-artifacts/recording/annotate.spec.json`], PR #677). No timeout finds an element in a
  *dead* DOM.
- **Mocha `this.retries(2)`** (PR #678). It heals a *unit test*. But fixtures run through the GitHub
  Action and results gate, not mocha, and it does nothing for real users.

`driverStart` already retries session *creation* (4 attempts, ADR 01039) but nothing covers a session that
dies *after the first step*. How do we make the runner tolerant of a mid-run session death without masking
a legitimate test failure?

## Decision Drivers

* Fix the class for CI fixtures **and** real users, in the runner rather than a test framework.
* Never mask a *deterministic* failure. A real bug must still FAIL after retries are exhausted.
* Pool-safe under `concurrentRunners`. A retry must not starve the Appium pool, or re-contend on
  exclusive resources such as display, native-app-driver, or android-emulator.
* Default-on (resilience), configurable and fully disable-able.
* Minimal risk to `runContext`, the largest and most critical function in the runner.

## Considered Options

* **A. Re-invoke `runContext` on a probe-confirmed dead session, bounded by a `retries` policy** (chosen).
* **B. In-place retry surgery inside `runContext`'s step loop** (reuse the held session/port).
* **C. Detect via `resultDescription` string-matching only (no active probe).**
* **D. Do nothing in the runner; keep rerunning flaky CI jobs by hand.**

## Decision Outcome

Chosen: **A**. A new **`retries`** policy (config + context, default **1**, `0` disables), resolved by
`resolveRetryPolicy` (context overrides config, via `??` so an explicit `0` is preserved). Behavior:

1. **Detection: an active probe, in two modes.** A bad-session step FAIL is indistinguishable at the
   result level from a real assertion FAIL, since handlers catch driver errors and return FAIL. The
   headline symptom, a `find` timing out, carries no session-error string, so string-matching is
   insufficient. After the step loop, if any step FAILed, `runContext` probes **while the session is
   still registered, before teardown**. It sets a non-enumerable `_sessionDied` hint on the FAIL
   report when either mode fires:
   - **Dead session.** `isSessionAlive` runs a session-scoped, driver-agnostic command. That's
     `getPageSource`, valid for browser, webview, and native. It is **not** `status`, which queries
     the Appium *server*. A classified throw means the session is gone. `isRetryableSessionError` is
     widened with `invalid session id`, `no such session`, `chrome not reachable`, and `session
     deleted because of page crash`.
   - **Alive but broken page.** If the session responds, `isPageBroken` checks the current URL. An
     unambiguous browser **error page** means the page under test is gone, so it retries. Those are
     `chrome-error://chromewebdata/` on a renderer crash, and `about:neterror` or `about:certerror`
     on Firefox. Only error pages count. `about:blank` is **not** treated as broken, so a genuine
     "element not on a correctly-loaded page" failure still FAILs. A URL-match against the last
     `goTo` was rejected, because `driver.state.url` isn't maintained per navigation, so it isn't a
     reliable expected URL.
2. **Retry by re-invoking, not in place.** `runContextWithRetries` wraps the `runContext` call at
   both job sites (`runJob`, `runRoutedJob`). On a `FAIL` report carrying `_sessionDied`, within
   budget, it re-invokes `runContext`. That re-runs setup, re-provisions every session, and restarts
   recordings cleanly. The job keeps its concurrency slot and any exclusive resource. Only the Appium
   **pool port** churns (acquire→release→acquire). Two context fields are snapshotted and restored
   before each attempt, because `runContext` mutates them non-idempotently. Those are `openApi`,
   which appends, and `browser`, which narrows on fallback, plus `__display` and `__displaySize`.
3. **Bounds and safety.** A live-session FAIL, where the probe succeeds, is **never** retried, so a
   deterministic bug fails all attempts. It's bounded by `retries`, and linear backoff
   (`500 * attempt`) mirrors `driverStart`.

### Consequences

* Good: it eliminates the **dead-session** mid-run flake mode, the `getRunner` `ECONNREFUSED` case.
  It **also** eliminates the **broken-page-via-error-page** mode, a renderer crash that navigates to
  `chrome-error://`, for fixtures and real users. A single opt-out (`retries: 0`) restores
  byte-identical single-attempt behavior.
* Good: re-invoking reuses the entire existing setup, teardown, and recording path. So multi-surface,
  app, mobile, and recording contexts retry correctly, with no deep surgery in `runContext`'s step
  loop.
* Good: the active probe means retries can never hide a real assertion failure.
* Neutral: the pool port churns on a retry (release→re-acquire). That's safe under concurrency, since
  progress is guaranteed, and it's a negligible cost paid only on the failure path.
* Bad/limit: one alive-but-broken-page sub-case remains uncovered. That's a page that **blanks at the
  same URL**, where the session responds, the URL is unchanged, and the DOM is emptied. It's
  ambiguous with a genuine "element not on a correctly-loaded page" failure, so it is treated as a
  real FAIL and not retried. CI in PR #680 showed the `windows-latest` recording `annotate` flake is
  the alive-but-broken-page mode, since its `find` times out while `getPageSource` still succeeds.
  The error-page detection now covers the renderer-crash variant of it. A **debug diagnostic** logs
  the URL of any live, non-error-page FAIL that isn't retried. So if the recording flake turns out to
  be the same-URL-blank variant, the logs will reveal it for a follow-up heuristic. The three flakes
  split into two modes, dead-session and alive-but-broken-page, rather than one root cause as first
  framed.
* Bad/limit: the probe adds one `getPageSource` round-trip on any failing context (failure path only).

### Confirmation

Red→green unit tests live in `test/core-utils-coverage.test.js`. They cover three helpers:

- `isRetryableSessionError` mid-run markers.
- `isSessionAlive`: probe resolves → alive; classified session-death throw → dead; non-session
  throw → alive; wedged/timeout → alive; null driver → dead.
- `isPageBroken`: browser error page → broken; normal page and `about:blank` → not broken;
  no-`getUrl`/throwing driver → not broken.

`test/browser-fallback.test.js` covers `resolveRetryPolicy`, for context-over-config, a default of
1, and **explicit 0 preserved**. It also covers `runContextWithRetries`:

- retry-on-dead-session → PASS;
- **no retry on a live-session FAIL**;
- budget exhaustion;
- `retries: 0` disables;
- **non-idempotent context fields restored** before each retry.

`src/common/test/validate.test.js` covers `config_v3`
positive/negative/default `retries` cases. The feature fixture
`test/core-artifacts/navigation/context-retries.spec.json` proves the context-level `retries` field
is accepted end-to-end, and is a green-path no-op. A fixture can't deterministically kill a live
session, so the retry control flow is asserted programmatically, per `CLAUDE.md`'s documented
exception.

## Pros and Cons of the Options

### A. Re-invoke on a probe-confirmed dead session
* Good: reuses the full setup/teardown/recording path; no deep surgery; probe prevents masking real bugs.
* Bad: pool port churns on retry; re-invoke re-runs setup (slower than reusing the session).

### B. In-place retry surgery inside the step loop
* Good: reuses the held session/port (no churn).
* Bad: very high risk in the 1300-line `runContext`. It must hand-manage the multi-surface
  `browserSessions` registry, app sessions, recordings, and all mutable state. That's a large,
  hard-to-verify diff in the most critical function.

### C. String-match detection only
* Good: no extra round-trip.
* Bad: it misses the headline symptom, since a dead-DOM `find` timeout has no session-error string.
  So it wouldn't fire on the exact flake it targets, and it risks false positives.

### D. Do nothing (manual reruns)
* Good: zero code.
* Bad: the flake persists for every consumer; CI stays noisy; real users hit dead-session failures.

## More Information

Scope/design: [`docs/design/mid-session-context-retry.md`](../docs/design/mid-session-context-retry.md).
Follow-up to the flake trail in PRs #675/#677/#678. ADR number `01082` is provisional. ADR numbers
are assigned at merge and collide across concurrent PRs, as `01078` and `01079` already do. Renumber
the later-merged file if it clashes.
