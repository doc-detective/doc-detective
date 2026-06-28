---
status: accepted
date: 2025-05-12
decision-makers: doc-detective maintainers
---

# Re-baseline the detect → parse → resolve pipeline as the doc-detective-resolver package

## Context and Problem Statement

Source-file discovery, markup-driven step detection, and context/identity resolution had grown
into a substantial body of logic that lived inside `doc-detective-core` alongside the runner.
By the v3 era this detection/parsing layer was a distinct concern: it turns input files and
config into a fully-resolved `{config, specs[]}` tree the runner can execute, and it has no
business owning browser drivers or running steps. The question was whether to keep that pipeline
embedded in `core` or extract it into its own package with a clear entrypoint contract so the
runner could depend on it as a black box.

## Decision Drivers

* Detection/parsing is conceptually separate from execution and should be independently testable.
* The runner should consume a resolved tree, not re-implement discovery.
* A standalone package can be reused (e.g. browser-safe detection) without pulling in the driver stack.
* Identity (`specId`/`testId`/`contextId`) must be assigned once, deterministically, at resolution time.
* Browser defaulting belongs to the runner (which knows the environment), not the resolver.

## Considered Options

* **A. Extract the pipeline into a standalone `doc-detective-resolver` package with `detectTests` / `resolveTests` / `detectAndResolveTests` entrypoints** (chosen).
* **B. Keep the pipeline inside `core` and expose internal functions.**
* **C. Fold detection into the CLI wrapper.**

## Decision Outcome

Chosen option: **A**, because a package boundary forces a clean contract and lets the runner treat
resolution as a black box. The resolver exposes three entrypoints — `detectTests`,
`resolveTests`, and the combined `detectAndResolveTests` — driven by a `driverActions` list that
determines `isDriverRequired` and feeds `resolveContexts`. It assigns `uuid`-based `specId` /
`testId` / `contextId`, returns a `{config, specs[]}` shape, returns `null` when no tests are
found, and deliberately does **not** default browsers — that remains the runner's job. Commits
`c911e006`, `0a626c4d`, `606b214e`, `d097ce06`, `5e1d8c86`, `9527d00c`.

### Consequences

* Good: detection/parsing is independently versioned and testable.
* Good: clean `{config, specs[]}` contract the runner consumes (see `00112`).
* Good: enables later browser-safe reuse of detection.
* Bad: a new package boundary to keep in lockstep with `core`/`common`.
* Neutral: the package is later merged back into the monorepo, but the contract it established persists.

### Confirmation

Shipped in `doc-detective-resolver` across commits `c911e006`, `0a626c4d`, `606b214e`,
`d097ce06`, `5e1d8c86`, `9527d00c`. Confirmed by the `detectTests`/`resolveTests`/
`detectAndResolveTests` entrypoints and the `{config, specs[]}` (or `null`) return contract.

## Pros and Cons of the Options

### A. Standalone resolver package
* Good: clean boundary; reusable; identity assigned once.
* Bad: another package to keep in sync.

### B. Keep inside core, expose internals
* Good: no new package.
* Bad: leaks internals; couples detection to the driver stack.

### C. Fold into the CLI wrapper
* Good: fewer moving parts.
* Bad: wrong layer; not reusable by programmatic callers.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-resolver commits `c911e006`,
`0a626c4d`, `606b214e`, `d097ce06`, `5e1d8c86`, `9527d00c`. Inventory ref: BACKFILL-INVENTORY.md
Seq 168. Related: `00112` (resolvedTests envelope + delegated resolution), `00101` (v3 spec/test
resolution).
