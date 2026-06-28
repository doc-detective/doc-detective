---
status: accepted
date: 2022-09-20
decision-makers: doc-detective maintainers
---

# Config-system rewrite with logLevel enum

## Context and Problem Statement

The boolean `verbose` switch (see `00021`) could only express on/off, but users needed a middle
ground between silent and fully verbose output. At the same time the config layer lacked per-field
validation and a committed set of defaults, so malformed config values failed unpredictably. The
config system needed a rewrite: a multi-level `logLevel` enum replacing the boolean, committed
defaults, and validation of individual fields. What shape should that take?

## Decision Drivers

* A single `verbose` boolean is too coarse — users want graded verbosity (e.g. info vs. debug).
* Config values should be validated per field with predictable failures.
* Shipping committed defaults makes behavior deterministic without a user config file.
* String-typed booleans from CLI/env (`"false"`) must be normalized correctly.

## Considered Options

* **A. Rewrite the config system: `logLevel` enum replaces boolean `verbose`, committed `src/config.json` defaults, per-field validation, headless boolean normalization** (chosen).
* **B. Add a second boolean (e.g. `debug`) alongside `verbose`.**
* **C. Keep the boolean and add levels later.**

## Decision Outcome

Chosen option: **A**, because a `logLevel` enum is the clean, extensible replacement for an
over-constrained boolean, and the rewrite was the moment to add validation and committed defaults.
The boolean `verbose` was replaced by a `logLevel` enum defaulting to `"info"`; a committed
`src/config.json` provided defaults; per-field validation (e.g. `detailLevel`/`extensions`) was
added; and headless boolean normalization was introduced so a string `"false"` is honored as
boolean false.

This supersedes the `verbose` boolean from `00021` and establishes graded logging that persists into
later schema versions (`logLevel` remains the logging contract through config v2/v3).

### Consequences

* Good: graded verbosity (`logLevel` enum) instead of a coarse boolean.
* Good: committed defaults + per-field validation make config behavior deterministic.
* Good: `"false"` strings normalize correctly to boolean false.
* Bad: breaking change — `verbose` consumers must move to `logLevel`.

### Confirmation

Shipped in commits `3be28b2`, `50bfdf4`, `c297b1a` (PR #6): `logLevel:"info"` default,
`detailLevel`/`extensions` validation, and `"false"` honored as boolean. Supersedes `00021`.

## Pros and Cons of the Options

### A. logLevel enum + committed defaults + per-field validation
* Good: extensible, validated, deterministic.
* Bad: breaks the `verbose` boolean contract.

### B. Second boolean alongside verbose
* Good: non-breaking.
* Bad: combinatorial booleans don't scale; ambiguous precedence.

### C. Keep boolean, add levels later
* Good: defers work.
* Bad: leaves the coarse contract and unvalidated config in place longer.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `3be28b2`, `50bfdf4`,
`c297b1a` (PR #6). Inventory ref: BACKFILL-INVENTORY.md Seq 34. Supersedes `00021` (verbose boolean).
