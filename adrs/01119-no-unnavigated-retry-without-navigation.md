---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Don't retry a context as "unnavigated" when it never navigated

## Context and Problem Statement

[ADR 01084](01084-retry-unnavigated-context.md) retries a FAILed context whose primary browser
session is still on Chromium's initial blank document, `data:,`. Its safety argument was that "a page
under test is never legitimately on it, because reaching any fixture URL necessarily navigates away."

That holds only for a context that has a page under test. A context can hold a browser session yet run
no `goTo` at all. One example is a test whose steps all target a process surface (`runShell`
background, `type` to that process, `closeSurface`). Its primary session sits on `data:,` by design.
When one of its steps FAILs for real, 01084 classified the context as unnavigated and retried it.

The retry is not harmless. Background processes live in a run-level registry, and the failed attempt
never reached its `closeSurface`. The retry's `runShell` therefore FAILed with
`A background process named "…" is already running.`, which replaced the real failure in the report.
The 01084 ADR expected a deterministic failure to "fail identically" on retry. Here it failed
differently, and misleadingly.

It showed up on any machine whose default browser resolves to Chrome. Firefox's initial page is
`about:blank`, which 01084 excludes, so CI's Firefox default never hit it.

## Decision Drivers

* Keep 01082's guarantee that a real failure is never retried away or masked.
* Keep 01084's recovery for a `goTo` that silently didn't take.
* Make the smallest change in the one place that owns the retry decision.

## Considered Options

* **A. Apply the unnavigated check only when the context ran a `goTo`** (chosen).
* **B. Kill background processes the failed attempt started before retrying.**
* **C. Leave it.**

## Decision Outcome

Chosen: **option A**. `classifyContextRetry(probeDrivers, { navigated })` skips the unnavigated
check when `navigated` is false. `runContext` passes `navigated: true` when any step report carries a
`goTo` that wasn't SKIPPED. Dead sessions and browser error pages still retry regardless. The option
defaults to `true`, so other callers keep 01084's behavior.

```text
session dead                           -> retry   (ADR 01082)
alive, on chrome-error:                -> retry   (ADR 01082)
alive, on data:, after a goTo ran      -> retry   (ADR 01084)
alive, on data:, and no goTo ever ran  -> FAIL, not retried (this ADR)
alive, on a real page                  -> FAIL, not retried
```

### Consequences

* Good: a real failure in a browser-less-in-practice context is reported as itself.
* Good: a context whose first step is a `find` with no `goTo` no longer spends a retry, which 01084
  listed as a cost.
* Neutral: Firefox contexts are unaffected, as before.
* Bad/limit: option B's problem remains for retries 01082 and 01084 still make. A context that
  starts a named background process and then hits a dead session retries into
  `already running`. That's a separate fix.

### Confirmation

* `test/core-utils-coverage.test.js` covers `classifyContextRetry` with `navigated: false` (no retry
  for `data:,`, still a retry for a dead session) and `navigated: true`.
* `test/core-core.test.js` runs a process-only context pinned to headless Chrome with fallback off.
  The `type` step FAILs on its assertion, the start step PASSes, and the context reports no
  `retries`. Before this change the context retried and the start step FAILed with `already running`.

## Pros and Cons of the Options

### A. Gate on a `goTo` having run

* Good: restores 01084's own premise exactly. Only a context that tried to load a page can be
  "stuck" before it.
* Good: one boolean, computed from the step reports runContext already holds.

### B. Clean up the attempt's processes before retrying

* Good: would also fix dead-session retries.
* Bad: still retries a real failure, spending wall-clock for nothing.
* Bad: needs per-attempt ownership tracking in a run-level registry.

### C. Leave it

* Bad: misreports failures on every Chrome-default machine.
