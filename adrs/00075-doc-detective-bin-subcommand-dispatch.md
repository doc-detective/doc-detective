---
status: accepted
date: 2024-03-08
decision-makers: doc-detective maintainers
---

# doc-detective bin with subcommand dispatch and auto-loaded config

## Context and Problem Statement

The wrapper exposed separate CLI entrypoints per capability, but as `runTests`, `runCoverage` (and
later analysis) grew, users needed one stable command that selected the operation by subcommand.
Users also expected the tool to pick up a project-local config automatically rather than always
passing `--config`. What should the CLI command surface be, and how should a project config file be
discovered?

## Decision Drivers

* A single `doc-detective` binary is more discoverable than several per-mode entrypoints.
* Subcommand dispatch (`runTests`, `runCoverage`) keeps one bin while preserving distinct operations.
* Output paths should derive from the selected operation's config block, falling back to the global
  `output`.
* A project-local config should "just work" with CLI args still able to override it.

## Considered Options

* **A. A `doc-detective` bin whose `main(argv)` dispatches on the subcommand, derives the output dir
  per operation, and auto-loads `.doc-detective.json` from CWD before overlaying CLI args** (chosen).
* **B. Keep separate per-mode binaries.**
* **C. Single bin, but require an explicit `--config` (no auto-discovery).**

## Decision Outcome

Chosen option: **A**, across two inventory rows:

1. **Bin + dispatch** (`doc-detective`, commits `2a46f67c`…`21b3e78d`): `package.json` declares
   `bin: { doc-detective }`; `src/index.js` `main(argv)` switches on the subcommand
   (`runTests`/`runCoverage`). The output directory is taken from `runTests.output` /
   `runCoverage.output`, falling back to the global `output`; result files are written as
   `${type}-${Date.now()}.json`.
2. **Auto-loaded config** (`doc-detective`, commit `0602caa7`): if `.doc-detective.json` exists in
   CWD it is loaded and then **CLI args overlay it** (precedence file → args), so a project config is
   picked up automatically while flags still win.

## Pros and Cons of the Options

### A. Single bin + subcommand dispatch + auto-config (chosen)
* Good: one discoverable command; per-operation output dirs; zero-config local runs.
* Bad: the dispatcher must keep subcommand routing and output-dir fallback in sync.

### B. Separate per-mode binaries
* Good: trivial routing.
* Bad: more bins to document/install; no shared dispatch.

### C. Single bin, explicit config only
* Good: explicit and predictable.
* Bad: forces `--config` on every invocation in a project.

### Consequences

* Good: a stable `doc-detective <subcommand>` UX; project config auto-discovery.
* Good: timestamped result files keyed by operation type.
* Bad: file-then-args precedence is implicit and must be documented to avoid surprise.
* Neutral: the subcommand surface (`runCoverage`) is later removed in the 3.0.0 redesign.

### Confirmation

`bin: { doc-detective }` + `main(argv)` dispatch (`2a46f67c`…`21b3e78d`); `.doc-detective.json`
auto-load via `fs.existsSync` → `setConfig` (`0602caa7`).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `2a46f67c`…`21b3e78d`,
`0602caa7`. Inventory ref: BACKFILL-INVENTORY.md Seq 108, 111. Related: `00035` (coverage feature),
`00108` (3.0.0 wrapper redesign — runTests-only).
