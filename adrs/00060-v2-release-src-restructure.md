---
status: accepted
date: 2023-07-24
decision-makers: doc-detective maintainers
---

# v2.0.0 release: restructure the wrapper into src/ with runTests/runCoverage/suggestTests

## Context and Problem Statement

The 2.0.0 wrapper release consolidated several earlier decisions — the `config_v2` CLI contract
(ADR 00054), the default fileTypes/markup map (ADR 00055), and the coverage/suggest entrypoints —
into a single coherent package layout. The pre-2.0 wrapper carried legacy CLI scaffolding, a sample
config, and Jekyll documentation that no longer matched the new contract. How should the package be
organized for 2.0.0 so the three public entrypoints are clearly separated and the stale assets are
removed?

## Decision Drivers

* The three entrypoints (run tests, run coverage, suggest tests) should be cleanly separated modules.
* The sample config should reflect the new `fileTypes`/markup contract, not the old format.
* Legacy CLI scaffolding and outdated docs should be removed, not left to confuse users.
* The restructure should mark a clean 2.0.0 boundary.

## Considered Options

* **A. Restructure into `src/` with `runTests.js`, `runCoverage.js`, `suggestTests.js`, `utils.js`; new fileTypes/markup sample config; remove legacy CLI, sample, and Jekyll docs** (chosen).
* **B. Keep the existing flat layout and bolt new entrypoints alongside the old files.**
* **C. Split each entrypoint into its own package.**

## Decision Outcome

Chosen option: **A**, because a single `src/`-organized package with one module per entrypoint is the
clearest expression of the 2.0.0 surface without fragmenting it across packages. The wrapper is
restructured under `src/` with `runTests.js`, `runCoverage.js`, `suggestTests.js`, and `utils.js`; a
new sample config reflects the `fileTypes`/markup contract; and the legacy CLI scaffolding, old sample
config, and Jekyll documentation are removed. This is the 2.0.0 release boundary (a 46-file
restructure).

### Consequences

* Good: three entrypoints are clearly separated and discoverable under `src/`.
* Good: stale CLI/sample/docs gone, removing confusion against the new contract.
* Bad: a large 46-file move makes 2.0.0 a hard cutover with no overlap with the old layout.
* Neutral: `runCoverage`/`suggestTests` are first-class here; both were later removed at 3.0.0.

### Confirmation

Shipped in `doc-detective` `95e3c848` (the 2.0.0 release). Confirmed by the `src/` layout with the
three entrypoint modules and the removal of the legacy CLI/sample/Jekyll assets.

## Pros and Cons of the Options

### A. src/ restructure with three entrypoint modules
* Good: clear, discoverable surface; stale assets removed; clean 2.0.0 boundary.
* Bad: large one-shot restructure with no transitional overlap.

### B. Keep flat layout, add entrypoints alongside
* Good: smaller diff.
* Bad: old and new files coexist; the contract stays muddy.

### C. One package per entrypoint
* Good: maximal separation.
* Bad: premature fragmentation; heavier release/versioning overhead.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective` commit `95e3c848` (v2.0.0).
Inventory ref: BACKFILL-INVENTORY.md Seq 87. Bundles the v2 CLI contract (ADR 00054) and default
fileTypes (ADR 00055); `runCoverage`/`suggestTests` were later removed from the test surface at
3.0.0 (ADR 00103, 00108).
