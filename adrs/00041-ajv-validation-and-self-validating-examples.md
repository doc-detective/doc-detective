---
status: accepted
date: 2023-01-31
decision-makers: doc-detective maintainers
---

# Adopt AJV as the schema validator with self-validating examples and defaulting options

## Context and Problem Statement

The newly extracted `doc-detective-common` package owns the JSON Schemas that define every test,
step, and config contract, but it had no validator wired to them. We needed one canonical way to
ask "does this object satisfy schema X?" and a guarantee that the `examples` we ship inside each
schema actually conform to the schema that contains them. At the same time, step objects needed
sensible runtime shaping — generated `uuid` ids, trimmed strings, and coerced types — so that
authored tests stayed terse while the runner received fully-formed objects. Which validator, and
with which options, should be the contract?

## Decision Drivers

* One validator, one `validate(schemaKey, object)` entrypoint reused everywhere.
* Schema `examples` must be contract fixtures that self-validate, so docs and tests can't drift.
* Authored objects should be shaped (defaults, coercion) rather than rejected for omitting
  boilerplate like a step `id`.
* Rich, collectible error output for actionable validation messages.
* Draft 2020-12 support to match the schema package's chosen draft.

## Considered Options

* **A. AJV with `useDefaults`/`coerceTypes` + ajv-formats/keywords/errors** (chosen).
* **B. A hand-rolled validator over the schema tree.**
* **C. A different library (e.g. `jsonschema`) without defaulting/coercion.**

## Decision Outcome

Chosen option: **A**, because AJV is the de-facto draft-2020-12 validator, supports mutating
defaults and type coercion out of the box, and exposes the plugin surface (formats, keywords,
errors) the contracts need. `validate(schemaKey, object)` becomes the single public validation API.
The validator is configured with `useDefaults: true` (mutating — it writes defaults back into the
object), `coerceTypes: true`, `allErrors: true`, plus `ajv-formats`, `ajv-keywords`, and
`ajv-errors`. A dynamic `uuid` default supplies step ids when omitted, and `transform: ["trim"]`
normalizes string fields. Every schema's `examples` array is asserted to self-validate, turning
documentation samples into regression fixtures.

### Consequences

* Good: a single validation contract; examples can never silently drift from their schema.
* Good: authored tests stay minimal — ids, trimming, and type coercion are applied for free.
* Bad: `useDefaults` mutates the input object, so callers must expect their object to be rewritten.
* Neutral: validation surface grows with AJV plugins; later relaxed via `allowUnionTypes`
  (see `00091`).

### Confirmation

The `validate()` export and its option set live in `doc-detective-common`; the example
self-validation runs in the package's validate test suite (`validate.test.js`). Defaulted ids and
coerced types are observable on any validated step object.

## Pros and Cons of the Options

### A. AJV + defaults/coercion + plugins
* Good: standard, well-maintained, draft-2020-12, rich plugins; minimal authoring overhead.
* Bad: mutating defaults are a footgun for callers that share object references.

### B. Hand-rolled validator
* Good: full control.
* Bad: large maintenance burden; reimplements formats/coercion/error collection poorly.

### C. Library without defaulting/coercion
* Good: simpler, non-mutating.
* Bad: pushes id-generation, trimming, and coercion into every call site.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `5641f5fc`, `83e02223`
(AJV adoption + self-validating examples) and `76d145c4`, `a19b2e9c`, `e1e3293b` (AJV options +
dynamic uuid default). Inventory ref: BACKFILL-INVENTORY.md Seq 59, 63. Builds on the schema
package shape in `00038`/`00040`; later relaxed in `00091`.
