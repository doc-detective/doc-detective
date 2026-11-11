---
status: accepted
date: 2026-07-09
decision-makers: doc-detective maintainers
---

# Surface `/spec` fetch failures via finalize instead of an uncaught crash

## Context and Problem Statement

`bin/runner-entrypoint.js`'s `main()` calls `fetchSpec(apiBase, runId, token)` as its first
network operation, with no try/catch around the call. Every failure mode downstream of it
(`provisionWorkspace`, `runChild`) is wrapped in a try/catch. That handler logs, ships a stderr
line, and posts a `failed` finalize with a specific `summary.reason` before returning a non-zero
exit code. `fetchSpec` had none of that. A network-level failure, such as a DNS hiccup, connection
reset, or timeout, threw uncaught. It propagated out of `main()`, and was only caught by the
top-level `.catch(err => { localLog('fatal', ...); process.exit(1); })`, which never calls
`postFinalize`.

In production this meant three things. The run row stayed at `status='starting'` for its entire
lifetime. The runner process exited with code 1. In observed cases it eventually surfaced as a
clean-looking lifecycle in Fly's own logs, with no visible error. And the *only* signal the platform
or a human operator ever got was the watchdog's generic Sweep A reap,
`summary.reason: 'cold_start_exceeded'`. That is indistinguishable from "the machine never got far
enough to attempt `/spec` at all." Diagnosing an actual `/spec`-fetch failure required either
platform-server log access or Fly log access. The server logs may not even show the request, since
a fully-failed network call never reaches the server. Neither source reveals the *client-side* fetch
error itself. This was discovered while debugging exactly this symptom against the doc-detective.com
platform. Machines booted, ran, and exited quickly, but every run finalized as
`cold_start_exceeded` with no way to tell why.

## Decision Drivers

* A run's `summary` field is the *only* diagnostic surface a platform operator can see without
  server-side log access. That means Fly logs, and Vercel or host runtime logs. It should carry the
  real cause whenever the runner is in any position to report one.
* Must not change behavior for the already-handled failure modes, workspace provision and spawn.
  Only close the one gap.
* Must remain best-effort. If the underlying failure is a total network blackout, the finalize POST
  to the same host may also fail. That's acceptable, since postFinalize already swallows its own
  errors and returns `false`. But every failure mode *short of* a total blackout should no longer
  disappear into an opaque generic reap message. That covers a one-off timeout, a transient 5xx, or
  a blip that clears moments later.

## Considered Options

* **A. Wrap `fetchSpec()` in the same try/catch pattern already used for `provisionWorkspace` /
  `runChild`, posting `{status: 'failed', summary: {reason: 'spec_fetch_failed', error: String(e)}}`**
  (chosen).
* **B. Leave `fetchSpec()` unwrapped; rely on Sweep A's `cold_start_exceeded` reap as the only
  signal.** Status quo, and exactly the gap that made a real production incident hard to diagnose.
* **C. Have the watchdog distinguish "never called `/spec`" from "called `/spec` but the process
  then crashed" server-side**, for example through a heartbeat column. It is more invasive, and
  requires a schema change. It also doesn't capture the *client-side* error text, such as DNS
  failure detail or a TLS error, that only the runner process ever sees.

## Decision Outcome

Chosen option: **A**. `fetchSpec()`'s call site in `main()` is now wrapped in a try/catch matching
the existing pattern. On failure it logs locally through `localLog`, then attempts a best-effort
`postFinalize(..., {status: 'failed', exit_code: 1, summary: {reason: 'spec_fetch_failed', error:
String(e)}})`, and returns `1`. Option B is the status quo this ADR fixes. Option C would help, but
is strictly more invasive for less diagnostic value. Capturing the actual client-side error text is
what matters, and A already provides that for free.

## Consequences

* **Good.** A `/spec`-fetch failure that isn't a total network blackout now surfaces its real cause
  directly in the run's `summary`. That means `TypeError: fetch failed` plus the underlying cause,
  visible on the run detail page with no server-log access required.
* **Good.** It matches the existing, already-reviewed try/catch/postFinalize/return-1 shape used for
  `provisionWorkspace` and `runChild` failures. No new pattern is introduced.
* **Neutral.** If the failure genuinely is a total network blackout, the finalize POST may also
  fail. The run still finalizes eventually through Sweep A's `cold_start_exceeded` reap exactly as
  before. No regression, just no additional signal in that specific worst case.

## Confirmation

* There's a new regression test in `test/runner-entrypoint.test.js`, in the
  `runner-entrypoint: main()` describe block. It simulates a `/spec` GET that has its socket
  destroyed mid-request, a real network-level failure rather than an HTTP error status. It asserts
  `main()` returns `1`, and asserts the `/finalize` POST received `{status: 'failed', exit_code: 1, summary: {reason: 'spec_fetch_failed', error: <string>}}`.
* Full `test/runner-entrypoint.test.js` suite green (52/52) plus the broader Chrome-free suite
  (79 passing) with no regressions to the existing `provisionWorkspace`/`runChild`/410-cancel paths.

## Pros and Cons of the Options

### A. Wrap `fetchSpec()` in a try/catch, report via finalize

* Good: matches existing patterns exactly; minimal diff.
* Good: captures the real client-side error text for free.
* Neutral: still best-effort under a total network blackout (same as every other finalize call).

### B. Leave unwrapped (status quo)

* Bad: it's exactly the diagnostic gap this ADR closes. A real production incident took an extended,
  multi-round debugging session to even localize to "the runner's first callback." Nothing in the
  system reported the actual failure.

### C. Server-side heartbeat / staged-status distinction

* Good: would let the watchdog itself distinguish "never called /spec" from "crashed after
  calling it," without relying on the runner successfully phoning home again.
* Bad: it requires a schema change and new watchdog logic. It doesn't capture the client-side error
  text, which is the more actionable information for a human debugging the incident.
