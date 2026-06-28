---
status: accepted
date: 2025-03-11
decision-makers: doc-detective maintainers
---

# config_v3 restructure

## Context and Problem Statement

The v3 redesign re-keyed steps (`00096`) and contexts (`00098`); the config file contract (`config_v2`) needed to follow. v2 config carried separate `markupToInclude`-style fields and a fixed fileType shape, which didn't accommodate the new integrations or the inline-statement detection model. What should the v3 config contract look like — how are inputs, file types, inline statements, and integrations expressed?

## Decision Drivers

* Config must align with the v3 step/context model and its integrations (OpenAPI, etc.).
* File types must accept either a simple string or a structured object.
* Inline statement detection should be a declared part of a file type.
* The config needs a stable identity for reporting/round-trips.

## Considered Options

* **A. A new `config_v3` schema: `input`, `fileTypes` anyOf string/object, `inlineStatements`, `integrations`** (chosen).
* **B. Patch `config_v2` in place with the new fields.**
* **C. Keep `config_v2` and bolt integrations on as a side file.**

## Decision Outcome

Chosen option: **A**. `config_v3` defines `input`, a `fileTypes` field accepting `anyOf` string-or-object, `inlineStatements`, and an `integrations` block. It gains a `configId` uuid, moves to draft-07, removes `markupToInclude`, and keeps `markup` as an array. This is the config-file contract the v3 runner validates against (`00100`).

### Consequences

* Good: config aligns with the v3 step/context/integrations model.
* Good: `fileTypes` flexes between a shorthand string and a full object.
* Good: `configId` gives the config a stable identity for reporting.
* Bad: a breaking config-shape change from v2 (handled by the runner's v3 adoption).

### Confirmation

Shipped in common commits `6e20b59`, `42f9d06`, `c10f727`, `6d522a3`, `a36fe84`, `16b978e`, `c7760db`. Covered by the config example fixtures and the common validate suite.

## Pros and Cons of the Options

### A. New config_v3 schema
* Good: clean alignment with the v3 model; flexible fileTypes.
* Bad: breaking change from config_v2.

### B. Patch config_v2 in place
* Good: same schema key.
* Bad: muddies a versioned contract; harder to reason about compatibility.

### C. Integrations as a side file
* Good: leaves config_v2 alone.
* Bad: splits configuration across files; awkward to validate.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `6e20b59`, `42f9d06`, `c10f727`, `6d522a3`, `a36fe84`, `16b978e`, `c7760db`. Inventory ref: BACKFILL-INVENTORY.md Seq 143. Related: `00050` (config_v2), `00096` (v3 step redesign), `00100` (v3 runner adoption).
