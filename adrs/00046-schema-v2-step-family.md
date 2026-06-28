---
status: accepted
date: 2023-03-05
decision-makers: doc-detective maintainers
---

# The v2 step schema family: `action` as `const`, inline identity, and the merged step set

## Context and Problem Statement

The v1 step vocabulary (`00040`) used an `action` **enum** to distinguish step types and kept
identity/metadata sparse. As the step set grew, each step type needed to be its own schema that
pins its single action, carries its own inline identity, and normalizes its fields the same way.
We also needed to bring the existing actions and several new ones under one coherent v2 family with
shared conventions. What does a v2 step schema look like, and which steps does the family include?

## Decision Drivers

* Each step type should pin its action precisely (a single value, not "one of an enum").
* Steps need inline identity (`id`) and human-readable `description` without external bookkeeping.
* Shared field normalization (trim, dynamic uuid defaults) across the family.
* One merged, consistent step set covering both ported and newly authored actions.

## Considered Options

* **A. A `*_v2` schema per step: `action` as `const`, inline id/description, shared normalization**
  (chosen).
* **B. Keep the single `action` enum and bolt on metadata.**
* **C. Per-step schemas without shared identity/normalization conventions.**

## Decision Outcome

Chosen option: **A**. The v2 era replaces the `action` **enum** with a per-step **`const`** so each
schema fixes exactly one action; adds inline `id` (uuid via `dynamicDefaults.id`) and `description`;
and applies `transform: ["trim"]` to normalize string fields. The family is merged in one pass
(PR #3) covering `checkLink`, `goTo`, `httpRequest`, and `runShell`, with `find` reshaped
(`wait{duration}` → flat `timeout`, default 500; `moveMouse` → `moveTo` boolean; `matchText` → a
plain string). New v2 steps are authored alongside: `typeKeys_v2`, `wait_v2`, `saveScreenshot_v2`,
`setVariables_v2`, and `startRecording_v2`, with `config.mediaDirectory` defaulting to `"."`. This
is the schema-side contract; the matching runtime handlers are `00047`, and the `find` inline-
subaction runtime redesign is `00048`.

### Consequences

* Good: every step type is its own precise, self-identifying, normalized contract.
* Good: consistent authoring across ported and new actions.
* Bad: breaking changes for v1 authors (`find` field reshape; enum→const).
* Neutral: schema and runtime move together but are recorded as separate decisions (`00047`/`00048`).

### Confirmation

The `*_v2` step schemas (`goTo_v2`, `runShell_v2`, `typeKeys_v2`, `wait_v2`, `saveScreenshot_v2`,
`setVariables_v2`, `startRecording_v2`, etc.) ship in `doc-detective-common` and validate via
`validate()`; their `examples` self-validate per `00041`.

## Pros and Cons of the Options

### A. Per-step `*_v2` schemas with const + inline identity
* Good: precise, self-identifying, uniformly normalized step contracts.
* Bad: breaking migration from v1; more schema files.

### B. Keep the enum + metadata
* Good: fewer files.
* Bad: can't pin per-step shape; weak identity story.

### C. Per-step schemas, no shared conventions
* Good: flexible.
* Bad: inconsistent identity/normalization; duplicated rules.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `0ef47719`, `92aa4e94`
(const + inline id/description), `fc675f1`, `3cd919e`, `001ec85`, `19f48bc4` (v2 family merge),
`8edb3a4`, `754a611`, `4b78396`, `ada5323`, `a434506` (new v2 steps). Inventory ref:
BACKFILL-INVENTORY.md Seq 67, 69, 71. Builds on `00040`; runtime in `00047`/`00048`;
containers in `00049`.
