---
status: accepted
date: 2026-04-19
decision-makers: doc-detective maintainers
---

# screenshot accepts URL reference images for visual regression

## Context and Problem Statement

The `screenshot` step's visual-regression comparison matched a fresh capture against a
prior local image (the previously-saved file at `path`). There was no way to compare against
a canonical reference image hosted remotely — a baseline served from a URL — so teams
keeping golden images in object storage or a CDN could not use them directly. The audit
needed `screenshot` to accept a URL as a read-only reference image to diff against. How
should a remote reference image be supplied and consumed?

## Decision Drivers

* Reference/baseline images are often hosted remotely (object storage, CDN, docs site).
* A URL reference must be read-only — the run compares against it but never overwrites it.
* Remote images are binary; the file loader must fetch binary content, not text.
* The behavior should fit the existing `screenshot_v3` path/maxVariation comparison model.

## Considered Options

* **A. Let `screenshot` accept a URL `path` as a read-only reference image, fetched as binary and diffed against the capture** (chosen).
* **B. Require users to download reference images locally before the run.**
* **C. Add a separate `referenceImage` field distinct from `path`.**

## Decision Outcome

Chosen option: **A**, because reusing the existing `path`/comparison surface keeps the
contract small and treats a URL as just another source of the baseline. `screenshot` now
accepts URL paths as **read-only reference images** for visual regression: the runner
fetches the remote image as binary (`fetchFile` binary support) and diffs the fresh capture
against it under the existing `maxVariation` model, never writing back to the URL. The
`screenshot_v3` schema was updated to permit a URL in the relevant path field.

### Consequences

* Good: remotely-hosted golden images can be used directly as baselines.
* Good: URL references are inherently read-only — no accidental overwrite of a baseline.
* Good: reuses the existing `maxVariation` comparison contract.
* Neutral: comparison now depends on network availability of the reference URL.
* Bad: a transient fetch failure for the reference image affects the comparison.

### Confirmation

Shipped in `saveScreenshot.ts` (binary `fetchFile`) with the `screenshot_v3` schema update
(commit `d03c130f`, PR #262). Confirmed by URL-reference comparison and the schema accepting
a URL path.

## Pros and Cons of the Options

### A. URL reference image via existing path
* Good: small surface; read-only by nature; reuses comparison.
* Bad: comparison depends on network reachability.

### B. Pre-download locally
* Good: no network at compare time.
* Bad: extra manual step; baseline drift between download and run.

### C. Separate referenceImage field
* Good: explicit separation from capture target.
* Bad: duplicates `path` semantics; larger schema surface.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `d03c130f` (PR #262).
Inventory ref: BACKFILL-INVENTORY.md Seq 219. Related: `00156` (screenshot crop shift clamp),
`00066`/`00089` (saveScreenshot directory + visual diff), `00139` (fractional maxVariation).
