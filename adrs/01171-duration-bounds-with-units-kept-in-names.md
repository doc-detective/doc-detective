---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Duration bounds, with units kept in names

## Context and Problem Statement

Most durations in the step schemas carry `minimum: 0`, but not all. `{"wait": -5}`, a `runShell` or `runCode`
`timeout` of `-1`, and similar values validate. Then they do nothing useful. A negative wait returns at once, and a
negative timeout fails the command before it starts.

`0` means different things too. For a wait or a delay, it means "don't wait". For a locator's `timeout`, such as
`find` or `click`, it means "check once" ([ADR 01090](01090-non-destructive-surface-bookkeeping-and-zero-timeout.md)).
Both are useful. A timeout that bounds an operation is different. There, `0` means "time out at once" in `runShell`
and "no limit" in `httpRequest` (axios). It means "use the default" wherever a handler wrote `timeout || 60000`. A
reader can't tell which from the spec.

The names are mixed as well. Most durations have no unit suffix (`timeout`, `duration`, `inputDelay`), while
`waitUntil.delayMs` and `annotation.transition.durationMs` carry `Ms`, and `record.verify` uses seconds.

What bounds should durations have, and should their names change to one convention in 5.0?

## Decision Drivers

- A value that can't mean anything, or means different things in different actions, should fail validation, with
  exit `2`, not run.
- Renaming a field breaks every spec that uses it, for no change in behavior.
- A reader must be able to tell a duration's unit without the docs.

## Considered Options

- **A. Operation timeouts start at 1. Wait timeouts, durations, and delays start at 0. Every name stays as it is.**
  Each description states its unit.
- **B. Everything starts at 0, and names stay.**
- **B2. Every `timeout` starts at 1, whatever it bounds.**
- **C. Bound everything, and rename to one convention.** For example, `delayMs` becomes `delay`, because authored
  inputs are milliseconds with no suffix.
- **D. Leave the schemas alone.**

## Decision Outcome

Chosen option: **A**. This is the rule every area applies to its own actions:

- **A timeout that bounds an operation takes `minimum: 1`.** That covers `runShell`, `runCode`, `runBrowserScript`,
  a startSurface launch, a `goTo` page load, `httpRequest`, and `checkLink`. Here, `0` had no single meaning, so it's
  invalid. In this change, that's the `runShell` and `runCode` `timeout` and the startSurface process and app
  `timeout`. `runBrowserScript` already had it.
- **A timeout that bounds a wait for something to appear takes `minimum: 0`**, where `0` means "check once". That
  covers the locator timeouts of `click`, `find`, `type`, `dragAndDrop`, and `annotate`.
- **Every other duration and delay takes `minimum: 0`**, where `0` means "don't wait". In this change, that adds the
  bound to `wait`. The five `waitUntil.delayMs` fields already had it.
- **Names keep their units exactly as they are in version 4:** `delayMs`, `durationMs`, `networkIdleTime`, and so on.
  A new field joins the name its family already uses.
- Each description states its unit, as "milliseconds", and `record.verify` keeps its seconds.

An out-of-range value exits `2` with the field's path, for example `tests[0].steps[0].runShell.timeout: must be >= 1.`

### Consequences

- Good: a negative duration, or an operation timeout of `0`, fails at validation instead of misbehaving at run time.
- Good: wherever `0` is allowed, it means don't wait, or check once without waiting.
- Good: locator steps keep `timeout: 0` as an immediate check, so no locator spec breaks.
- Good: no spec breaks for a rename.
- Bad: whether `timeout: 0` is valid depends on what the timeout bounds. Each description says which.
- Bad: the names stay mixed, so `delayMs` and `timeout` keep different styles. Descriptions carry the unit.
- Bad: a spec with `timeout: 0` now exits `2`. Version 4 treated it as the 60000-millisecond default in `runShell`
  and `runCode`. The upgrade guide says to leave the key out instead.

### Confirmation

- `src/common/test/validate.test.js` rejects a `timeout` of `0` or `-1` on `runShell`, `runCode`, and startSurface
  process and app descriptors, and accepts `1`. It rejects a negative `wait` and `waitUntil.delayMs`, and accepts
  both at `0`.
- `test/core-artifacts/cli/process-tightening.spec.json` runs each of those out-of-range values through the CLI and
  expects exit `2`, and a `wait` of `0` that passes.

## Pros and Cons of the Options

### A. Operation timeouts from 1, wait timeouts, durations, and delays from 0, names unchanged

- Good: the smallest change that catches the bad values and the ambiguous `0`, and keeps the useful `0`s.
- Bad: leaves the naming inconsistent.

### B. Everything from 0

- Good: one bound to remember.
- Bad: keeps `timeout: 0` legal while it means "at once" in one action and "no limit" in another.

### B2. Every timeout from 1

- Good: one bound for every `timeout`.
- Bad: breaks locator specs that use `timeout: 0` to check once without waiting, a documented behavior.

### C. Bounds and one naming convention

- Good: one style for every duration.
- Bad: breaks every spec that uses `delayMs` or `durationMs`, for no change in behavior. A deprecated alias would
  soften it, but would still leave two names for one thing through the major.

### D. No change

- Good: nothing breaks.
- Bad: specs keep validating values that can't work.
