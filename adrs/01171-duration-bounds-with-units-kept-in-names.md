---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Duration bounds, with units kept in names

## Context and Problem Statement

Most durations in the step schemas carry `minimum: 0`, but not all. `{"wait": -5}`, a `runShell` or `runCode`
`timeout` of `-1`, and similar values validate. Then they do nothing useful. A negative wait returns at once, and a
negative timeout fails the command before it starts. The names are mixed too. Most durations have no unit suffix
(`timeout`, `duration`, `inputDelay`), while `waitUntil.delayMs` and `annotation.transition.durationMs` carry `Ms`,
and `record.verify` uses seconds.

What bounds should durations have, and should their names change to one convention in 5.0?

## Decision Drivers

- A value that can't mean anything should fail validation, with exit `2`, not run.
- Renaming a field breaks every spec that uses it, for no change in behavior.
- A reader must be able to tell a duration's unit without the docs.

## Considered Options

- **A. Bound every duration at 0, and keep every name as it is.** Each description states its unit.
- **B. Bound every duration, and rename to one convention.** For example, `delayMs` becomes `delay`, because
  authored inputs are milliseconds with no suffix.
- **C. Leave the schemas alone.**

## Decision Outcome

Chosen option: **A**.

- Every timeout, duration, and delay takes `minimum: 0`. In this change, that adds the bound to `wait` and to the
  `runShell` and `runCode` `timeout`. The other process and surface durations already had it. Other areas apply the
  same rule to their own actions.
- Names keep their units exactly as they are in version 4: `delayMs`, `durationMs`, `networkIdleTime`, and so on.
  A new field joins the name its family already uses.
- Each description states its unit, as "milliseconds", and `record.verify` keeps its seconds.
- `0` is a real value, not "use the default". The normalizer keeps an authored `0`, so a `runShell` `timeout` of
  `0` times out at once. Version 4 replaced it with the 60000 default.

### Consequences

- Good: a negative duration fails at validation, with the field's path, instead of misbehaving at run time.
- Good: no spec breaks for a rename.
- Bad: the names stay mixed, so `delayMs` and `timeout` keep different styles. Descriptions carry the unit.
- Bad: a `runShell` or `runCode` `timeout: 0` that relied on the old fallback now fails the step. The upgrade
  guide says to leave the key out instead.

### Confirmation

- `src/common/test/validate.test.js` rejects a negative `wait`, `runShell` and `runCode` `timeout`,
  `waitUntil.delayMs`, and `startSurface` `timeout`, and accepts `wait: 0`.
- `src/common/test/normalize.test.js` keeps an authored `runShell` `timeout` of `0`.
- `test/core-artifacts/cli/process-tightening.spec.json` runs a negative `wait` and a negative `runShell` `timeout`
  through the CLI and expects exit `2`.

## Pros and Cons of the Options

### A. Bounds, names unchanged

- Good: the smallest change that catches the bad values.
- Bad: leaves the naming inconsistent.

### B. Bounds and one naming convention

- Good: one style for every duration.
- Bad: breaks every spec that uses `delayMs` or `durationMs`, for no change in behavior. A deprecated alias would
  soften it, but would still leave two names for one thing through the major.

### C. No change

- Good: nothing breaks.
- Bad: specs keep validating values that can't work.
