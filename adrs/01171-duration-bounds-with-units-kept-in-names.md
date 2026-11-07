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

`0` means different things too. For a wait or a delay, it means "don't wait", which is useful. For a timeout, it
means "time out at once" in `runShell`, "no limit" in `httpRequest` (axios), and "use the default" wherever a handler
wrote `timeout || 60000`. A reader can't tell which from the spec.

The names are mixed as well. Most durations have no unit suffix (`timeout`, `duration`, `inputDelay`), while
`waitUntil.delayMs` and `annotation.transition.durationMs` carry `Ms`, and `record.verify` uses seconds.

What bounds should durations have, and should their names change to one convention in 5.0?

## Decision Drivers

- A value that can't mean anything, or means different things in different actions, should fail validation, with
  exit `2`, not run.
- Renaming a field breaks every spec that uses it, for no change in behavior.
- A reader must be able to tell a duration's unit without the docs.

## Considered Options

- **A. Timeouts start at 1, durations and delays at 0, and every name stays as it is.** Each description states its
  unit.
- **B. Everything starts at 0, and names stay.**
- **C. Bound everything, and rename to one convention.** For example, `delayMs` becomes `delay`, because authored
  inputs are milliseconds with no suffix.
- **D. Leave the schemas alone.**

## Decision Outcome

Chosen option: **A**. This is the rule every area applies to its own actions:

- **Every `timeout` takes `minimum: 1`.** A timeout of `0` has no single meaning across actions, so it's invalid
  everywhere, matching checkLink's `timeout`. In this change, that's the `runShell` and `runCode` `timeout` and the
  startSurface process and app `timeout`. `runBrowserScript` already had it.
- **Every other duration and delay takes `minimum: 0`**, where `0` means "don't wait". In this change, that adds the
  bound to `wait`. The five `waitUntil.delayMs` fields already had it.
- **Names keep their units exactly as they are in version 4:** `delayMs`, `durationMs`, `networkIdleTime`, and so on.
  A new field joins the name its family already uses.
- Each description states its unit, as "milliseconds", and `record.verify` keeps its seconds.

An out-of-range value exits `2` with the field's path, for example `tests[0].steps[0].runShell.timeout: must be >= 1.`

### Consequences

- Good: a negative duration, or a timeout of `0`, fails at validation instead of misbehaving at run time.
- Good: `0` means one thing wherever it's allowed: don't wait.
- Good: no spec breaks for a rename.
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

### A. Timeouts from 1, durations and delays from 0, names unchanged

- Good: the smallest change that catches the bad values and the ambiguous `0`.
- Bad: leaves the naming inconsistent.

### B. Everything from 0

- Good: one bound to remember.
- Bad: keeps `timeout: 0` legal while it means "at once" in one action and "no limit" in another.

### C. Bounds and one naming convention

- Good: one style for every duration.
- Bad: breaks every spec that uses `delayMs` or `durationMs`, for no change in behavior. A deprecated alias would
  soften it, but would still leave two names for one thing through the major.

### D. No change

- Good: nothing breaks.
- Bad: specs keep validating values that can't work.
