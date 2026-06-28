---
status: accepted
date: 2023-03-22
decision-makers: doc-detective maintainers
---

# v2 container schemas: `context_v2`, `test_v2`, `spec_v2`, and external `$ref` in `anyOf`

## Context and Problem Statement

The v2 step family (`00046`) defined individual step contracts, but a spec file is more than a list
of steps — it nests steps inside tests, tests inside a spec, and applies execution `contexts`. The
schema package needed versioned **container** schemas to describe that nesting, and it needed to
reference the per-step `*_v2` schemas by `$ref` inside an `anyOf` so a test's `steps` array could
accept any valid v2 step. AJV's default `strictSchema` rejected those external references. How are
the v2 containers shaped, and how do they compose the step schemas?

## Decision Drivers

* Versioned container schemas matching the v2 step family.
* A test's `steps` must accept *any* v2 step type via `$ref` in an `anyOf`.
* The `contexts` model (application/platform gating from `00044`) needs its own schema.
* AJV must validate external `$ref`s inside `anyOf` without strict-schema rejection.

## Considered Options

* **A. `context_v2` / `test_v2` / `spec_v2` containers with `$ref` step union, `strictSchema:false`**
  (chosen).
* **B. Inline all step definitions into one monolithic spec schema (no `$ref`).**
* **C. Keep `strictSchema` on and avoid external references.**

## Decision Outcome

Chosen option: **A**. Three container schemas land: `context_v2` (application/platform sets,
schematizing the gating model from `00044`), `test_v2` (a test = identity + `steps`), and `spec_v2`
(the spec-file container holding tests and contexts). A test's `steps` array is an `anyOf` of
`$ref`s to the individual `*_v2` step schemas, so any valid v2 step is accepted. AJV is configured
with `strictSchema: false` so those external `$ref`s inside `anyOf` validate instead of being
rejected. This composes the v2 step family into authorable spec files; `config_v2` (`00050`)
completes the v2 schema set, and the whole family is later superseded by the v3 containers
(`context_v3`/`spec_v3`, `00098`/`00101`).

### Consequences

* Good: spec files are fully validated, composing the modular `*_v2` step schemas by reference.
* Good: adding a step type is a new `$ref` in the `anyOf`, not a monolith edit.
* Bad: `strictSchema: false` loosens AJV globally to permit the external references.
* Neutral: container versioning (`_v2`) must track the step-family version.

### Confirmation

`context_v2.schema.json`, `test_v2.schema.json`, and `spec_v2.schema.json` ship in
`doc-detective-common` and validate via `validate()`; the `anyOf` `$ref` union resolves with
`strictSchema:false`.

## Pros and Cons of the Options

### A. v2 containers + `$ref` union + strictSchema:false
* Good: modular composition; full spec validation; easy to extend.
* Bad: relaxes AJV strictness globally.

### B. Monolithic inlined spec schema
* Good: no external-ref concerns.
* Bad: huge duplicated schema; painful to extend per step.

### C. Keep strictSchema on, no external refs
* Good: maximal AJV strictness.
* Bad: can't reference the modular step schemas; forces inlining.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `2806f51`, `86af251`, `1977b54`,
`45708f3` (context/test/spec v2). Inventory ref: BACKFILL-INVENTORY.md Seq 73. Composes `00046`;
schematizes gating from `00044`; completed by `00050`; superseded by `00098`/`00101`.
