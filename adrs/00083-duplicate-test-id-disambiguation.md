---
status: accepted
date: 2024-06-29
decision-makers: doc-detective maintainers
---

# Disambiguate duplicate declared test IDs as `${id}-${uuid}`

## Context and Problem Statement

Tests may carry an author-declared `id`. When two tests share the same declared `id` — easy to do
across files or by copy-paste — they collide: result keying, reporting, and any per-test lookup
become ambiguous because two distinct tests claim the same identifier. How should the resolver
guarantee unique test identity while still honoring the author's declared id where it is unique?

## Decision Drivers

* Test identity must be unique so results and reports key correctly.
* Author-declared ids are useful and should be preserved when they don't collide.
* Disambiguation must be deterministic enough to be traceable back to the declared id.
* The fix should live in resolution, before the runner consumes tests.

## Considered Options

* **A. Detect a duplicate declared `id` and rewrite it to `${id}-${uuid}`** (chosen).
* **B. Reject the run with an error when duplicate ids are found.**
* **C. Always replace declared ids with generated UUIDs, ignoring author intent.**

## Decision Outcome

Chosen option: **A**, because it keeps a unique, collision-free identity while preserving the
author-declared id as a readable prefix. When the resolver finds a declared test `id` that is
already in use, it rewrites the colliding occurrence to `${id}-${uuid}` so the two no longer
collide (core `8e7187e4`, Seq 124). Unique declared ids pass through unchanged; only collisions
are suffixed.

### Consequences

* Good: test identity is guaranteed unique; result/report keying is unambiguous.
* Good: the original declared id remains visible as the prefix, aiding traceability.
* Bad: a duplicated id silently changes shape (suffix appended) rather than erroring.
* Neutral: the suffix is a UUID, so the rewritten id is stable per run but not human-chosen.

### Confirmation

Shipped in doc-detective-core commit `8e7187e4`. Confirmed by the de-dup path in resolution that
appends `-${uuid}` only on a detected collision.

## Pros and Cons of the Options

### A. Rewrite collisions to `${id}-${uuid}`
* Good: unique identity; preserves declared id as prefix; no run abort.
* Bad: silent id mutation on collision.

### B. Error on duplicate ids
* Good: forces the author to fix the source.
* Bad: blocks otherwise-runnable suites.

### C. Always UUID
* Good: trivially unique.
* Bad: discards author intent and readability.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `8e7187e4`. Inventory
ref: BACKFILL-INVENTORY.md Seq 124. Related: `00006` (UUID test ids), `00062` (uuid identity).
