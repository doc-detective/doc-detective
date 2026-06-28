---
status: accepted
date: 2024-09-05
decision-makers: doc-detective maintainers
---

# Validation resilience and the readFile loader

## Context and Problem Statement

As the schema set grew to include OpenAPI-derived fields, AJV began rejecting union-type fields (the `openApi` examples carry multiple JSON types) unless `allowUnionTypes` was enabled. Separately, `validate(schemaKey, object)` threw — and crashed the process — when a caller passed an unknown `schemaKey`, and validation with defaults mutated the caller's object in place. There was also no single place to load a spec/config from disk or a URL regardless of format. How should validation tolerate union types, fail soft on a missing schema, avoid mutating inputs, and load JSON/YAML/remote sources uniformly?

## Decision Drivers

* OpenAPI example fields legitimately hold union types and must validate.
* An unknown schema key should produce a clear error, not crash the runner.
* Applying schema defaults must not mutate the caller's object.
* Specs and configs arrive as JSON or YAML, from local paths or HTTP(S) URLs.

## Considered Options

* **A. `allowUnionTypes` + missing-schema guard + non-mutating defaults + a `readFile` loader** (chosen).
* **B. Pre-strip union-typed fields and keep validation strict.**
* **C. Leave loading to each caller; keep `validate` crash-on-unknown-key.**

## Decision Outcome

Chosen option: **A**. The AJV instance is constructed with `allowUnionTypes: true` so OpenAPI example fields validate. `validate(schemaKey, object, addDefaults = true)` returns a structured "Schema not found" result instead of throwing when the key is unknown; with `addDefaults = false` it deep-clones the input before validating so the caller's object is never mutated. A new `readFile()` loader resolves a path or URL and parses JSON, YAML, or a remote payload (via axios) into an object, giving every caller one entry point.

### Consequences

* Good: union-type (OpenAPI) fields validate without per-field exceptions.
* Good: an unknown schema key degrades to an error result, not a crash.
* Good: defaulting no longer mutates caller objects.
* Neutral: `allowUnionTypes` slightly loosens AJV's strictness globally.

### Confirmation

Shipped in common `ffb61141` (`allowUnionTypes`) and `0b525780`, `52f5e24a`, `381be266` (missing-schema guard, non-mutating defaults, `readFile`). Covered by the common validate test suite.

## Pros and Cons of the Options

### A. Resilient validate + readFile loader
* Good: tolerant validation, no crashes, uniform loading.
* Bad: a small surface increase on `validate`.

### B. Pre-strip union fields
* Good: keeps AJV strict.
* Bad: lossy; OpenAPI examples would be dropped before validation.

### C. Per-caller loading, crash on unknown key
* Good: no shared loader to maintain.
* Bad: duplicated load logic; a typo'd schema key kills the run.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `ffb61141`, `0b525780`, `52f5e24a`, `381be266`. Inventory ref: BACKFILL-INVENTORY.md Seq 133, 134.
