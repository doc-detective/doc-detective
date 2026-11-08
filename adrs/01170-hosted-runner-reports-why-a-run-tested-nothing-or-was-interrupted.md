---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Hosted runner reports why a run tested nothing or was interrupted

## Context and Problem Statement

`bin/runner-entrypoint.js` runs the CLI on the hosted platform and posts a finalize body: a status, the exit code,
and `summary.reason`. [ADR 01146](01146-cli-v5-contract.md) gives each CLI 5 exit code a meaning, but the runner
mapped only `0`, `1`, and `143`:

- Exit `2` (no specs, every spec skipped, or an invalid spec) finalized as `failed` with `nonzero_exit`, the same as
  a crash. The user can fix it in their content, but the platform couldn't tell them so.
- Exit `130` (SIGINT) finalized as `failed`, not `canceled`.
- A repository config with `exitOnFail: false` turns failed, empty, and all-skipped runs into exit `0`, so the
  platform showed them as passing.

How should the runner report these outcomes?

## Decision Drivers

- The exit code is the CLI's outcome contract (ADR 01146). The runner shouldn't re-derive it from results.
- The platform needs one reason per outcome it renders differently.
- A repository's own config mustn't hide a failure from the platform.

## Considered Options

- **A. Map exit `2` and `130` to their own reasons, and force `exitOnFail: true`.**
- **B. Read the results file to classify the run.**
- **C. Keep the generic mapping.**

## Decision Outcome

Chosen option: **A**. A pure `finalizeBodyFor(exitCode, canceledBySignal)` maps the exit code:

| Exit | Finalize status | `summary.reason` |
|---|---|---|
| `0` | `succeeded` | none |
| `1` | `succeeded` | `tests_failed` |
| `2` | `failed` | `nothing_tested` (was `nonzero_exit`) |
| `130` | `canceled` | `interrupted` (was `failed`, `nonzero_exit`) |
| `143`, or SIGTERM | `canceled` | `sigterm` |
| other | `failed` | `nonzero_exit` |

`buildEffectiveConfig` sets `exitOnFail: true`, as it already pins `output` and `outputDir`.

### Consequences

- Good: the platform can show "nothing tested" apart from a crash, and an interrupted run as canceled.
- Good: a repository config can't turn a failed run green on the platform.
- Neutral: exit `2` also covers usage and config errors. The runner builds the config, so on the platform those
  mean a runner bug, and `nothing_tested` is still the closest reason.
- Neutral: a project that set `exitOnFail: false` gets the same results file, but its runs now finalize by the real
  outcome.

### Confirmation

`test/runner-entrypoint.test.js` covers every row of the table through `finalizeBodyFor`, and asserts that
`buildEffectiveConfig({ exitOnFail: false }, ...)` returns `exitOnFail: true`.

## Pros and Cons of the Options

### A. Exit-code reasons and a forced exitOnFail

- Good: a few lines, and it follows the contract the CLI already guarantees.

### B. Classify from the results file

- Bad: duplicates the CLI's outcome logic, and a crash may write no results.

### C. Generic mapping

- Bad: a fixable content problem looks like a platform failure.
