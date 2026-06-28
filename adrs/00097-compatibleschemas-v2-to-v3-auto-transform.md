---
status: accepted
date: 2025-02-07
decision-makers: doc-detective maintainers
---

# compatibleSchemas v2→v3 auto-transform

## Context and Problem Statement

The v3 redesign (`00096`) moved the action into the object key and renamed fields (`id`→`stepId`, `setVariables`→`variables`, `byVariation`→`aboveVariation`). Existing user content authored against v2 would otherwise fail v3 validation outright. Rather than force a manual rewrite of every spec, should the validator detect a v2-shaped object and transform it to the v3 action-key shape automatically before validating?

## Decision Drivers

* Existing v2 content must keep working without a hand migration.
* The mapping from v2 fields to v3 must be explicit and data-driven, not ad hoc.
* The transform must be reusable from the validator entry point.
* The mapping table should be public so callers can reason about compatibility.

## Considered Options

* **A. A `transformToSchemaKey` engine + `supportedTransformations`/`compatibleSchemas` mapping, invoked from `validate`** (chosen).
* **B. Require users to migrate v2 content manually.**
* **C. Maintain v2 and v3 schemas in parallel forever with dual validation paths.**

## Decision Outcome

Chosen option: **A**. `validate({ schemaKey, object, addDefaults })` calls `transformToSchemaKey`, which uses a `supportedTransformations` / `compatibleSchemas` table to rewrite a v2 step into the v3 action-key shape: `id`→`stepId`, `setVariables`→`variables`, `byVariation`→`aboveVariation`, and the action field folded into the action key. The mapping constant was made public (`bba8e199`, 2025-02-08) and later exported (`e84666d`, 2025-03-17) so callers can introspect compatibility.

### Consequences

* Good: v2 content validates under v3 without manual migration.
* Good: the v2→v3 mapping is explicit, data-driven, and inspectable.
* Neutral: transforms run on the validation path, adding a normalization step.
* Bad: the compatibility table must be maintained as new v3 actions land.

### Confirmation

Shipped in common commits `48a72a1e`, `bba8e199`, `88c74335`, `5259530e`; public const at `bba8e199`, exported at `e84666d`. Covered by validate/transform tests in common.

## Pros and Cons of the Options

### A. transformToSchemaKey + compatibleSchemas
* Good: automatic, explicit, reusable, introspectable.
* Bad: a mapping table to keep current.

### B. Manual migration
* Good: no transform code.
* Bad: breaks every existing v2 spec; high user cost.

### C. Parallel v2/v3 validation forever
* Good: no transform.
* Bad: two schema worlds to maintain indefinitely.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `48a72a1e`, `bba8e199`, `88c74335`, `5259530e`, `e84666d`. Inventory ref: BACKFILL-INVENTORY.md Seq 140. Related: `00096` (v3 action-as-key redesign), `00100` (v3 runner adoption).
