---
status: accepted
date: 2023-02-21
decision-makers: doc-detective maintainers
---

# Define the `config_v1` config-file contract

## Context and Problem Statement

With validation (`00041`) and the v1 step vocabulary (`00040`) in place, the standalone-schema
package still had no schema for the **config file** itself — the document users author to point
Doc Detective at their inputs and tune its behavior. Configuration had until then been an ad-hoc
bag of CLI-era fields. We needed a single versioned schema that named every config knob and its
shape so file config could be validated the same way tests are. What fields does `config_v1`
guarantee?

## Decision Drivers

* A versioned config-file schema validated by the same AJV `validate()` path as tests.
* Cover the full surface users already relied on: inputs, lifecycle, discovery, output, browser.
* Establish the `*_v1` naming convention for config alongside the step/spec schemas.
* Give file-config users a single authoritative contract to author against.

## Considered Options

* **A. One `config_v1` schema enumerating all config fields** (chosen).
* **B. Validate config loosely / leave it unschematized.**
* **C. Fold config fields into the test/spec schema.**

## Decision Outcome

Chosen option: **A**, because config deserves its own versioned contract just like tests do.
`config_v1` defines: `input`, `setup`/`cleanup` lifecycle, `recursive` discovery, `output`,
`testExtensions`, `fileTypes` markup config, browser options (`headless`, `path`, dimensions),
and `analytics`. Config files now validate through the shared `validate()` API, and the `_v1`
suffix mirrors the step and spec schema versioning so config can evolve on its own version track
(superseded by `config_v2` in `00050`, then `config_v3` in `00099`).

### Consequences

* Good: file config is a validated, versioned contract, not an undocumented bag of keys.
* Good: consistent `*_v1` versioning across config, steps, and specs.
* Neutral: `analytics` is part of the contract here but later dropped with the telemetry path
  (config-v2 runner rewrite, `00051`).
* Bad: every new config knob now requires a schema edit and a version bump discipline.

### Confirmation

`config_v1.schema.json` ships in `doc-detective-common` and validates via `validate("config_v1", …)`;
positive/negative cases live in the package's validate test suite.

## Pros and Cons of the Options

### A. Dedicated `config_v1` schema
* Good: authoritative, versioned, validated config contract.
* Bad: schema-edit overhead for each new knob.

### B. Loose / unschematized config
* Good: zero schema work.
* Bad: silent misconfiguration; no contract for file-config users.

### C. Merge config into test/spec schema
* Good: fewer schema files.
* Bad: conflates two independent contracts with different lifecycles.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commit `6f8ad104` (`config_v1`).
Inventory ref: BACKFILL-INVENTORY.md Seq 64. Superseded by `00050` (`config_v2`) and `00099`
(`config_v3`).
