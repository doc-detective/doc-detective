---
status: accepted
date: 2026-01-27
decision-makers: doc-detective maintainers
---

# doc-detective-common TypeScript migration and exported types

## Context and Problem Statement

`doc-detective-common` shipped as hand-written `.js` with JSON Schemas as the only machine-readable
contract; consumers (the core runner, the resolver, integrators) had no compiler-checked types for
the Specification/Test/Step/Context/Config/Report shapes the schemas define. As the schema surface
grew (v3 action-as-key family, integrations), keeping JS code and schemas in sync became error-prone
and downstream consumers got no IDE/type-check support. Should `doc-detective-common` migrate to
TypeScript and publish generated types as part of its public API?

## Decision Drivers

* The package's many object contracts deserve compiler-checked types, not just runtime AJV.
* Types should be *generated from the schemas* so they cannot drift from the validation contract.
* The change must be backward compatible — existing CommonJS and ESM consumers must keep working.
* Downstream packages (core, resolver) need importable types to refactor against.

## Considered Options

* **A. Migrate all source `.js`→`.ts`, generate per-schema typed interfaces, ship ESM+CJS+`.d.ts`, and export the generated types** (chosen).
* **B. Add hand-written `.d.ts` declaration files alongside the existing `.js`.**
* **C. Stay JavaScript; rely solely on runtime AJV validation.**

## Decision Outcome

Chosen option: **A**, because generating types from the schemas keeps the type layer and the
validation contract provably in sync, and a dual ESM/CJS build with `.d.ts` keeps every existing
consumer working while adding type safety.

The contract:

* All source migrated `.js`→`.ts`.
* Per-schema typed interfaces are *generated* (Specification, Test, Step, Context, Config, Report).
* The published `dist` ships ESM **and** CJS **and** `.d.ts`; the package becomes type-exporting.
* The migration is backward compatible: no runtime behavior change for existing importers.

The generated types were subsequently exported from `src/common/src/index.ts` as the public API
surface, completing the "consumers can import our contract types" goal.

### Consequences

* Good: schema-derived types prevent drift between validation and code.
* Good: downstream packages can refactor against importable, compiler-checked contracts.
* Good: dual ESM/CJS + `.d.ts` keeps all existing consumers working.
* Bad: a generation/build step now sits between schemas and shipped types (more build machinery).
* Neutral: this is infrastructure — it changes the build and public types, not runtime test behavior.

### Confirmation

Shipped in common `c089ec1` (TS migration: `.js`→`.ts`, generated interfaces, ESM+CJS+`.d.ts`) and
`07957639` / PR #194 (export generated types from `src/common/src/index.ts`). Confirmed by the
published `.d.ts` artifacts and the type exports.

## Pros and Cons of the Options

### A. Full TS migration with generated, exported types
* Good: schema-synced types; dual build; importable public contracts.
* Bad: adds a type-generation build step.

### B. Hand-written `.d.ts` over existing JS
* Good: smaller change; no source rewrite.
* Bad: declarations drift from schemas by hand; no real type-checking of the source.

### C. Stay JavaScript
* Good: no migration cost.
* Bad: no compile-time contract; downstream consumers stay untyped.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `c089ec1`, `07957639`
(PR #194). Inventory ref: BACKFILL-INVENTORY.md Seq 204, 209. Related: `00038` (schema package),
`00146` (merge common into the monorepo), `00144` (browser-safe module).
