---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Every report validates against its schema

Amends [ADR 01149](01149-declare-the-report-contract.md).

## Context and Problem Statement

ADR 01149 made `report_v3` the contract for results, and a test checks a passing run, a failing run, and a filter
that matches nothing. Other runs still write reports that fail the schema:

- A skipped context reports `steps: []`, and `test_v3` requires at least one step.
- A `goToStep` to a missing step, or a `goToStep` loop, pushes a step with no action. It fails `step_v3`, and
  `summary.steps` counts it.
- The runner writes `visit` on a re-run test, which `test_v3` doesn't declare, so the test fails the closed schema.
  Contexts carry `contextId`, `device`, `warnings`, `fallback`, `viewportFloored`, and `retries`. Resolved contexts
  carry `unsafe`, `requires`, and `browserFallback`. Contexts aren't closed, so these pass, but nothing documents them.
- A run with no tests returns `{summary, specs}` from one path and the full shape from another.
- A failed API run resolves `{status, error}`, which the reporters then treat as a report.
- The `--dry-run` plan carries the runner's `_`-prefixed bookkeeping, and `environment.apps`, so it fails
  `resolvedTests_v3`.

What has to change so every report and plan validates?

## Decision Drivers

- Scripts can validate any results file, not only the happy paths.
- `summary.steps` counts authored steps only.
- A failure reads as a failure, on the step that caused it.
- No output that isn't a report should reach the reporters.

## Considered Options

- **A. Fix the output to fit the contract, and widen the schema only where the output is right.**
- **B. Loosen the schema until every current output passes.**
- **C. Validate reports at runtime and drop what doesn't fit.**

## Decision Outcome

Chosen option: **A**.

- `test_v3` drops `minItems` on a context's `steps`, so a skipped context's `steps: []` validates.
- `test_v3` declares `visit` on a test. A context declares `contextId`, `device`, `warnings`, `fallback`,
  `viewportFloored`, `retries`, `unsafe`, `requires`, and `browserFallback`. `config_v3` declares `environment.apps`.
- A routing failure fails the step that routed. One helper takes the last step report, sets `result` to `FAIL`, keeps
  its `resultDescription`, and appends the reason. It pushes the merged report back through `pushStepReport`, so
  anything that function applies to a report applies here too. The reasons:
  - ``Couldn't route to step `<id>`: no step has that `stepId`.``
  - ``Couldn't finish the context: routing ran more than <n> steps. Check `goToStep` for a loop.``
- The end-of-context recording stops go through `pushStepReport` as well.
- `emptyReport` lives in `tests.ts`. Every path that tests nothing returns
  `{summary, startedAt, environment, durationMs, specs: []}`.
- `runViaApi` throws ``Couldn't run tests through the Doc Detective API: <cause>.`` The CLI prints it and exits `2`.
  The causes are `couldn't reach it (<code>)`, `<step> returned HTTP <status>`, with the API's error in parentheses
  when it sends one, `the run didn't finish in <n> seconds`, and `its report isn't valid JSON`.
- The `--dry-run` plan leaves out `_`-prefixed keys on the config and on each spec. Users can't write such keys there,
  because both reject unknown keys.

### Consequences

- Good: any results file a run writes validates, so a script can check one before reading it.
- Good: `summary.steps` matches the steps a user wrote.
- Good: an API failure exits `2` with a reason, instead of a report the reporters misread.
- Bad: a script that looked for a routing failure as its own step now finds it on the step that routed.
- Neutral: a routed step that `FAIL`s carries two sentences in `resultDescription` when it already had one.

### Confirmation

- `test/cli-contract.test.js` validates the reports of a passing, failing, filter-miss, all-skipped, routed, empty,
  and headless Chrome run against `report_v3`, and a `--dry-run` plan against `resolvedTests_v3`. It checks the
  routing reason and counts, the empty report's keys, and the exit code of an unreachable API.
- `test/utils.test.js` covers each `runViaApi` failure message.
- `test/core-core.test.js` covers the unknown target on the run and skip paths, and the loop cap.
- Fixture: `cli/report-contract.spec.json` runs a routed, a skipped, and an empty input through the CLI and validates
  each results file.

## Pros and Cons of the Options

### A. Fix the output

- Good: the schema stays a real contract, and the reports say what happened.
- Bad: a routing failure moves, which scripts may notice.

### B. Loosen the schema

- Good: no output changes.
- Bad: an action-less step would become valid, and `summary.steps` would still count it.

### C. Validate at runtime

- Good: catches every future drift.
- Bad: it costs time on every run, and silently dropping data is worse than a test that fails.
