---
status: accepted
date: 2026-05-02
decision-makers: doc-detective maintainers
---

# Dry-run flag

## Context and Problem Statement

Users wanted to know *what* Doc Detective would run — which specs, tests, contexts, and steps it
resolves from their documentation — without paying for browser launches, Appium drivers, or HTTP
calls. There was no way to validate detection and resolution in isolation, so any "is my config
wired correctly?" check meant a full execution. How should Doc Detective expose a resolve-only mode,
and what work must it skip to make that mode cheap and side-effect free?

## Decision Drivers

* Authors need a fast feedback loop on detection/resolution without executing steps.
* CI smoke checks want to confirm a config resolves tests before committing to a full run.
* A dry run must avoid expensive/side-effecting setup (driver start, app detection, step execution).
* The flag must flow through the merged `config` object like every other knob, not bypass it.
* The mode must be discoverable in the `config_v3` schema, not just a hidden CLI flag.

## Considered Options

* **A. A `--dry-run` flag mapped to `config.dryRun` that resolves but does not execute, and short-circuits app detection** (chosen).
* **B. A separate `resolve`/`detect` subcommand instead of a flag.**
* **C. Execute everything but no-op the side effects internally.**

## Decision Outcome

Chosen option: **A**, because a boolean on the existing run path reuses all detection/resolution
wiring and stays in the merged-config contract. The contract landed in two steps:

1. `--dry-run` maps to a `config.dryRun` boolean field added to `config_v3`; the CLI/utils/core
   path resolves specs and tests but does not execute steps (commit `a0bdb193`, PR #292).
2. Dry run additionally skips `getAvailableApps()` app detection, leaving `environment.apps` empty
   so no browser/driver probing occurs (commit `a3a36ca4`).

Net: `dryRun: true` produces a resolved test tree and a populated report shape with no driver
start, no app detection, and no step side effects.

### Consequences

* Good: fast, side-effect-free validation of detection and resolution.
* Good: `environment.apps` is intentionally empty under dry run — no probing cost.
* Neutral: report reflects resolution only; step verdicts are not produced.
* Bad: callers must know that an empty `environment.apps` is expected under dry run, not a failure.

### Confirmation

`config_v3` carries the `dryRun` field; the dry-run guard in `config.ts` skips `getAvailableApps()`.
Shipped in `a0bdb193` (PR #292) and `a3a36ca4`.

## Pros and Cons of the Options

### A. `--dry-run` → `config.dryRun`
* Good: reuses the run path; in-schema; skips the costly app-detection step.
* Bad: a partially-populated report can surprise callers expecting verdicts.

### B. Separate subcommand
* Good: explicit verb.
* Bad: duplicates resolution wiring; diverges from the flag→config convention.

### C. Internal no-op of side effects
* Good: one code path.
* Bad: still starts drivers/detection; not actually cheap.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `a0bdb193` (PR #292),
`a3a36ca4`. Inventory ref: BACKFILL-INVENTORY.md Seq 224, 230. Related: `00160` (`--test`/`--spec`
filters), `00170` (`debug` subcommand diagnostic dump).
