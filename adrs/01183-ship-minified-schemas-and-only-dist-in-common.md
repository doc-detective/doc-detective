---
status: accepted
date: 2026-11-09
decision-makers: hawkeyexl
---

# Ship minified schemas, and only `dist/`, in the published packages

If another ADR takes 01183 before this one merges, this ADR gets the next free number at merge.

## Context and Problem Statement

The published packages were mostly whitespace. In a local `npm pack` of 4.43.0:

* `doc-detective-common` unpacked to 176.5 MB. `tsc` re-emits the committed, pretty-printed
  `schemas.json` (60.6 MB) as a 101.9 MB `dist/schemas/schemas.json`. esbuild then inlined it into
  a 59.8 MB `dist/index.cjs`. The package had no `files` allowlist, so it also shipped `plans/`,
  `scripts/`, and `coverage-thresholds.json`.
* `doc-detective` unpacked to 80.8 MB, 60.6 MB of it the pretty `schemas.json` that `copy:schemas`
  copies into `dist/common/src/schemas/`.

The dereferenced bundle minifies to 18.1 MB. The validator never loads it
([ADR 01138](01138-precompile-validators-with-ajv-standalone.md)). Only the `schemas` export and the
LSP's registry read it.

Separately, the build had stopped producing `dist/schemas/<name>_v3.schema.json`.
`dereferenceSchemas` wrote those files, and `compile`'s `clean` step, added later, deleted them. `$schema` URLs such as
`https://unpkg.com/doc-detective-common@5/dist/schemas/spec_v3.schema.json` point at them.

## Decision Drivers

* The committed `src/common/src/schemas/schemas.json` stays pretty. It's reviewed, and the "Schema
  reference drift" workflow diffs it.
* No change to what `require` or `import` returns.
* The published `$schema` file paths resolve.

## Considered Options

* A. Minify only the built copies, ship only `dist/` from `doc-detective-common`, and keep
  `schemas.json` out of the CJS bundles.
* B. Write the committed `schemas.json` minified.
* C. Stop shipping the dereferenced bundle, and build the `schemas` export from
  `schemasReferenced.json` at runtime.

## Decision Outcome

Chosen option: A.

* `src/common/scripts/generateValidators.js`, which already runs after `tsc` and writes into
  `dist/schemas/`, rewrites `dist/schemas/schemas.json` minified. It also writes every `*_v3` key
  to `dist/schemas/<key>_v3.schema.json`, minified. `dereferenceSchemas` no longer writes into
  `dist/`, since `compile` cleans it.
* The root `copy:schemas` copies `schemas.json` from `src/common/dist/schemas/`, beside the
  validators, instead of from the committed source.
* Both `createCjsWrapper.js` files mark `schemas.json` external, so `dist/index.cjs` requires
  `./schemas/schemas.json` (common) at runtime.
* `doc-detective-common`'s `package.json` gets `"files": ["dist/"]`. npm still adds
  `package.json`, `README.md`, and `LICENSE`.

### Consequences

* Good: `doc-detective-common` unpacks to 50.9 MB, and `doc-detective` to 38.3 MB.
* Good: the `$schema` URLs on unpkg resolve for releases built this way.
* Neutral: `dist/index.cjs` in `doc-detective-common` needs `dist/schemas/schemas.json` beside it.
  It's in the `files` allowlist.
* Bad: the 36 restored v3 files add 17.9 MB. They duplicate entries of `schemas.json`.

### Confirmation

`test/common-build-contract.test.js` checks the `files` allowlist, that both built `schemas.json`
copies and every v3 file are minified, and that `dist/index.cjs` requires `schemas.json` and loads
it. A scratch project installed from both packed tarballs validated a valid and an invalid spec
through `require` and `import`.

## Pros and Cons of the Options

### A. Minify the built copies

* Good: smallest change, and the reviewed source stays readable.
* Bad: each package still ships the 18.1 MB bundle.

### B. Minify the committed source

* Good: one fewer transform at build time.
* Bad: a one-line JSON file makes the drift check's diff and every schema review unreadable.

### C. Drop the dereferenced bundle

* Good: removes the 18.1 MB file.
* Bad: changes the `schemas` export's contract, since consumers read inlined subschemas from it.
