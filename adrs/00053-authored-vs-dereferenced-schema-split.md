---
status: accepted
date: 2023-04-07
decision-makers: doc-detective maintainers
---

# Split authored schemas from dereferenced output schemas, then widen URLs for $ENV refs

## Context and Problem Statement

The schema package authored modular JSON Schemas that `$ref`-ed one another. Consuming validators at
runtime had to resolve those cross-file references, which was fragile and order-dependent, and the
authored `$id`s leaked into validation. Separately, URL fields used `format:uri` and a strict
`pattern`, which rejected legitimate values that contained environment-variable references (e.g. a
URL built from `$ENV` substitution). How should authored schemas be transformed for runtime
consumption, and how should URL fields accommodate `$ENV` references?

## Decision Drivers

* Runtime validation should consume self-contained schemas, not resolve `$ref`s on the fly.
* Authoring should stay modular and DRY (cross-references during authoring are fine).
* URL fields must accept `$ENV`-style references that resolve at run time, not author time.
* In-file references should be stable/local rather than depending on external `$id` resolution.

## Considered Options

* **A. Dereference pipeline: author in `src_schemas/`, emit self-contained `output_schemas/`; runtime consumes the deref'd output; widen URL pattern for `$ENV` and localize `$ref`s** (chosen).
* **B. Keep a single schema set and resolve `$ref`s at runtime via the validator.**
* **C. Inline all schemas by hand (no authoring-time `$ref`).**

## Decision Outcome

Chosen option: **A**, because separating authored sources from a generated, self-contained output is
the standard way to keep authoring modular while making runtime validation deterministic. Authored
schemas live in `src_schemas/`; a `dereferenceSchemas.js` preprocessing step emits dereferenced
`output_schemas/` that the runtime consumes, with `$id` stripped during dereferencing. In-file
references are rewritten to local `#/definitions/…` pointers. URL fields drop `format:uri` and widen
their `pattern` so values containing `$ENV` references validate.

### Consequences

* Good: runtime validation is deterministic and self-contained; no on-the-fly `$ref` resolution.
* Good: `$ENV`-built URLs validate without author-time resolution.
* Bad: a build step now stands between authored and consumed schemas (the dual-build gotcha).
* Neutral: looser URL `pattern` accepts some non-URL strings, accepted as the cost of `$ENV` support.

### Confirmation

Shipped across `common` `6431916`, `d2410d4`, `c9906fc`, `632c593` (split + deref + `$id` strip) and
`ec5b192`, `aeb0ec1` (URL widening + local `$ref`). Confirmed by `output_schemas/` being the consumed
artifact and `$ENV`-containing URLs passing validation.

## Pros and Cons of the Options

### A. Authored src_schemas → dereferenced output_schemas + URL widening
* Good: deterministic runtime validation; modular authoring; `$ENV` URLs allowed.
* Bad: introduces a build/deref step that must run before consumption.

### B. Resolve `$ref` at runtime
* Good: no build step.
* Bad: fragile, order-dependent resolution; `$id` leakage.

### C. Hand-inline all schemas
* Good: self-contained with no tooling.
* Bad: massive duplication; error-prone to maintain.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commits `6431916`, `d2410d4`,
`c9906fc`, `632c593`, `ec5b192`, `aeb0ec1`. Inventory ref: BACKFILL-INVENTORY.md Seq 78, 89. The
build/copy duality this established remains a known gotcha in the monorepo (schema edits must rebuild
the dereferenced output).
