---
status: accepted
date: 2026-11-19
decision-makers: hawkeyexl
---

# Fail only on new failures

## Context and Problem Statement

ADR 01233 compares each run with an earlier one and marks each failure `new` or `existing`
(already failing), but leaves the exit code alone. In a docs repository with a few long-standing
failures, every pull request still exits `1`. So the gate is either always red or turned off with
`exitOnFail: false`. Maintainers want an opt-in gate that blocks a change only when it adds a
failure. The GitHub Action's v2.3 plan (github-action#98) exposes the same choice as its `fail_on`
input. How should the CLI let a run fail only on new failures?

## Decision Drivers

* Opt-in. The default exit code stays as ADR 01146 defines it.
* One name and one set of values shared by config, the CLI, and the Action.
* An exit `0` with failures present must never be silent or a mystery.
* The results JSON keeps saying what's true: failures stay failures.
* When the CLI can't tell new from existing, it must not pass a failing run.

## Considered Options

* A. Extend `exitOnFail` to `true`, `false`, or `"new"`.
* B. A separate `failOn` key, `"any"` or `"new"`, with `--fail-on <which>`.
* C. A subcommand, such as `doc-detective compare`, that sets the exit code.

## Decision Outcome

Chosen option: "B. A separate `failOn` key", because it's orthogonal to `exitOnFail`, matches the
Action's `fail_on`, and keeps the one `run` command.

- Config `failOn`: `"any"` (default) or `"new"`. Flag `--fail-on <which>`, with commander's choices,
  beats config.
- `runExitCode()` applies it in one place, after the existing rules. `exitOnFail: false` still exits
  `0`, and a run that tested nothing still exits `2`. A failing run under `failOn: "new"` with a
  comparison exits `1` only when `comparison.summary.new > 0`, and `0` otherwise. With no
  comparison, every failure counts as new, so the run exits `1`.
- When `failOn: "new"` turns a failing run into exit `0`, the CLI prints one info line on stderr:
  ``No new failures: <n> failures were already failing, so the run exits 0 (`failOn: new`).``
- `failOn: "new"` with `compareTo: false`, from any source, is a usage error, exit `2`:
  ``Error: `failOn: new` needs a comparison. Remove `compareTo: false` or `--no-compare-to`.``
- This amends ADR 01146's exit-code table only under `failOn: "new"`: there, `1` means at least one
  failure is new.

### Consequences

* Good, because a project with known failures can keep the gate on and still catch regressions.
* Good, because the report's `summary`, verdict, and failure list don't change, so the JSON stays
  the truth and tools reading it see every failure.
* Good, because the no-comparison case (fresh CI runner, first run) fails safe.
* Bad, because a run can exit `0` with failures present. The stderr line explains why.
* Bad, because the gate depends on the earlier run being available, so CI must keep `outputDir`
  or pass `--compare-to` to get the benefit. Without it, the gate behaves like `any`.

### Confirmation

- `test/all-skipped.test.js` covers `runExitCode` for each `failOn` permutation.
- `test/utils.test.js` and `test/cli-contract.test.js` cover the flag, the override, and the usage
  errors.
- `test/core-artifacts/cli/compare-runs.spec.json` runs each permutation through the real CLI.

## Pros and Cons of the Options

### A. Extend `exitOnFail`

* Good, because there's one key for the exit code.
* Bad, because its flag `--exit-on-fail` is deprecated and boolean-shaped, so `"new"` has no clean
  flag form.
* Bad, because a mixed boolean-or-string key is harder to validate and document.

### B. A separate `failOn` key

* Good, because it composes with `exitOnFail` and `compareTo` without changing either.
* Good, because the Action's `fail_on` maps to it directly.
* Neutral, because it adds a key and a flag.

### C. A subcommand

* Good, because it isolates the behavior.
* Bad, because users would run tests twice or learn a second command for one exit-code choice.
