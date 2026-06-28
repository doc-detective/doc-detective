---
status: accepted
date: 2024-07-24
decision-makers: doc-detective maintainers
---

# `relativePathBase` enum and a public `resolvePaths` export

## Context and Problem Statement

Tests reference files by relative path (setup/cleanup specs, saved screenshots, download targets).
A relative path is ambiguous: relative to the current working directory, or to the file that
declared it? Without an explicit rule, the same test resolves differently depending on where the
process was launched. How should Doc Detective decide the base for relative paths, and expose
that resolution so callers and the runner share one implementation?

## Decision Drivers

* Relative paths must resolve predictably regardless of the process's cwd.
* Authors sometimes want paths relative to the declaring file, sometimes to cwd.
* Resolution logic should be a single shared, exported function, not duplicated per call site.
* Validation should return the resolved object so downstream code sees normalized paths.

## Considered Options

* **A. Add a `relativePathBase` config enum (`cwd`/`file`, default `cwd`) and export a public
  `resolvePaths(config, object, file, …)`; have `validate()` return `result.object`; resolve
  setup/cleanup relative to the declaring file** (chosen).
* **B. Always resolve relative to cwd.**
* **C. Always resolve relative to the declaring file.**

## Decision Outcome

Chosen option: **A**, because authors legitimately want both bases and a config enum lets them
choose per run while keeping a sensible default. The contract added config `relativePathBase`
(enum `cwd`/`file`, default `cwd`), a public `resolvePaths(config, object, file, …)` export, made
`validate()` return `result.object`, and resolved setup/cleanup paths relative to the declaring
file (common `67afcc58`, `74dcd63f`, `f44268e8`; core `e81f9da9`, `a657675b`, `4a15af63`, Seq 127).
The wrapper adopted an async `setConfig` with `resolvePaths(configPath)` shortly after
(doc-detective `a1e8e03`, `e29b082`, 2024-07-26).

### Consequences

* Good: relative paths resolve deterministically; the base is author-selectable.
* Good: one shared `resolvePaths` export removes per-call-site duplication.
* Good: `validate()` returning the resolved object normalizes downstream consumers.
* Neutral: default stays `cwd`; opting into `file` changes existing relative-path meaning.
* Bad: the wrapper's `setConfig` had to become async to call `resolvePaths`.

### Confirmation

Shipped across common `67afcc58`/`74dcd63f`/`f44268e8` and core `e81f9da9`/`a657675b`/`4a15af63`,
with wrapper adoption in `a1e8e03`/`e29b082`. `relativePathBase` is part of the config schema;
`resolvePaths` is a public export.

## Pros and Cons of the Options

### A. `relativePathBase` enum + public `resolvePaths`
* Good: author-selectable base; shared resolver; normalized validate output.
* Bad: introduces an async setConfig at the wrapper.

### B. Always cwd
* Good: one rule.
* Bad: breaks file-relative authoring; cwd-dependent.

### C. Always file
* Good: portable per-file paths.
* Bad: removes the cwd use case some workflows expect.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `67afcc58`,
`74dcd63f`, `f44268e8`; doc-detective-core commits `e81f9da9`, `a657675b`, `4a15af63`; wrapper
commits `a1e8e03`, `e29b082`. Inventory ref: BACKFILL-INVENTORY.md Seq 127. Related: `00032`
(config precedence), later `00110` (input/output arg path resolution).
