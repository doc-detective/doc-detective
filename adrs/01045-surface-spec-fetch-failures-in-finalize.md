---
status: accepted
date: 2026-07-09
decision-makers: doc-detective maintainers
---

# Surface `/spec` fetch failures via finalize instead of an uncaught crash

## Context and Problem Statement

`bin/runner-entrypoint.js`'s `main()` calls `fetchSpec(apiBase, runId, token)` as its first
network operation, with no try/catch around the call. Every failure mode downstream of it
(`provisionWorkspace`, `runChild`) is wrapped in a try/catch that logs, ships a stderr line, and
posts a `failed` finalize with a specific `summary.reason` before returning a non-zero exit code.
`fetchSpec` had none of that: a network-level failure (DNS hiccup, connection reset, timeout) threw
uncaught, propagated out of `main()`, and was only caught by the top-level
`.catch(err => { localLog('fatal', ...); process.exit(1); })` — which never calls `postFinalize`.

In production this meant: the run row stayed at `status='starting'` for its entire lifetime, the
runner process exited (code 1, or in observed cases eventually surfacing as a clean-looking
lifecycle in Fly's own logs with no visible error), and the *only* signal the platform or a human
operator ever got was the watchdog's generic Sweep A reap — `summary.reason: 'cold_start_exceeded'`
— which is indistinguishable from "the machine never got far enough to attempt `/spec` at all."
Diagnosing an actual `/spec`-fetch failure required either platform-server log access (which may not
even show the request, since a fully-failed network call never reaches the server) or Fly log
access, neither of which reveal the *client-side* fetch error itself. This was discovered while
debugging exactly this symptom against the doc-detective.com platform: machines booted, ran, and
exited quickly, but every run finalized as `cold_start_exceeded` with no way to tell why.

## Decision Drivers

* A run's `summary` field is the *only* diagnostic surface a platform operator can see without
  server-side log access (Fly logs, Vercel/host runtime logs) — it should carry the real cause
  whenever the runner is in any position to report one.
* Must not change behavior for the already-handled failure modes (workspace provision, spawn) —
  only close the one gap.
* Must remain best-effort: if the underlying failure is a total network blackout, the finalize POST
  (same host) may also fail. That's acceptable — postFinalize already swallows its own errors and
  returns `false` — but every failure mode *short of* a total blackout (a one-off timeout, a
  transient 5xx, a blip that clears moments later) should no longer disappear into an opaque
  generic reap message.

## Considered Options

* **A. Wrap `fetchSpec()` in the same try/catch pattern already used for `provisionWorkspace` /
  `runChild`, posting `{status: 'failed', summary: {reason: 'spec_fetch_failed', error: String(e)}}`**
  (chosen).
* **B. Leave `fetchSpec()` unwrapped; rely on Sweep A's `cold_start_exceeded` reap as the only
  signal.** Status quo — exactly the gap that made a real production incident hard to diagnose.
* **C. Have the watchdog distinguish "never called `/spec`" from "called `/spec` but the process
  then crashed" server-side**, e.g. via a heartbeat column. More invasive, requires a schema change,
  and doesn't capture the *client-side* error text (DNS failure detail, TLS error, etc.) that only
  the runner process ever sees.

## Decision Outcome

Chosen option: **A**. `fetchSpec()`'s call site in `main()` is now wrapped in a try/catch matching
the existing pattern: on failure, log locally via `localLog`, attempt a best-effort
`postFinalize(..., {status: 'failed', exit_code: 1, summary: {reason: 'spec_fetch_failed', error:
String(e)}})`, and return `1`. Option B is the status quo this ADR fixes. Option C would help but is
strictly more invasive for less diagnostic value than capturing the actual client-side error text,
which A already provides for free.

## Consequences

* **Good** — a `/spec`-fetch failure that isn't a total network blackout now surfaces its real cause
  (e.g. `TypeError: fetch failed` plus the underlying cause) directly in the run's `summary`, visible
  on the run detail page with no server-log access required.
* **Good** — matches the existing, already-reviewed try/catch/postFinalize/return-1 shape used for
  `provisionWorkspace` and `runChild` failures; no new pattern introduced.
* **Neutral** — if the failure genuinely is a total network blackout, the finalize POST may also
  fail; the run still finalizes eventually via Sweep A's `cold_start_exceeded` reap exactly as
  before. No regression, just no additional signal in that specific worst case.

## Confirmation

* New regression test in `test/runner-entrypoint.test.js` (`runner-entrypoint: main()` describe
  block): simulates a `/spec` GET that has its socket destroyed mid-request (a real network-level
  failure, not an HTTP error status), asserts `main()` returns `1`, and asserts the `/finalize` POST
  received `{status: 'failed', exit_code: 1, summary: {reason: 'spec_fetch_failed', error: <string>}}`.
* Full `test/runner-entrypoint.test.js` suite green (52/52) plus the broader Chrome-free suite
  (79 passing) with no regressions to the existing `provisionWorkspace`/`runChild`/410-cancel paths.

## Pros and Cons of the Options

### A. Wrap `fetchSpec()` in a try/catch, report via finalize

* Good: matches existing patterns exactly; minimal diff.
* Good: captures the real client-side error text for free.
* Neutral: still best-effort under a total network blackout (same as every other finalize call).

### B. Leave unwrapped (status quo)

* Bad: exactly the diagnostic gap this ADR closes — a real production incident took an extended,
  multi-round debugging session to even localize to "the runner's first callback," because nothing
  in the system reported the actual failure.

### C. Server-side heartbeat / staged-status distinction

* Good: would let the watchdog itself distinguish "never called /spec" from "crashed after
  calling it," without relying on the runner successfully phoning home again.
* Bad: requires a schema change and new watchdog logic; doesn't capture the client-side error text,
  which is the more actionable piece of information for a human debugging the incident.
