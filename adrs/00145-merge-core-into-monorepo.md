---
status: accepted
date: 2026-02-26
decision-makers: doc-detective maintainers
---

# Merge doc-detective-core into the monorepo

## Context and Problem Statement

The runtime engine lived in a separate `doc-detective-core` package that the `doc-detective` wrapper
depended on (the thin-wrapper split from `00039`). Coordinating changes across two repos — a contract
change in core plus the wrapper that consumes it — meant lockstep releases, cross-repo PRs, and
version churn that slowed every behavior change. With the v4 line underway, should the core engine be
merged into the `doc-detective` repository and refactored to modern ESM/TypeScript?

## Decision Drivers

* Cross-repo lockstep releases were slowing feature work and contract changes.
* The v4 line was already moving to ESM/TypeScript; the engine should follow.
* A single repo lets a behavior change and its consumer land in one reviewable PR.
* Packaging (postinstall, CJS wrapper generation) needs to live with the code it provisions.

## Considered Options

* **A. Merge `core` into the `doc-detective` monorepo as `src/core/*` with a full ESM/TypeScript refactor** (chosen).
* **B. Keep `core` separate but pin tighter and automate cross-repo releases.**
* **C. Inline core's code into the wrapper without a structured `src/core/*` layout.**

## Decision Outcome

Chosen option: **A**, because a monorepo collapses the two-repo lockstep into single reviewable
changes and lets the engine adopt the same ESM/TS toolchain as the rest of the v4 line.

The contract:

* The engine moves in under `src/core/*` with a full ESM/TypeScript refactor:
  `config.ts`, `tests.ts`, the per-action files, `integrations/heretto.ts`, `integrations/openapi.ts`.
* Packaging artifacts move in too: `postinstall.js` and `createCjsWrapper.js` (the v4 line).
* This is the engine half of the monorepo consolidation; the schema package (`00146`) and docker
  configs (`00147`) follow.

### Consequences

* Good: a behavior change and its wrapper consumer now land in one PR; no cross-repo lockstep.
* Good: the engine shares the v4 ESM/TS toolchain.
* Good: provisioning scripts live beside the code they provision.
* Bad: a one-time large refactor and a bigger repo to build/test.
* Neutral: this is a structural/packaging move; runtime test semantics are carried over, not changed.

### Confirmation

Shipped in doc-detective `5b8df475`. Confirmed by the presence of `src/core/*` (`config.ts`,
`tests.ts`, action files, `integrations/heretto.ts`, `integrations/openapi.ts`) and the
`postinstall.js` / `createCjsWrapper.js` packaging scripts in-repo.

## Pros and Cons of the Options

### A. Merge into the monorepo as `src/core/*`
* Good: single-PR changes; shared toolchain; co-located packaging.
* Bad: large one-time refactor; larger repo.

### B. Keep separate, automate releases
* Good: smaller immediate change.
* Bad: cross-repo lockstep and release automation remain a tax on every change.

### C. Inline without structure
* Good: fast.
* Bad: no clear engine boundary; harder to navigate and test.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `5b8df475`. Inventory ref:
BACKFILL-INVENTORY.md Seq 206. Related: `00039` (thin-wrapper split that this reverses), `00146`
(merge common), `00147` (merge docker configs), `00150` (in-repo Heretto loader).
