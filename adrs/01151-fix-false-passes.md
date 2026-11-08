---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Fix checks that pass without testing anything

Amends [ADR 01014](01014-expression-error-contract.md) for conditions and `step.variables`. Supersedes
[ADR 00083](00083-duplicate-test-id-disambiguation.md), whose ID rewrite no longer exists.

## Context and Problem Statement

[ADR 01146](01146-cli-v5-contract.md) makes the exit code the contract, so a green run has to mean the checks
ran. Several checks report success without testing anything. Fixing any of them after 5.0 would turn green
pipelines red, which is a breaking change. Which should land in 5.0, and what should each do instead?

## Decision Drivers

- A check that can't run must not pass.
- Text in docs legitimately contains `$$` and `$VAR`, so resolving text must keep leaving it alone.
- Fix each problem in the shared function every caller goes through.

## Considered Options

- **A. Fix them all in 5.0, each failing the narrowest thing it can.**
- **B. Fix only the reported issues (#424, #216), and defer the rest to 5.x as warnings.**
- **C. Keep the behavior, and document it.**

## Decision Outcome

Chosen option: **A**.

### Conditions

`evaluateAssertion` is false when the condition can't be evaluated. That means an evaluation error, a result
of `null`, or plain text with no `$$` reference, operator, or helper call, such as an unset `$VAR`. So an
assertion fails, and an `if` skips with a warning.

`jq()` now runs synchronously inside the evaluator, after being awaited up front. `jq(x, ".a") == 1` compares
the result rather than a Promise, and a bad query can't cause an unhandled rejection. Conditions can no longer
use plain numbers or words as a truthy value: `"1"` and `"yes"` are false.

### Variables

In `step.variables`, a failed evaluation, such as a bad `jq()` query, fails the step. This reverses ADR 01014's
option C for that path. A missing `$$value`, an unset `$VAR`, and a literal `$$` stay literal, because docs
rely on that. `{{...}}` keeps preserving its original text on failure.

### Invalid specs

These make the spec invalid, so a strict run exits `2`, and `--no-exit-on-fail` warns and skips:

- A step with more than one action. `step_v3` moves from `anyOf` to `oneOf`, because only one action ran.
- A duplicate authored `testId` within a spec. Inline, the second test merged into the first. In a spec file,
  both ran under one ID and shared artifact folders.
- A missing `before` or `after` file. This dropped the whole spec at debug level.

Duplicate `specId`s across files and generated ID collisions stay as they are. Both tests still run, so they
aren't false passes.

### Steps

Step `assertions` written as objects fail the step. That's the report's shape, which has to stay valid for
reports, but the runner only acts on strings, so nothing was checked.

A command that can't start fails with a message saying so, rather than `exit code -2`. It already failed, so
this only changes the message.

### Not changed

Exceeding `maxVariation` stays a `WARNING`, which exits `0`. Visual drift doesn't fail CI by design. The schema
descriptions now say so, and they call the value a fraction.

### Consequences

- Good: a green run means the checks ran.
- Bad: suites with these mistakes turn red on upgrade. That's the point, but it adds to the migration.
- Bad: `if: "1"` and similar truthy literals change meaning, without a warning at validation time.
- Neutral: `doc-detective-common`'s `validate()` also rejects multi-action steps.

### Confirmation

`test/false-passes.test.js` covers each case by unit and through the real CLI, and
`test/core-artifacts/cli/false-passes.spec.json` runs them in the fixture jobs.

## Pros and Cons of the Options

### A. Fix them all

- Good: one migration, and the contract holds on day one.
- Bad: a larger upgrade guide.

### B. Fix only the reported issues

- Good: a smaller change.
- Bad: the rest either need a major or stay broken, since a warning exits `0`.

### C. Document the behavior

- Good: nothing turns red.
- Bad: "a green run means tests ran and passed" stays untrue.
