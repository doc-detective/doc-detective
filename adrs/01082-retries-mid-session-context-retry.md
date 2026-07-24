---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# `retries`: retry a whole context on a fresh session when the session dies or the page breaks mid-run

## Context and Problem Statement

On constrained CI runners (notably `windows-latest`), a browser/app session intermittently **dies
mid-run**: an early step (`goTo`) passes — "all wait conditions met" — and then a later step fails
because the session or DOM is gone (`WebDriverError: ECONNREFUSED` / `invalid session id`, or an element
that can't be found because the context is dead). This is the same root cause behind three separate
flakes: the recording `annotate` legs, the `getRunner` unit tests, and `android-skip` element lookups.

Two prior mitigations don't fix the class:

- **Fixture-level `find` guards + long timeouts** ([`test/core-artifacts/recording/annotate.spec.json`],
  PR #677) — no timeout finds an element in a *dead* DOM.
- **Mocha `this.retries(2)`** (PR #678) — heals a *unit test*, but fixtures run via the GitHub Action +
  results gate, not mocha, and it does nothing for real users.

`driverStart` already retries session *creation* (4 attempts, ADR 01039) but nothing covers a session that
dies *after the first step*. How do we make the runner tolerant of a mid-run session death without masking
a legitimate test failure?

## Decision Drivers

* Fix the class for CI fixtures **and** real users (the runner, not a test harness).
* Never mask a *deterministic* failure — a real bug must still FAIL after retries are exhausted.
* Pool-safe under `concurrentRunners` — a retry must not starve the Appium pool or re-contend on exclusive
  resources (display / native-app-driver / android-emulator).
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

1. **Detection — active probe, two modes.** A bad-session step FAIL is indistinguishable at the result
   level from a real assertion FAIL (handlers catch driver errors and return FAIL), and the headline
   symptom (a `find` timing out) carries no session-error string, so string-matching is insufficient.
   After the step loop, if any step FAILed, `runContext` probes **while the session is still registered,
   before teardown**, and sets a non-enumerable `_sessionDied` hint on the FAIL report when either mode
   fires:
   - **Dead session** — `isSessionAlive` runs a session-scoped, driver-agnostic command
     (`getPageSource`, valid for browser/webview/native; **not** `status`, which queries the Appium
     *server*). A classified throw means the session is gone; `isRetryableSessionError` is widened with
     `invalid session id` / `no such session` / `chrome not reachable` / `session deleted because of page
     crash`.
   - **Alive but broken page** — if the session responds, `isPageBroken` checks the current URL: an
     unambiguous browser **error page** (`chrome-error://chromewebdata/` on a renderer crash;
     `about:neterror` / `about:certerror` on Firefox) means the page under test is gone → retry. Only
     error pages count — `about:blank` is **not** treated as broken, so a genuine "element not on a
     correctly-loaded page" failure still FAILs. A URL-match against the last `goTo` was rejected:
     `driver.state.url` isn't maintained per navigation, so it isn't a reliable expected URL.
2. **Retry — re-invoke, not in-place.** `runContextWithRetries` wraps the `runContext` call at both job
   sites (`runJob`, `runRoutedJob`). On a `FAIL` report carrying `_sessionDied`, within budget, it
   re-invokes `runContext` — which re-runs setup, re-provisions every session, and restarts recordings
   cleanly. The job keeps its concurrency slot and any exclusive resource; only the Appium **pool port**
   churns (acquire→release→acquire). The two context fields `runContext` mutates non-idempotently
   (`openApi` appends, `browser` narrows on fallback; plus `__display`/`__displaySize`) are snapshotted
   and restored before each attempt.
3. **Bounds & safety.** A live-session FAIL (probe succeeds) is **never** retried — a deterministic bug
   fails all attempts. Bounded by `retries`; linear backoff (`500 * attempt`) mirrors `driverStart`.

### Consequences

* Good: eliminates the **dead-session** mid-run flake mode (the `getRunner` `ECONNREFUSED` case) **and**
  the **broken-page-via-error-page** mode (a renderer crash that navigates to `chrome-error://`) for
  fixtures and real users; a single opt-out (`retries: 0`) restores byte-identical single-attempt
  behavior.
* Good: re-invoke reuses the entire existing setup/teardown/recording path, so multi-surface, app/mobile,
  and recording contexts retry correctly with no deep surgery in `runContext`'s step loop.
* Good: the active probe means retries can never hide a real assertion failure.
* Neutral: the pool port churns on a retry (release→re-acquire); safe under concurrency (progress
  guaranteed), a negligible cost paid only on the failure path.
* Bad/limit: one alive-but-broken-page sub-case remains uncovered — a page that **blanks at the same
  URL** (session responds, URL unchanged, DOM emptied). It's ambiguous with a genuine "element not on a
  correctly-loaded page" failure, so it is treated as a real FAIL and not retried. CI (PR #680) showed the
  `windows-latest` recording `annotate` flake is the alive-but-broken-page mode (its `find` times out
  while `getPageSource` still succeeds); the error-page detection now covers the renderer-crash variant of
  it, and a **debug diagnostic** logs the URL of any live, non-error-page FAIL that isn't retried, so if
  the recording flake turns out to be the same-URL-blank variant the logs will reveal it for a follow-up
  heuristic. (The three flakes split into two modes — dead-session and alive-but-broken-page — not one
  root cause as first framed.)
* Bad/limit: the probe adds one `getPageSource` round-trip on any failing context (failure path only).

### Confirmation

Red→green unit tests: `isRetryableSessionError` mid-run markers, `isSessionAlive` (probe resolves →
alive; classified session-death throw → dead; non-session throw → alive; wedged/timeout → alive; null
driver → dead), and `isPageBroken` (browser error page → broken; normal page & `about:blank` → not
broken; no-`getUrl`/throwing driver → not broken) in `test/core-utils-coverage.test.js`;
`resolveRetryPolicy` (context-over-config, default 1, **explicit 0
preserved**) and `runContextWithRetries` (retry-on-dead-session → PASS; **no retry on a live-session
FAIL**; budget exhaustion; `retries: 0` disables; **non-idempotent context fields restored** before each
retry) in `test/browser-fallback.test.js`; `config_v3` positive/negative/default `retries` cases in
`src/common/test/validate.test.js`. Feature fixture
`test/core-artifacts/navigation/context-retries.spec.json` proves the context-level `retries` field is
accepted end-to-end and is a green-path no-op (a fixture can't deterministically kill a live session, so
the retry control flow is asserted programmatically per `CLAUDE.md`'s documented exception).

## Pros and Cons of the Options

### A. Re-invoke on a probe-confirmed dead session
* Good: reuses the full setup/teardown/recording path; no deep surgery; probe prevents masking real bugs.
* Bad: pool port churns on retry; re-invoke re-runs setup (slower than reusing the session).

### B. In-place retry surgery inside the step loop
* Good: reuses the held session/port (no churn).
* Bad: very high risk in the 1300-line `runContext` — must hand-manage the multi-surface `browserSessions`
  registry, app sessions, recordings, and all mutable state; a large, hard-to-verify diff in the most
  critical function.

### C. String-match detection only
* Good: no extra round-trip.
* Bad: misses the headline symptom (a dead-DOM `find` timeout has no session-error string), so it wouldn't
  fire on the exact flake it targets — and risks false positives.

### D. Do nothing (manual reruns)
* Good: zero code.
* Bad: the flake persists for every consumer; CI stays noisy; real users hit dead-session failures.

## More Information

Scope/design: [`docs/design/mid-session-context-retry.md`](../docs/design/mid-session-context-retry.md).
Follow-up to the flake trail in PRs #675/#677/#678. ADR number `01082` is provisional — ADR numbers are
assigned at merge and collide across concurrent PRs (`01078`/`01079` already do); renumber the
later-merged file if it clashes.
