---
status: accepted
date: 2026-11-04
decision-makers: doc-detective maintainers
---

# The Doc Detective 5.0 CLI contract, conforming to clig.dev

## Context and Problem Statement

We reviewed the `doc-detective` 4.41.5 CLI rule by rule against the
[Command Line Interface Guidelines](https://clig.dev/). It met 43 rules, partly met 52, and missed 32,
and 8 didn't apply. The most harmful gaps:

- A run that tests nothing exits `0`, even with `--exit-on-fail`.
- Failing tests exit `0` by default, by the choice recorded in
  [ADR 01066](01066-exit-on-fail-cli-gate.md).
- Warnings share stdout with results, which corrupts `--dry-run` JSON.
- `--logLevel silent` still prints a summary, and color ignores piping, `NO_COLOR`, and `TERM=dumb`.
- Help has no examples or links, and run flags appear on every subcommand.

[The v5 rollout plan](../docs/design/v5-rollout.md) originally made the exit code the only breaking
change in 5.0.0. Fixing the rest would then need further majors. How should the CLI change, and how
should it reach users?

## Decision Drivers

- Users should absorb one migration, not a series of them.
- Bare `npx doc-detective` must keep running tests.
- `runtests` and `runTests` must keep working for older usage.
- A coverage subcommand is planned after 5.0, so bare words must stay free for subcommands.
- We can update our own assets, so they shouldn't hold the CLI back.
- Commands in the final drafts of the Docs as Tests books can't be updated once printed.

## Considered Options

- **A. One major with every breaking CLI change, updating our own assets to match.**
- **B. Change only the exit code in 5.0, and fix the rest additively or in later majors.**
- **C. Keep compatibility shims in the CLI for older Actions and other assets.**

## Decision Outcome

Chosen option: **A**. All CLI work lands on `feat/v5-rc` and reaches main as a single 5.0.0.

### Commands

| Command | Behavior |
|---|---|
| `doc-detective` | Runs tests. Takes flags only, which keeps bare words free for subcommands. |
| `doc-detective run [inputs...]` | Same run, plus positional inputs for shell globs. |
| `runTests`, `runtests` | Deprecated aliases of `run`. |
| `install <asset>`, `debug`, `lsp` | Same names. `lsp` keeps accepting `--stdio` because LSP clients add it. |
| `help [command...]` | Works for nested commands. |
| `runner` | Hidden. Replaces the `doc-detective-runner` bin. |

The `doc-detective-lsp` and `doc-detective-runner` bins and the hidden `install-agents` alias are
removed, and everything that calls them is updated.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All specs PASS, WARNING, or SKIPPED |
| `1` | At least one spec failed |
| `2` | Nothing valid was tested, or the CLI couldn't proceed: usage error, bad config, no specs, invalid spec, declined or refused install, crash |
| `130`, `143` | Interrupted by SIGINT or SIGTERM |

`--no-exit-on-fail` and `exitOnFail: false` turn FAIL and empty runs into `0`, and invalid specs back
into warn-and-skip. Usage and config errors stay `2`. This supersedes the default in ADR 01066.

### Streams and output

- stdout carries results only. Logs, warnings, hints, and notices go to stderr.
- `--json` prints one JSON document on stdout, and `--plain` prints one tab-separated line per test.
- `-q` shows only errors and a one-line verdict. `-l silent` silences the reporter too.
- Default logs lose their level labels. `-d` restores them and adds timestamps.
- Color goes through Node's `util.styleText`, which honors piping, `NO_COLOR`, `FORCE_COLOR`, and
  `TERM=dumb`. `--no-color` and `DOC_DETECTIVE_NO_COLOR` also turn it off.
- Interactive shells get a spinner on stderr. Everything else gets one plain line per finished test.

### Output paths

`--output <file>` is always the JSON results file, as clig defines `-o`. It's overwritten, and `-`
means stdout. A folder exits `2` and points to the new `--output-dir <dir>`. Runs no longer write
`testResults-<timestamp>.json` into the current directory by default.

### Configuration and environment

- Precedence: flags, the shell's environment, a project `.env`, project `.doc-detective.*`, then a
  new user config at `$XDG_CONFIG_HOME/doc-detective/config.json`.
- `.env` auto-loads from the current directory. Shell variables win, and `--no-env-file` turns it off.
- `DEBUG` is the broad debug switch, and `DOC_DETECTIVE_DEBUG` the narrow one. Neither replaces the
  run anymore, because `doc-detective debug` is where the dump lives.
- New installs cache under `$XDG_CACHE_HOME/doc-detective`, or `%LOCALAPPDATA%\doc-detective` on
  Windows. An existing `~/.doc-detective` keeps being used.

### Deprecated arguments

Every old argument kept for compatibility is labeled in help, and warns on stderr when used.

| Argument | Replacement |
|---|---|
| `runTests`, `runtests` | `run`, or no command |
| `--logLevel` | `--log-level` |
| `-e`, `--exit-on-fail` | Nothing needed; it's the default, so this is a no-op |

### Argument parser

The CLI moves from yargs to commander, matching `manni`. Commander's positional options, built-in
flag suggestions, and option groups fit this contract. Its `Command` tree can also be read at
runtime, so the CLI reference generator no longer parses source code.

### Deliberate departures from clig

| Rule | Reason |
|---|---|
| Single binary | Not in 5.0. A compiled binary may come later, but it would still need externally managed browsers and Appium. |
| No secrets in env vars | Env is the norm in CI. File-based alternatives are added, but env stays supported. |
| Confirm dangerous actions | Bare runs execute shell steps without asking. Tests are code, like `npm test`. |
| No analytics without consent | Telemetry stays opt-out, with a first-run notice, `--no-telemetry`, and `DO_NOT_TRACK`. Only result counts are sent. |
| Ask before changing a user's install | Self-update stays on outside CI so users stay current. It never crosses a major version. |

### Consequences

- Good: one migration, and a CLI that composes in scripts and CI.
- Good: a green result means tests ran and passed.
- Good: new subcommands inherit the same flags and exit codes.
- Bad: every asset we control must move in lockstep at GA, which raises coordination risk.
- Bad: workflows pinned exactly to Action v1.6.1 or earlier on the default `latest` get CLI 5 with no
  shim. A failing test then goes red and skips their results, issue, and PR steps.
- Bad: a long-lived RC branch has to be rebased while main keeps shipping 4.x.

### Confirmation

- `test/cli-contract.test.js` spawns the real CLI and asserts exit code, stdout, stderr, and escape
  sequences for each row of this contract. It also checks golden help text and the book commands.
- Every registered command must pass `--help`, reject foreign flags, and honor `--json`.
- Rerunning the clig review leaves only the departures above and the items deferred to 5.x.

## Pros and Cons of the Options

### A. One major with every breaking change

- Good: users migrate once, and the docs describe one coherent CLI.
- Bad: a larger release, with a larger migration guide and more soak risk.

### B. Exit code only

- Good: the smallest possible 5.0.
- Bad: stream, flag, and output-path fixes each need their own major, or never land.

### C. Compatibility shims

- Good: old Action versions keep working unchanged.
- Bad: the CLI carries code for assets we can update, and old behavior hides the new contract.
  Instead, v4-era assets refuse v5: Action v1.7 defaults to CLI 4 and rejects `version` 5 or later.
