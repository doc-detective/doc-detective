---
status: accepted
date: 2026-03-20
decision-makers: doc-detective maintainers
---

# npm packaging and prepack/postpack workspace strip

## Context and Problem Statement

Once `doc-detective` became a monorepo with workspaces (`src/core`, `src/common`, `src/container`),
the published npm package and the `npx doc-detective` experience broke: the `package.json` `files`
list and `scripts/` didn't reflect the bundled layout, and the workspace declarations confused
package resolution when the tarball was installed standalone. Running `npx doc-detective` would fail
because the packed package still pointed at workspace siblings that don't exist outside the repo.
What should the published package contain, and how do we keep `npx` working after the monorepo merge?

## Decision Drivers

* `npx doc-detective` must work from the published tarball, with no monorepo context.
* The published package must include the bundled `scripts/` and the right `files` entries.
* Workspace declarations that only make sense in-repo must not ship in the installed package.
* The fix must be automatic at pack time, not a manual pre-publish ritual.

## Considered Options

* **A. Curate `files`/`scripts` and strip workspaces during packing via `prepack`/`postpack`** (chosen).
* **B. Hand-edit `package.json` before each publish to remove workspaces.**
* **C. Publish each workspace as its own package and have the wrapper depend on them.**

## Decision Outcome

Chosen option: **A**, because the workspace declarations are only valid inside the repo; stripping
them at pack time (and restoring them afterward) makes the published tarball self-contained while
keeping the in-repo workspace dev setup intact.

The contract:

* `package.json` `files` and `scripts/` are curated so the published package contains the bundled
  layout (this changes published package contents).
* A `prepack` step strips the `workspaces` declaration during packing; a `postpack` step restores
  it — so the tarball installs standalone and `npx doc-detective` resolves correctly, while the repo
  keeps its workspace setup for development.

### Consequences

* Good: `npx doc-detective` works from the published package, no monorepo needed.
* Good: pack-time automation means no manual pre-publish edits.
* Good: in-repo development keeps its workspace layout (postpack restores it).
* Bad: the pack process now mutates and restores `package.json`; an interrupted pack could leave it
  modified.
* Neutral: this is packaging plumbing, not a runtime behavior change.

### Confirmation

Shipped in doc-detective `9268214a`, `045d9214`, `43fea021`. Confirmed by the `package.json` `files`
entries, the bundled `scripts/`, and the `prepack`/`postpack` workspace-strip hooks, with a working
`npx doc-detective`.

## Pros and Cons of the Options

### A. Curated files + prepack/postpack strip
* Good: self-contained tarball; automatic; preserves in-repo workspaces.
* Bad: pack mutates `package.json` (restored after).

### B. Hand-edit before publish
* Good: no hook machinery.
* Bad: error-prone manual step on every release; easy to forget.

### C. Publish each workspace separately
* Good: clean dependency boundaries.
* Bad: re-introduces the multi-package lockstep the monorepo merge removed.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `9268214a`, `045d9214`,
`43fea021`. Inventory ref: BACKFILL-INVENTORY.md Seq 211. Related: `00145`/`00146`/`00147` (monorepo
merges that created the workspace layout), `00163` (platform-runner bin).
