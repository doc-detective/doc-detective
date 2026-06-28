---
status: accepted
date: 2023-01-29
decision-makers: doc-detective maintainers
---

# v1→v2: unbundle the engine; the CLI becomes a thin doc-detective-core wrapper

## Context and Problem Statement

The `doc-detective` package shipped both the CLI and the entire execution engine inline — action
implementations, a 215-line `src/config.json`, a 1084-line `utils.js`, and a large `src/lib/*` tree.
That made the engine impossible to reuse independently and bundled heavy runtime dependencies into
every install of the CLI. Should the engine remain inside the CLI package, or be extracted into a
standalone package the CLI merely orchestrates?

## Decision Drivers

* The execution engine should be reusable independently of the CLI.
* The CLI package should be lightweight, delegating heavy work to a dedicated dependency.
* Schemas/validation are concurrently moving to a shared `common` package; the engine split aligns
  with that separation of concerns.
* Reduce the CLI's runtime dependency footprint.

## Considered Options

* **A. Delete the inline engine; require `doc-detective-core`; CLI becomes a thin wrapper** (chosen).
* **B. Keep the engine inline; expose it as a sub-export.**
* **C. Fork the engine into a package but keep a full copy inline too.**

## Decision Outcome

Chosen option: **A**, because a clean extraction yields a reusable engine and a slim CLI, and avoids
maintaining two copies of the same logic.

Behavior decided: the bundled engine is removed wholesale — `src/lib/*`, all action implementations,
the 215-line `src/config.json`, and the 1084-line `utils.js` are deleted; runtime deps are stripped.
The repo becomes a thin wrapper that `require("doc-detective-core")` and orchestrates it. This is the
2.0.0-line split that establishes the multi-repo architecture (CLI wrapper + `core` engine +
`common` schemas) later re-merged into the monorepo.

### Consequences

* Good: the engine is independently reusable; the CLI install is lighter.
* Good: clear separation — CLI orchestrates, `core` executes, `common` validates.
* Bad: a behavior/contract change now spans repos, raising release-coordination overhead (later
  resolved by re-merging into one monorepo).
* Neutral: this split is exactly what the 2026 monorepo merges (`00145`–`00147`) reverse.

### Confirmation

Shipped behavior: the mass deletion plus `require("doc-detective-core")` in the wrapper.

## Pros and Cons of the Options

### A. Thin wrapper over core
* Good: reusable engine; slim CLI; clean boundaries.
* Bad: cross-repo coordination cost.

### B. Inline with sub-export
* Good: single repo/release.
* Bad: heavy CLI install; reuse still awkward.

### C. Package plus inline copy
* Good: transitional safety.
* Bad: two copies to keep in sync; worst of both.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `6b277e95`, `dd61edc2`,
`44d58fb3`, `ec163278`. Inventory ref: BACKFILL-INVENTORY.md Seq 57. Related: schema package
(`00038`), v1 step vocabulary (`00040`), the v2 release `src/` restructure (`00060`), and the
monorepo re-merges (`00145`–`00147`).
