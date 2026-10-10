---
status: accepted
date: 2026-10-10
decision-makers: hawkeyexl
---

# Validate against `$ref`-intact schemas, not the dereferenced bundle

## Context and Problem Statement

A one-step `runTests` (a single `runShell`) took about 4.8 s on Windows, and
`doc-detective --version` took about 930 ms. Profiling showed almost all of it
in Ajv:

* `validate.ts` registered all 54 dereferenced schemas (`schemas.json`, 61 MB)
  on two Ajv instances at import. That cost about 250 ms of traversal and
  meta-schema checks on every start, including `--version`.
* Each schema's first validation compiled it. The dereferenced schemas inline
  their `$ref`s, so `step_v3` (1.25 MB) is compiled once inside `config_v3`,
  again inside `spec_v3`, and again on its own. The source schemas total
  415 KB; dereferenced, they are 61 MB. Compiling `config_v3`, `spec_v3`, and
  `step_v3` took 3.7 s.
* The CJS bundle (`dist/index.cjs`) inlined the whole 61 MB `schemas.json`
  because `validate.ts` imported it, so the package carried two copies.

How should the validator get its compiled schemas without paying for the
duplication on every run?

## Decision Drivers

* Validation results must not change: same validity, same error strings, same
  defaults applied. Configs and specs that pass today must pass the same way.
* The public `schemas` export stays dereferenced. The LSP and external
  consumers read it directly.
* Startup cost should scale with what a run validates, not with the schema set.

## Considered Options

* A. Compile from a `$ref`-intact bundle built alongside `schemas.json`.
* B. Precompile validators at build time with Ajv standalone code generation.
* C. Keep the dereferenced schemas and only tune Ajv (no `code.optimize`, lazy
  registration).

## Decision Outcome

Chosen: **A, plus C's tuning**. The build (`dereferenceSchemas.cjs`) also emits
`schemasReferenced.json`, and `validate.ts` compiles from it via a dedicated
`schemas/referenced.ts` module, so the validator never loads `schemas.json`.
Ajv runs with `code: { optimize: false }`, and the bundle is registered on first
validation, not at import.

Ajv treats `$ref` differently from inlined schemas in two ways that affect
`useDefaults`. The build compensates for both:

1. **Composite context.** Ajv ignores defaults under `anyOf`, `oneOf`, `not`,
   `if`, `contains`, and `propertyNames`. Inlined, that rule reaches everything
   below. A `$ref` target compiled as its own function starts fresh and applies
   its defaults. So every `$ref` under a composite keyword points at a
   defaults-free copy of its target (`*.nodefaults.schema.json`, with `default`
   and `dynamicDefaults` stripped).
2. **Root defaults.** Ajv assigns a property's default from the property's own
   schema, never through `$ref`. Dereferencing copies a target's root `default`
   onto the referencing property, so the build copies it onto the `$ref` too.

Unknown schema keys now return `Schema not found` before reaching Ajv. Before,
an inherited name like `constructor` crashed inside Ajv's lookup.

### Consequences

* Good: startup gets several times faster. Medians of 10 runs on Windows with
  Node 24, measured by `scripts/bench-footprint.cjs`:
  * One-step `runTests`: 4.8 s → 0.82 s
  * `--version`: 930 → 424 ms
  * ESM import: 863 → 360 ms
  * CJS require: 1053 → 291 ms
* Good: the package shrinks from 137.9 MB to 76.9 MB unpacked (tarball 8.9 →
  5.6 MB). `dist/index.cjs` drops from 64 MB to 1.8 MB.
* Bad: two schema artifacts must stay in sync. Both come from the same build
  step, and the equivalence test below guards them.
* Bad: the compensations depend on Ajv's `useDefaults` internals. An Ajv
  upgrade that changes them would show up as an equivalence-test failure, not
  silently.

### Confirmation

`src/common/test/schemasReferenced.test.js` compiles every schema in both forms
with the validator's Ajv options and compares validity, errors (instancePath,
keyword, params, message), and the defaulted object. The corpus is every
schema's `examples`, plus the spec fixtures in `test/core-artifacts/`, run
against every schema so invalid inputs and their errors are covered.
`report_v3` and `resolvedTests_v3` use only their own examples: rejecting
foreign objects through the dereferenced form takes minutes. The test caught
both Ajv behaviors above before the compensations existed.

## Pros and Cons of the Options

### A. `$ref`-intact bundle

* Good: shared subschemas compile once; the bundle is 0.9 MB instead of 61 MB.
* Good: no generated code to review or ship.
* Bad: needs the two compensations above and a test to hold them.

### B. Ajv standalone precompilation

* Good: no compile at runtime at all.
* Bad: `ajv-keywords`' `dynamicDefaults` is a `compile`-style keyword, which
  standalone code generation doesn't support.
* Bad: generating code from the dereferenced schemas would ship megabytes of
  JavaScript per schema.

### C. Tune Ajv only

* Good: no new artifact.
* Bad: leaves the 3–4x duplicate compilation and the 61 MB copy in the CJS
  bundle. It got `runTests` to 2.6 s, not 0.8 s.
