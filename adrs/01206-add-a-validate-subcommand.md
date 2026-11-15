---
status: accepted
date: 2026-11-14
decision-makers: [hawkeyexl]
---

# Add a `validate` subcommand that checks test files without running them

Builds on [ADR 01146](01146-cli-v5-contract.md) and [ADR 01199](01199-reject-invalid-specs-from-runtests-by-default.md).

## Context and Problem Statement

Authors and agents want to know whether their spec files and inline tests are valid before they run anything. The
only way to ask today is `doc-detective run --dry-run`. That also resolves the tests and prints the whole test plan.
It exits `2` for an invalid spec, the same code as a bad config or a usage error. A script can't tell "your tests
are wrong" from "the command couldn't start". The agent skill that validates specs uses `--dry-run` as a workaround
for exactly this.

Detection already validates every spec file (`spec_v3`) and inline test (`test_v3`), and records each failure with a
readable summary. How should users reach that check on its own?

## Decision Drivers

- One command answers "are these tests valid?" and runs nothing.
- The exit code tells invalid tests apart from a command that couldn't proceed.
- The same files are found as in a run, from the same flags and config.
- No new config keys or flags.

## Considered Options

- **A. A `validate [inputs...]` subcommand over the detection pass.**
- **B. A `--validate-only` flag on `run`.**
- **C. Keep `--dry-run` and document it as the validator.**

## Decision Outcome

Chosen option: **A**. `doc-detective validate [inputs...]` takes the input flags (`-i`, `-c`, and the positional
inputs) and the global flags. It loads config, runs detection, and reports each file that holds tests or claims to be
a spec. It doesn't resolve tests, check for updates, or start browsers.

| Code | Meaning |
|---|---|
| `0` | At least one test was found, and every spec and inline test is valid. |
| `1` | At least one spec or inline test is invalid. |
| `2` | Usage error, bad config, or no tests found. |

An invalid test exits `1`, not `2` as it does in a run. For `run`, an invalid spec means nothing valid was tested,
so the command couldn't do its job. For `validate`, finding invalid tests *is* the job, the way a linter exits `1`
when it finds problems and `2` when it can't run. `exitOnFail` doesn't apply.

stdout carries the result: for each invalid file, ``Couldn't validate `<path>`.`` and the schema summary, then a
`Checked N files: X valid, Y invalid.` line. `--json` prints `{ "valid", "files": [{ "path", "valid", "errors" }] }`
instead. With no tests found, stderr says so and names `--input`.

### Consequences

- Good, because scripts and agents get a validator with an exit code they can trust.
- Good, because it reuses detection, so `validate` and `run` can't disagree about which files are valid.
- Bad, because there's one more command to document and keep in step with `run`'s input handling.
- Neutral, because a document with no tests in it now logs its skip at `debug`, not `warning`, in both `run` and
  `validate`. Validating a docs folder would otherwise print one warning per prose page, none of them actionable.

### Confirmation

[test/cli-contract.test.js](../test/cli-contract.test.js) spawns the CLI and asserts each exit code, the stdout lines,
and the `--json` shape. [test/core-artifacts/validate/](../test/core-artifacts/validate) runs the command through the
fixture gate.

## Pros and Cons of the Options

### A. A `validate [inputs...]` subcommand over the detection pass

- Good, because the name says what it does, and it gets its own exit codes.
- Good, because it takes only the flags that matter to finding files.

### B. A `--validate-only` flag on `run`

- Good, because it's one flag.
- Bad, because `run`'s other flags (reporters, output, filters) would mean nothing alongside it.
- Bad, because it would need different exit codes from the command it's attached to.

### C. Keep `--dry-run` and document it as the validator

- Good, because nothing new ships.
- Bad, because invalid tests and a broken command share exit `2`.
- Bad, because the output is a test plan, not a verdict.
