---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# `retries`: retry a whole context on a fresh session when the session dies mid-run

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

1. **Detection — active liveness probe.** A dead session's step FAIL is indistinguishable at the result
   level from a real assertion FAIL (handlers catch driver errors and return FAIL), and the headline
   symptom (a `find` timing out on a dead DOM) carries no session-error string, so string-matching is
   insufficient. After the step loop, if any step FAILed, `runContext` probes the session **while it is
   still registered, before teardown** with a session-scoped, driver-agnostic command
   (`isSessionAlive` → `getPageSource`, valid for browser/webview/native; **not** `status`, which queries
   the Appium *server*). A dead session sets a non-enumerable `_sessionDied` hint on the FAIL report;
   `isRetryableSessionError` is widened with `invalid session id` / `no such session` / `chrome not
   reachable` / `session deleted because of page crash`.
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

* Good: eliminates the **dead-session** mid-run flake mode (the `getRunner` `ECONNREFUSED` case) for
  fixtures and real users; a single opt-out (`retries: 0`) restores byte-identical single-attempt
  behavior. (The alive-but-broken-page mode is not covered — see the limits below.)
* Good: re-invoke reuses the entire existing setup/teardown/recording path, so multi-surface, app/mobile,
  and recording contexts retry correctly with no deep surgery in `runContext`'s step loop.
* Good: the active probe means retries can never hide a real assertion failure.
* Neutral: the pool port churns on a retry (release→re-acquire); safe under concurrency (progress
  guaranteed), a negligible cost paid only on the failure path.
* Bad/limit: a session that is *alive but on a blank/crashed page* (probe succeeds, but the expected DOM
  is gone) is treated as a real FAIL and not retried — a deliberate v1 scope; a later page-integrity /
  URL-match refinement (v2) could cover it. **CI evidence (PR #680) shows the `windows-latest` recording
  `annotate` flake is exactly this case, not the dead-session case:** its `find` steps time out while the
  probe's `getPageSource` still succeeds, so v1 correctly does not retry it. This ADR therefore fixes the
  **dead-session** mode (the `getRunner` `ECONNREFUSED` flake, PR #678) but **not** the recording
  `annotate` flake, which is a distinct alive-but-broken-page mode left for v2. My original framing of the
  three flakes as one root cause was wrong: they split into dead-session (fixed here) and
  alive-but-broken-page (recording; v2).
* Bad/limit: the probe adds one `getPageSource` round-trip on any failing context (failure path only).

### Confirmation

Red→green unit tests: `isRetryableSessionError` mid-run markers and `isSessionAlive` (probe resolves →
alive; classified session-death throw → dead; non-session throw → alive; null driver → dead) in
`test/core-utils-coverage.test.js`; `resolveRetryPolicy` (context-over-config, default 1, **explicit 0
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
