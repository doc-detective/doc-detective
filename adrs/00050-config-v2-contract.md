---
status: accepted
date: 2023-03-26
decision-makers: doc-detective maintainers
---

# Define the `config_v2` config-file contract

## Context and Problem Statement

With the v2 step family (`00046`) and v2 containers (`00049`) in place, the config schema still sat
at `config_v1` (`00043`) and no longer matched the v2 world. The config file needed a second
version that aligned its fields, defaults, and required keys with v2 — covering fileType/markup
definitions, telemetry, and sensible discovery defaults — and that fixed a `$ref` resolution quirk
where references carried a `file://` prefix. What does `config_v2` guarantee, and what defaults does
it set?

## Decision Drivers

* A config schema aligned with the v2 step/container redesign.
* Required `fileType` / `markup` / `telemetry` fields so config is complete and predictable.
* Useful out-of-the-box defaults so a minimal config "just works."
* Correct `$ref` resolution (drop the `file://` prefix) for the v2 schema graph.

## Considered Options

* **A. Author a full `config_v2` (with required fileType/markup/telemetry + defaults)** (chosen).
* **B. Patch `config_v1` in place to cover v2.**
* **C. Make most fields optional with no defaults.**

## Decision Outcome

Chosen option: **A**. `config_v2` (≈532 lines) lands as the v2-era config contract. It makes
`fileType`, `markup`, and `telemetry` fields **required**, sets defaults of `input`/`output` to
`"."` and `recursive` to `true`, and drops the `file://` prefix on `$ref`s so the v2 schema graph
resolves cleanly. This completes the v2 schema set alongside `00046` and `00049`. The matching
runner adoption (validating `config_v2`, `test()`→`runTests()`, dropping legacy analytics) is
recorded in `00051`; `config_v2` is itself superseded by the `config_v3` restructure (`00099`).

### Consequences

* Good: config matches the v2 world; a minimal config runs via sensible defaults.
* Good: correct `$ref` resolution unblocks the v2 schema graph.
* Bad: required `fileType`/`markup`/`telemetry` raise the floor for a valid config (migration cost
  from `config_v1`).
* Neutral: `telemetry` is required here but the analytics path is dropped at the runner (`00051`).

### Confirmation

`config_v2.schema.json` ships in `doc-detective-common` and validates via `validate("config_v2", …)`;
defaults (`input`/`output` = `"."`, `recursive` = true) are observable on a minimal validated
config.

## Pros and Cons of the Options

### A. Full `config_v2` with required fields + defaults
* Good: complete, predictable, v2-aligned config; good defaults.
* Bad: breaking migration from `config_v1`; large schema.

### B. Patch `config_v1`
* Good: no new version.
* Bad: muddies versioning; v1 consumers break without a clear boundary.

### C. All-optional, no defaults
* Good: lax, easy to satisfy.
* Bad: under-specified config; no "just works" path.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `846c852`, `012ebe8`, `f89a167`,
`120c5c0` (`config_v2`). Inventory ref: BACKFILL-INVENTORY.md Seq 74. Supersedes `00043`;
completes the v2 set with `00046`/`00049`; runner adoption in `00051`; superseded by `00099`.
