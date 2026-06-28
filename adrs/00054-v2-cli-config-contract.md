---
status: accepted
date: 2023-04-14
decision-makers: doc-detective maintainers
---

# v2 CLI/config contract: flag set, config_v2 validation, timestamped result files

## Context and Problem Statement

With the engine rewritten to validate `config_v2` and expose `runTests()` (ADR 00051), the CLI
wrapper needed a flag surface and a config-resolution path that fed the new engine. The wrapper had
to declare the user-facing flags, validate the merged config against the versioned schema, fail fast
on bad input, and write results somewhere predictable without overwriting prior runs. What CLI flags,
validation order, and result-output behavior should the v2 wrapper commit to?

## Decision Drivers

* Flags must map onto the `config_v2` keys the engine understands.
* Merged config must be AJV-validated against `config_v2`, exiting non-zero on failure.
* CLI flags should override file/env config, not bypass validation.
* Result files must not clobber previous runs.

## Considered Options

* **A. `setArgs()` declares the v2 flag set; `setConfig()` AJV-validates `config_v2` then overlays flag overrides; `outputResults()` writes timestamped files** (chosen).
* **B. Let flags write straight to config without a validation pass.**
* **C. Write results to a single fixed filename, overwriting each run.**

## Decision Outcome

Chosen option: **A**, because validating the merged config first and overlaying flags on top is what
lets file config, env config, and CLI all reach the same validated code path. `setArgs()` declares
`--config/-c`, `--input/-i`, `--output/-o`, `--setup`, `--cleanup`, `--recursive/-r`, and
`--logLevel/-l`. `setConfig()` AJV-validates the merged config against `config_v2`, exits 1 on
failure, then overlays flag overrides. `outputResults()` writes `testResults-<timestamp>.json`, so
each run lands in its own file.

### Consequences

* Good: one validated config path shared by file/env/CLI; flags override rather than bypass.
* Good: timestamped result files never clobber prior runs.
* Neutral: the flag-then-validate ordering (validate config, overlay flags) becomes the house pattern.
* Bad: timestamped filenames accumulate; users must clean up or point `--output` at a directory.

### Confirmation

Shipped in `doc-detective` `61bebeb4`, `18f5921a`, `d7b45e19` (npm-script collapse `01ef13f9`).
Confirmed by the declared flags, `config_v2` validation exiting 1 on bad input, and
`testResults-<ts>.json` output.

## Pros and Cons of the Options

### A. Declared flag set + config_v2 validation + timestamped results
* Good: validated, override-not-bypass config; non-clobbering output.
* Bad: result files accumulate over time.

### B. Flags bypass validation
* Good: simplest wiring.
* Bad: CLI users dodge the schema contract file/env users get.

### C. Fixed overwriting result filename
* Good: tidy single file.
* Bad: destroys prior run history.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective` commits `61bebeb4`, `18f5921a`,
`d7b45e19`, `01ef13f9`. Inventory ref: BACKFILL-INVENTORY.md Seq 80. Consumes the `config_v2` schema
(ADR 00050) and the engine rewrite (ADR 00051); the validate-then-overlay-flags ordering is the
ancestor of the present CLI-flags↔config precedence rule.
