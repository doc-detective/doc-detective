---
status: accepted
date: 2022-08-16
decision-makers: doc-detective maintainers
---

# Programmatic run API

## Context and Problem Statement

Doc Detective began life as a CLI that resolved its configuration from `argv`. Embedding it in
another Node program — a build script, a CI harness, a higher-level tool — was impossible because
the run path assumed command-line arguments existed. The project needed an exported function that
callers could invoke with an in-memory config object and no `argv`. What should that programmatic
entrypoint look like, and how should config resolution behave when there are no command-line
arguments?

## Decision Drivers

* Other Node code must be able to run Doc Detective without shelling out to the CLI.
* Config supplied in memory must be honored without requiring a config file on disk or `argv.config`.
* The CLI and the programmatic path should converge on the same resolution logic.
* Spurious child-process noise (ffmpeg output) should not leak into embedding programs.

## Considered Options

* **A. Export `run(config)` then `run(config, argv)`, with `setArgs`/`setConfig` no-oping when argv is absent** (chosen).
* **B. Keep CLI-only; require callers to `spawn` the CLI binary.**
* **C. A separate library package distinct from the CLI.**

## Decision Outcome

Chosen option: **A**, because exporting a function that resolves config in-process is the direct way
to make the tool embeddable while reusing the existing resolution code. The contract evolved across
two commits:

1. `run(config)` was exported for programmatic use; `setArgs`/`setConfig` became no-ops when `argv`
   is absent, and ffmpeg output was silenced (commit `d1d18d9`, `1fc9717`).
2. The signature widened to `run(config, argv)` with full in-memory config resolution — it no longer
   requires `argv.config`; a dedicated `cli/index.js` entrypoint was split out, and `setArgs`
   returns `{}` when there are no arguments (commit `cb84e40`, `d04968b`).

The result: `setConfig` accepts an in-memory config object, so both the CLI and embedding callers
land on the same resolution path.

### Consequences

* Good: Doc Detective is embeddable in any Node program via `run(config[, argv])`.
* Good: CLI and programmatic callers share one config-resolution path.
* Neutral: introduces a `cli/index.js` entrypoint separate from the library surface.
* Bad: two ways in (with/without argv) add surface that must stay behaviorally consistent.

### Confirmation

Shipped in commits `d1d18d9`, `1fc9717` (export + no-op argv) and `cb84e40`, `d04968b` (`run(config,
argv)` + `cli/index.js`). Confirmed by `setConfig` accepting in-memory config and `setArgs`
returning `{}` absent argv.

## Pros and Cons of the Options

### A. Exported `run(config[, argv])`
* Good: embeddable; shared resolution; ergonomic.
* Bad: dual entry shapes to keep consistent.

### B. CLI-only + spawn
* Good: no new API.
* Bad: brittle, slow, no structured return to callers.

### C. Separate library package
* Good: clean separation.
* Bad: premature packaging split; duplicate resolution logic risk.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `d1d18d9`, `1fc9717`,
`cb84e40`, `d04968b`. Inventory ref: BACKFILL-INVENTORY.md Seq 27, 28.
