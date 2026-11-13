---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Output modes compose or refuse

Amends [ADR 01146](01146-cli-v5-contract.md).

## Context and Problem Statement

Four run options write results: `--json`, `--plain`, `--output`, and `--dry-run`. `--output` and `dryRun` also
have config keys. Some pairs did something nobody asked for:

- **`--json --plain`, and `--plain` with `--output -`.** Both wrote stdout, so stdout held a JSON document and
  tab-separated lines, and neither parsed.
- **`--dry-run --plain`.** The dry run printed its JSON plan, and `--plain` did nothing.
- **Config `output: "-"`.** The docs say `-` means stdout. From config, the run wrote a file named `-`.
- **`--output -` with a config `output` file.** The run wrote both, where every other flag beats its config key.
- **`--dry-run --output <file>`.** The plan printed, and the file stayed unwritten.

Commander's `.conflicts()` can't catch these: it sees neither the `-` value of `--output` nor config. Which pairs
compose, and how do the others fail?

## Decision Drivers

- stdout holds one machine-readable document or one line format, never two.
- A flag beats its config key, for `output` as for every other key (ADR 01165).
- A usage error exits `2` with one line on stderr, in the shape of the existing both-set errors.
- A key means the same thing from a flag and from config.

## Considered Options

- **A. Refuse the pairs that share stdout, and compose the rest.**
- **B. Let one mode win silently, such as `--json` over `--plain`.**
- **C. Keep today's behavior, and document it.**

## Decision Outcome

Chosen option: **A**.

### Usage errors

`setConfig` checks the merged options once, after the flag overrides. The first match throws. The CLI prints it
with an `Error:` prefix and exits `2`:

| Combination | stderr |
|---|---|
| `--json --plain` | ``Error: set `--json` or `--plain`, not both.`` |
| `-o - --plain`, or config `output: "-"` with `--plain` | ``Error: set `--output -` or `--plain`, not both.`` |
| `--dry-run --plain`, or config `dryRun: true` with `--plain` | ``Error: set `--dry-run` or `--plain`, not both.`` |

`--no-dry-run` beats a config `dryRun`, so `--no-dry-run --plain` runs.

### Combinations that compose

- **`--output` and config `output`.** The flag wins. `-o -` drops a config file, and `-o <file>` drops a config
  `-`. Either `-` prints the results on stdout and writes no file.
- **`--dry-run --output <file>`.** The plan goes to the file and to stdout.
- **`--plain --output <file>`.** Lines go to stdout, and the results go to the file.
- **`--json --output -`.** Both mean stdout, so the results print once.

The verdict line reads the stdout modes from `config`, not `args`, so config `output: "-"` drops it too.

### Consequences

- Good: stdout always parses as what the flags promise.
- Good: config `output: "-"` does what the docs say.
- Bad: a command that passed `--plain` with one of the others now exits `2`. The upgrade guide lists it.
- Bad: a job that relied on `--output -` writing a config `output` file too gets only stdout.

### Confirmation

- `test/cli-contract.test.js`, "output modes": each usage error, with its exact stderr and exit `2`. Also the
  dry-run file, config `output: "-"`, and both precedence directions.
- Fixtures: `cli/output-modes.spec.json`, through `cli/precedence.cjs`, with one case per row above.

## Pros and Cons of the Options

### A. Refuse what shares stdout, compose the rest

- Good: every accepted command does one predictable thing.
- Bad: one more usage error to learn.

### B. Let one mode win silently

- Good: nothing new exits `2`.
- Bad: a script that asked for `--plain` gets JSON, and doesn't find out until it fails to parse.

### C. Keep today's behavior

- Good: no change.
- Bad: stdout can hold two formats at once, and config `-` writes a stray file.
