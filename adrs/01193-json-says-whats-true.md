---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# `--json` says what's true

Amends [ADR 01146](01146-cli-v5-contract.md).

## Context and Problem Statement

ADR 01146 gave every command the global flags: `--json`, `-q`, `-d`, `-l`, `--no-color`, and `--no-input`. Two
commands accepted them and ignored them:

- **`lsp`** speaks the language server protocol on stdout. `--json` can't make that one JSON document, and the log
  flags reach none of its output.
- **`runner`** is the hosted runner. It reports to its API and reads its settings from the environment.

A third command accepted `--json` and printed something false. `install android --reset-snapshot --json` printed
`[]`, even after it reset snapshots or failed to.

A flag that's accepted reads as a promise. How should a command treat a global flag it can't honor?

## Decision Drivers

- A command rejects what it can't honor, with the usual `unknown option` error and exit `2`.
- `--json` output lists what the command did, in the shape every `install` report uses.
- No caller breaks. The GitHub Action, Online, the VS Code extension, and agent-tools' `lsp-launch.js` pass only
  `lsp --stdio` or a bare `runner`.

## Considered Options

- **A. `lsp` and `runner` take no global flags, and `--reset-snapshot` reports each AVD.**
- **B. Keep the flags, and make each command honor them.**
- **C. Keep the flags, and document that some commands ignore them.**

## Decision Outcome

Chosen option: **A**.

### `lsp` and `runner`

Neither command gets the global flags. `--no-input` is taken out of argv before parsing, so it stays in argv when
the command is `lsp` or `runner`, and commander rejects it there. `lsp --stdio` still works.

```text
$ doc-detective lsp --json
error: unknown option '--json'
(add --help for usage)
```

That's stderr, with exit `2`. The same goes for `-q`, `-d`, `-l`, `--no-color`, and `--no-input` on either
command.

### `install android --reset-snapshot --json`

One report per AVD, in the `install` report shape:

| Field | Value |
|---|---|
| `kind` | `"tool"` |
| `assetId` | The AVD name |
| `action` | `"reset"`, `"dry-run"` with `--dry-run`, or `"failed"` |
| `notes` | Only on `"failed"`: the cause |

```json
[
  { "kind": "tool", "assetId": "pixel", "action": "reset" },
  { "kind": "tool", "assetId": "tablet", "action": "failed", "notes": ["EBUSY: resource busy or locked"] }
]
```

With nothing to reset, it prints `[]`. A failure still exits `2`.

### Consequences

- Good: every flag a command accepts changes what it does.
- Good: a script reads the reset's outcome from `--json`, not from log text.
- Bad: a command line that passed a global flag to `lsp` or `runner` now exits `2`. None of ours do.
- Neutral: global flags before the command name, as in `doc-detective --json lsp`, belong to the root command.
  Commander still accepts them there.

### Confirmation

- `test/cli-parser.test.js`: `lsp` and `runner` reject each global flag with the exact two-line error and exit
  `2`, and `lsp` declares only `--stdio`.
- `test/cli-install.test.js`: `--reset-snapshot --json` with and without `--dry-run`, with nothing to reset, and
  the failed report's shape.
- Fixtures: `cli/json-truth.spec.json` for the rejected flags, and
  `apps-android/android-reset-snapshot.spec.json` for the `--json` reports.

## Pros and Cons of the Options

### A. Reject what can't be honored

- Good: the help for each command lists only what works.
- Bad: one more place where commands differ.

### B. Make each command honor the flags

- Good: one flag set everywhere.
- Bad: `lsp` can't honor `--json` at all, since the protocol owns stdout.

### C. Document the gaps

- Good: no change.
- Bad: a reader who skips the note gets a flag that silently does nothing.
