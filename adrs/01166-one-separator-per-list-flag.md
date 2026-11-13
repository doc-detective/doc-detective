---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# One separator per list flag

## Context and Problem Statement

The 5.0 release candidate's list flags each split differently:

- `-r, --reporters <names...>` was variadic. It swallowed space-separated words until the next flag, so
  `doc-detective run -r json docs/` read `docs/` as a reporter and exited `2` with `Unknown reporter: docs/`.
  `-r json,html` failed with `Unknown reporter: json,html`.
- `-i`, `-t`, and `-s` split on commas, but a repeated `-i a -i b` silently kept only `b`.
- `install agents --agent <id...>` was variadic too, though its help said "repeatable".
- `--concurrent-runners` took `auto` or a number, while config takes `true` or a number, and the 4.x upgrade notes
  say `true`.
- Config `reporters` took any string. `"JSON"` passed because the lookup ignored case, and so did the internal
  `"plainReporter"`.

[ADR 01146](01146-cli-v5-contract.md) § "Argument parser" moved the CLI to commander, which validates flag values.
That left dead code in `setConfig`. Some blocks warned about and ignored bad values that commander now rejects.
A hand-written reporter check and a `fileTypes` fallback were dead too, since the schema covers both. The JS API also still
returned `null` for an empty run and printed a dry run's plan to stdout.

## Decision Drivers

- One rule a person or an agent can learn once: a positional is space-separated, a `<list>` option is
  comma-separated and given once.
- Losing data silently is worse than an error.
- The old space form can't be an alias, because it's what swallows positional inputs.
- A library mustn't write to stdout, and one function returns one type.

## Considered Options

- **A. One comma-separated value per list option, given once. A repeat is a usage error.**
- **B. Commas or repeats, merged.** `-i a -i b` means `a,b`.
- **C. Keep `-r` variadic, and make the others match.**

## Decision Outcome

Chosen option: **A**.

| Flag | Before (v5-rc) | After |
|---|---|---|
| `-r, --reporters` | `<names...>`, variadic (eats positionals) | `<names>`, comma-separated, given once, each validated |
| `-i, --input` / `-t, --test` / `-s, --spec` | comma; a repeat silently keeps the last | comma, given once; a repeat is a usage error |
| `install agents --agent` | `<id...>`, variadic | `<ids>`, comma, given once |
| `--concurrent-runners` | `auto` or N | `auto`, `true` (same as `auto`, matching config), or N ≥ 1 |

- A commander `argParser`, `commaList()`, rejects a second occurrence and checks each name against its choices.
  It returns the raw value, and `setConfig` still does the split, so flags and config files land on the same
  array.
- Config `reporters` is an enum of the six public names. `"JSON"` and `"plainReporter"` fail with the shared
  error format from [ADR 01150](01150-reject-unknown-keys-on-specs-and-steps.md). `--json` and `--plain` carry
  their stdout reporters on a hidden `config._stdoutReporters`, so they never reach validation.
- An empty `reporters` list means no reporters, in `outputResults` and in the run-folder gate alike. So
  `--json -r terminal` prints only the JSON and leaves no empty run folder.
- The postinstall prompt passes its agents as one `--agent` list.
- The dead warn-and-ignore blocks, the reporter check, and the `fileTypes` fallback are deleted.
- The runtime log level `"warn"` becomes `"warning"`, the level `log()` already uses, and the three mapping
  shims go.
- Help says exit `0` means "No test failed, and at least one passed or warned".
- The JS API changes are recorded as an amendment to [ADR 01152](01152-trim-the-public-js-api.md).

Ladder:

```
doc-detective                                     # terminal,runFolder
doc-detective -r junit
doc-detective -r terminal,junit,markdown --output-dir reports
doc-detective run -r json docs/                   # now tests docs/
doc-detective run docs/ api/ -i extra.md -t login,smoke -s auth -r terminal,junit -o out.json --output-dir reports --concurrent-runners true
doc-detective -r foo                → error: option '-r, --reporters <names>' argument 'foo' is invalid. Allowed choices are terminal, json, html, runFolder, junit, markdown.   (exit 2)
doc-detective -r json -r html       → error: option '-r, --reporters <names>' argument 'html' is invalid. Give it once, as a comma-separated list: json,html.   (exit 2)
doc-detective -i a -i b             → error: option '-i, --input <paths>' argument 'b' is invalid. Give it once, as a comma-separated list: a,b.   (exit 2)
doc-detective -r terminal html      → error: unknown command 'html'. To use several reporters, give one comma-separated list: -r terminal,html   (exit 2)
doc-detective -r terminal docs/     → error: unknown command 'docs/'. To test a path, use: doc-detective run docs/   (exit 2, the existing message)
```

Each usage error is followed by `(add --help for usage)`.

This amends ADR 01146 § "Argument parser". The one exception to "a positional is space-separated" is
`--input`, which sits alongside `run [inputs...]`.

### Consequences

- Good: `-r json docs/` no longer loses the input, and no repeat loses data.
- Good: one separator across every list flag, config, and the docs.
- Bad: `-r terminal html`, `-r a -r b`, and `--agent a --agent b` stop working. Each error shows the comma form.
- Bad: configs with `"JSON"` or another case variant of a reporter name now fail.
- Neutral: `--concurrent-runners true` works on 4.x and 5.0 alike.

### Confirmation

- `test/cli-contract.test.js` covers each ladder row through the real CLI, the config `reporters` error, and
  `--agent` as a list.
- `test/utils.test.js` and `test/agents.test.js` cover the parser.
- `src/common/test/validate.test.js` covers the `reporters` enum.
- `test/api-contract.test.js` covers the JS API rows.
- `test/core-artifacts/reporters/reporters-list.spec.json` runs the permutations through the fixture jobs.

## Pros and Cons of the Options

### A. Comma-separated, given once

- Good: one rule, and no silent loss.
- Bad: a breaking change for the space form.

### B. Commas or repeats, merged

- Good: accepts both habits.
- Bad: two ways to write one thing, and a third for `-r`, unless `-r` stays variadic, which is the bug.

### C. Keep `-r` variadic

- Good: no change for `-r a b`.
- Bad: keeps the bug where `-r json docs/` eats the input.
