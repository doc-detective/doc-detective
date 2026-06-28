---
status: accepted
date: 2026-03-25
decision-makers: doc-detective maintainers
---

# In-repo Heretto loader

## Context and Problem Statement

The Heretto CMS integration (`00141`) originally spanned three separate packages — common (schema),
core (runner), and resolver (source fetching). After the monorepo consolidation (`00145`–`00147`),
that cross-package loader had to be re-homed inside the merged repository. At the same time the
content-loading round-trip had a bug: Heretto's publishing API returns content via an asynchronous
job, and the loader's job-status polling didn't wait correctly, so downloads could be read before the
job finished. How should the Heretto loader live in the monorepo, and how is the job-status race
fixed?

## Decision Drivers

* The Heretto integration must keep working after the monorepo merge.
* CMS content download depends on an async publishing job that must be polled to completion.
* `heretto:<name>` source refs must keep resolving through `detectTests`.
* The loader should live with the rest of the core integrations (`src/core/integrations/`).

## Considered Options

* **A. Re-expose the Heretto loader in-repo as `src/core/integrations/heretto.ts` with a corrected job-status poll** (chosen).
* **B. Keep the loader in the (now-archived) resolver package and depend on it externally.**
* **C. Inline minimal Heretto fetching into `detectTests` without a dedicated loader module.**

## Decision Outcome

Chosen option: **A**, because the monorepo's integrations belong under `src/core/integrations/`
alongside OpenAPI and the other connectors, and re-homing the loader is the natural moment to fix the
job-status race that made downloads flaky.

The contract:

* `src/core/integrations/heretto.ts` (515 lines) is the in-repo Heretto content loader — a
  re-exposure of the `00141` integration inside the merged repo.
* `detectTests` integrates it: `heretto:<name>` refs resolve through this loader.
* The job-status polling is fixed so the loader waits for the Heretto publishing job to complete
  before reading the downloaded content.

### Consequences

* Good: the Heretto integration keeps working post-merge, co-located with other core integrations.
* Good: the job-status fix removes a download race that produced incomplete/empty content.
* Good: `heretto:<name>` refs resolve through the in-repo `detectTests` path.
* Bad: the vendor-specific loader (515 lines) is now maintained in-repo.
* Neutral: the user-facing Heretto contract (config, refs, uploader) is unchanged from `00141`; this
  is the monorepo re-home plus a reliability fix.

### Confirmation

Shipped in doc-detective `2b5167a9` (#238) and `dc4312d4`. Confirmed by
`src/core/integrations/heretto.ts`, `heretto:<name>` ref resolution through `detectTests`, and the
corrected job-status polling.

## Pros and Cons of the Options

### A. In-repo loader + job-status fix
* Good: post-merge continuity; co-located integration; fixes the download race.
* Bad: vendor-specific module maintained in-repo.

### B. Depend on the external resolver package
* Good: no re-home work.
* Bad: re-introduces a cross-package dependency the monorepo merge removed; loader left in an
  archived repo.

### C. Inline minimal fetching into detectTests
* Good: less code.
* Bad: no clear integration boundary; harder to maintain the async job logic.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `2b5167a9` (#238),
`dc4312d4`. Inventory ref: BACKFILL-INVENTORY.md Seq 212. Related: `00141` (original Heretto CMS
integration), `00145`–`00147` (monorepo merges), `00090` (OpenAPI integration).
