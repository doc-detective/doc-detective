---
status: accepted
date: 2026-02-28
decision-makers: doc-detective maintainers
---

# Merge doc-detective-common into the monorepo

## Context and Problem Statement

After the engine merged in (`00145`), the schema/contract package `doc-detective-common` was still a
separate repo. Every contract change — a new schema field, a validation tweak, a `detectTests`
update — required a cross-repo edit and a lockstep release before the runner could use it. With the
v4 line consolidating, should `doc-detective-common` also move into the `doc-detective` repository so
the schema/contract surface lives beside the code that consumes it?

## Decision Drivers

* The schema surface and the runner that validates against it should evolve in one repo.
* A contract change plus its runner consumer should land in a single reviewable PR.
* Both `doc-detective` and `doc-detective-common` are published in lockstep at the same version —
  co-location makes that easier to enforce.
* Build tooling needs both schema generation and the runner build in one place.

## Considered Options

* **A. Merge `doc-detective-common` under `src/common/` as the in-repo schema/contract surface** (chosen).
* **B. Keep common separate but tighten version pinning + release automation.**
* **C. Copy schemas into the runner and drop the shared package.**

## Decision Outcome

Chosen option: **A**, because moving the contract surface in-repo collapses the last cross-repo
lockstep and lets a schema change ship with its runner consumer in one PR, while preserving the
shared-package boundary under `src/common/`.

The contract:

* `doc-detective-common` moves under `src/common/`: all schemas, `detectTests.ts`, and the
  validation code — establishing the **in-repo schema/contract surface**. (The schema *decisions*
  themselves are upstream-dated by their own earlier ADRs; this ADR records the merge.)
* Bundled alongside: a `--version` CLI flag and a recording-reliability `safeDone` fix that rode in
  on the same merge window.
* This completes the schema half of the monorepo consolidation (engine: `00145`; docker: `00147`).

### Consequences

* Good: schema changes and their runner consumers land in one PR; no cross-repo lockstep.
* Good: the lockstep-version invariant is easier to hold with both packages in one repo.
* Good: schema generation and runner build share one toolchain.
* Bad: a one-time merge plus a larger repo and build graph.
* Neutral: this is structural; the schema contracts are carried over from their own ADRs unchanged.

### Confirmation

Shipped in doc-detective `2ae9b831` (common under `src/common/`), `e83d1d75` (`--version` flag),
`da7ed97b` (`safeDone` recording fix). Confirmed by the in-repo `src/common/` schema surface and the
`--version` flag.

## Pros and Cons of the Options

### A. Merge under `src/common/`
* Good: single-PR contract changes; easier lockstep; shared toolchain.
* Bad: one-time merge; larger repo.

### B. Keep separate, automate releases
* Good: smaller immediate change.
* Bad: cross-repo lockstep tax persists on every contract change.

### C. Copy schemas, drop the package
* Good: no shared-package coordination.
* Bad: loses the reusable contract package other tools depend on; duplication risk.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `2ae9b831`, `e83d1d75`,
`da7ed97b`. Inventory ref: BACKFILL-INVENTORY.md Seq 207. Related: `00038` (schema package),
`00145` (merge core), `00147` (merge docker configs), `00143` (TS migration).
