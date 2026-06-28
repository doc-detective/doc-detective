---
status: accepted
date: 2025-05-27
decision-makers: doc-detective maintainers
---

# Expose configPath in the merged config object

## Context and Problem Statement

The CLI wrapper resolves a config file (e.g. `.doc-detective.json`), validates it, and overlays CLI
overrides to produce the merged `config` object that runtime code reads. Runtime consumers
increasingly needed to know *where* the config file came from — for resolving paths relative to the
config file, for diagnostics, and for reporting — but the file's location was discarded once the
object was loaded. The question: should the config-file path be surfaced as a first-class field on
the merged `config` so runtime code can read it without re-deriving it?

## Decision Drivers

* Runtime code reads from `config` only; it should not have to re-discover the config-file location.
* Path resolution and diagnostics need the config base path.
* The addition must be backward compatible (extra optional field, no behavior change when absent).

## Considered Options

* **A. Set `config.configPath` to the resolved config-file location during config assembly** (chosen).
* **B. Pass the path separately as a function argument through the call chain.**
* **C. Re-derive the path at each consumption site.**

## Decision Outcome

Chosen option: **A**, because the merged `config` object is already the single channel every runtime
consumer reads from, so the location belongs there too. During config assembly the wrapper sets
`config.configPath = configPath` (the resolved config-file location), and the same change collapsed
the validation-error logging. Commit `821cfef3`.

### Consequences

* Good: runtime code knows the config-file location via `config.configPath` with no re-derivation.
* Good: supports path-relative resolution and diagnostics from a single field.
* Neutral: an additional optional field on the merged config; unset when no config file is used.
* Bad: one more piece of state to keep accurate if config loading is refactored.

### Confirmation

Shipped in doc-detective commit `821cfef3` (`config.configPath = configPath`). Confirmed by the
presence of `configPath` on the merged config and its use at downstream path-resolution sites.

## Pros and Cons of the Options

### A. config.configPath field
* Good: single channel; no re-derivation; backward compatible.
* Bad: extra state to maintain.

### B. Thread the path as an argument
* Good: explicit.
* Bad: touches every signature in the chain; easy to forget.

### C. Re-derive per site
* Good: no shared state.
* Bad: duplicated, error-prone discovery logic.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `821cfef3`. Inventory ref:
BACKFILL-INVENTORY.md Seq 171. Related: `00086` (`relativePathBase` + `resolvePaths`).
