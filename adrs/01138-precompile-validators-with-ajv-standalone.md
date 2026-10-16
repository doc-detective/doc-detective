---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Precompile the validators with Ajv standalone code at build time

## Context and Problem Statement

[ADR 01104](01104-validate-against-referenced-schemas.md) moved `validate()` onto the `$ref`-intact
`schemasReferenced.json` bundle. It still compiled each schema on first use, though. Every CLI run
that loads a config pays for that compile. The first `config_v3` validation took about 130 ms on
Windows, and importing `validate.js` took about 115 ms, most of it loading Ajv's compiler. Warm
validations take about 0.01 ms, so nearly all of that cost is one-time compile and load work. It
repeats identically on every run, for schemas that only change at build time.

ADR 01104 considered precompiling with Ajv standalone code generation and rejected it for two
reasons:

* `ajv-keywords`' `dynamicDefaults` is a `compile`-style keyword. Its compiled closure can't be
  serialized into standalone code.
* Generating code from the dereferenced schemas would ship megabytes of JavaScript per schema.

Can the validators be precompiled without changing any validation result?

## Decision Drivers

* Exact parity. Every `validate()` call returns the same validity, the same errors (string and
  `errorObjects`), and the same mutated object as before. That covers static defaults, uuid
  dynamic defaults, type coercion, and the v2 → v3 compatible-schema transforms.
* One source of truth for the Ajv options, shared by runtime behavior, build-time generation, and
  the tests.
* No generated code in git. A committed artifact could drift from the schemas silently.
* Keep the package and the CJS bundles from growing more than necessary.

## Considered Options

* A. Generate standalone code at build time from `schemasReferenced.json`, for all 54 schema keys,
  in both Ajv configurations.
* B. Precompile only the hot-path schemas (`config_v3`, `spec_v3`, `test_v3`, `step_v3`), and keep
  lazy runtime compilation for the rest.
* C. Keep runtime compilation (status quo).

## Decision Outcome

Chosen: **A**.

* `createAjv` in `src/common/src/ajv.ts` gains a `standalone` mode. It uses the same options plus
  `code.source`, and keeps Ajv's default code optimizer, since the build pays for it rather than
  the runtime. It also replaces `ajv-keywords`' `dynamicDefaults` with a code-generating
  equivalent. The replacement follows the same rules:
  * It skips when `useDefaults` is off or inside a composite keyword.
  * It fills a property only when the value is `=== undefined`.
  * It processes properties in the same order.
  * It calls the same `getRandomUUID`, inlined from its source.

  The replacement sits at the same position among the object-type rules. Only `ajv-keywords`'
  type-less `select` followed the original. It supports only the `uuid` default, the only one the
  schemas use. Any other dynamic default fails the build loudly.
* `standaloneValidatorFiles()` generates both validator sets from the `$ref`-intact bundle, so
  shared subschemas become shared functions. The mutating set (`useDefaults` and `coerceTypes`) is
  2.9 MB, and the non-mutating probe set from ADR 01065 is 2.2 MB.
  `scripts/generateValidators.js` writes them to `dist/schemas/validators.cjs` and
  `validatorsCheck.cjs`. That runs in `src/common`'s `compile`, after `tsc` and before the CJS
  bundle.
* `validate.ts` imports `validators.cjs` and looks validators up by key. It no longer imports Ajv
  or `schemasReferenced.json`. The probe set loads on first use, because only objects that fail
  their target schema reach the compatible-schema probe.
* The root build's `copy:schemas` now also copies both files into `dist/common/src/schemas/`, and
  `compile` runs it between `tsc` and the CJS bundle. Both CJS wrappers keep `validators.cjs` as an
  external `require` next to the bundle rather than inlining a second copy.
* Option B buys nothing over A. Every schema can be precompiled, and a runtime fallback would keep
  Ajv's compiler loaded on the import path.

### Consequences

* Good: no schema compiles at runtime, and `validate.js` no longer loads Ajv's compiler. Two
  benchmark sessions on Windows with Node 24, each taking medians of 10 interleaved runs, before →
  after:
  * First `config_v3` validation: 129.5 → 4.0 ms, and 134.4 → 4.0 ms.
  * `validate.js` import: 114.5 → 58.7 ms, and 109.5 → 60.1 ms.
  * One-step `runTests` (a single `runShell`): 1410 → 1285 ms, and 1457 → 1265 ms. That's
    about 125–190 ms per run.
  * `--help` doesn't change measurably (about 500–540 ms). It never validates, and the CLI still imports
    `ajv` eagerly through `src/core/tests/httpRequest.ts`, which compiles user OpenAPI schemas at
    runtime.
  * CJS `require` of `doc-detective-common` plus the first `config_v3` validation: the
    validation drops from 121 → 4 ms. The require stays about 440 ms, dominated by the bundled
    `schemas.json`.
* Good: the root CJS bundle shrinks from 1.33 MB to 0.89 MB, because it no longer inlines
  `schemasReferenced.json`.
* Bad: each package ships 5.1 MB of generated validator code. `doc-detective-common` carries it
  in `dist/schemas/`, and `doc-detective` copies it to `dist/common/src/schemas/`.
* Bad: the generated code depends on Ajv internals: the standalone output, the runtime helpers
  `ajv/dist/runtime/*`, and the `ajv-keywords` transform functions. An Ajv or `ajv-keywords`
  upgrade must regenerate it, which every build does. The parity test then catches any behavior
  change.
* Neutral: `errorObjects[].schemaPath` values stay the same as under ADR 01104. Both configurations
  generate from the same `$ref`-intact bundle.

### Confirmation

`src/common/test/precompiledValidators.test.js`:

* Checks that the shipped `validators.cjs` and `validatorsCheck.cjs` match a fresh
  `standaloneValidatorFiles()` byte for byte, so a stale build fails.
* Checks that both sets export exactly the schema keys of `schemasReferenced.json`.
* Runs a corpus of 487 inputs against every schema in both configurations, comparing the
  precompiled validator with the runtime-compiled one, about 52,000 comparisons. The comparison
  covers validity, whole error objects, and the post-validation data, with uuids normalized. The
  corpus is every schema example, the spec fixtures in `test/core-artifacts/` and `test/artifacts/`,
  and the repo's config files.
* Checks that uuid dynamic defaults apply only in the mutating set.
* Checks that a non-uuid dynamic default refuses to precompile.
* Checks that `validate()` runs without loading Ajv's compiler (`ajv/dist/core.js`).

During development, two one-off scripts compared `validate()` itself between the pre-change and
new builds. The first ran every call from the existing `validate.test.js` suite through both
builds: 612 calls, 0 differences. The second ran every schema key against every corpus input,
with `addDefaults` on and off and `structuredErrors` on: 52,596 calls, 0 differences. That run
included 49,680 invalid results and 67 v2 → v3 transforms.

## Pros and Cons of the Options

### A. Precompile every schema from the `$ref`-intact bundle

* Good: no runtime compile, and no Ajv compiler on the import path.
* Good: the `$ref`-intact bundle keeps the generated code at 5.1 MB rather than per-schema copies
  of inlined subschemas.
* Bad: it needs a code-generating `dynamicDefaults` replacement, held to the original by the parity
  test.
* Bad: it adds 5.1 MB of generated JavaScript to each package.

### B. Precompile only the hot-path schemas

* Good: less generated code.
* Bad: it keeps the runtime compiler and its import cost for any other schema. The LSP and
  `resolvedTests_v3` validation would still compile at runtime.
* Bad: it needs two lookup paths in `validate.ts`.

### C. Keep runtime compilation

* Good: no generated artifact.
* Bad: every run pays about 130 ms of compile plus the compiler's import cost.
