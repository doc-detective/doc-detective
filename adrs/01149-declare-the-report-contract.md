---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Declare the report contract

## Context and Problem Statement

[ADR 01146](01146-cli-v5-contract.md) tells users to stop parsing logs and to read `--json`, `--output`, or
`--plain` instead. That makes the results a public contract, but `report_v3` doesn't describe them:

- It omits `summary`, which the exit code, telemetry, and the Action all read.
- It rejects real reports, because `test_v3` is closed and doesn't declare `result`. Nothing noticed,
  because reports aren't validated at runtime.
- It rejects the empty `specs` of a run whose filter matched nothing.
- `--plain` printed `linux/[object Object]` in its fourth column.

What can scripts rely on, and how do we keep that true?

## Decision Drivers

- Users move their scripts once, in 5.0, so what they move to has to hold.
- A schema that rejects real output can't be trusted, by users or by us.
- Authors shouldn't be pushed toward writing result fields into specs.

## Considered Options

- **A. Declare the emitted shape in `report_v3`, and test real output against it.**
- **B. Document the fields in prose only.**
- **C. Add a separate report-only copy of the spec, test, and step schemas.**

## Decision Outcome

Chosen option: **A**.

- `summary` is required, with `specs`, `tests`, `contexts`, and `steps`, each holding whole-number `pass`,
  `fail`, `warning`, and `skipped` counts.
- `specs` may be empty.
- `result` and `resultDescription` are declared `readOnly` on specs, tests, context items, and steps. This
  follows `durationMs` in [ADR 01083](01083-record-durationms-on-report-nodes.md). `result` is limited to
  `PASS`, `FAIL`, `WARNING`, and `SKIPPED`.
- `--plain` prints one line per test context, with four columns: result, spec ID, test ID, and platform and
  browser. Its browser column prints the browser's name.

The stable contract is `summary`, `result`, `durationMs`, `runId` and `runDir` (absent when a filter matches
nothing), and the `--plain` columns in order. Changing any of these needs a major. Adding fields doesn't, and
consumers should ignore fields they don't recognize. `uploadResults` and `recordingSerialized` stay
undeclared because they aren't part of the contract.

### Consequences

- Good: the schema now validates what the CLI really emits, and a test keeps it that way.
- Good: consumers get a generated `Report` type with `summary`.
- Bad: a spec author can write `result` without a validation error, as they can with `durationMs`. It has no
  effect.
- Bad: step `outputs` values can be any type, because a report holds what the step produced, such as
  `stdio: {stdout, stderr}`. An authored non-string output no longer fails validation.
- Neutral: code calling `validate()` with `report_v3` must now supply `summary`.

### Confirmation

`test/cli-contract.test.js` validates real `--json` output against `report_v3` for passing, failing, and
zero-match runs, and asserts the `--plain` columns. `src/common/test/validate.test.js` covers malformed
summaries and unknown `result` values.

## Pros and Cons of the Options

### A. Declare the shape, and test real output

- Good: one source of truth, enforced against the real CLI.
- Bad: authored schemas gain fields only reports use.

### B. Document in prose only

- Good: no schema change.
- Bad: nothing stops the docs and output from drifting apart, and the schema stays wrong.

### C. Separate report-only schemas

- Good: authored schemas stay clean.
- Bad: duplicates the largest schemas in the project, which all have to change together.
