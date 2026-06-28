---
status: accepted
date: 2025-06-12
decision-makers: doc-detective maintainers
---

# Stop-on-fail step skipping and rich element outputs

## Context and Problem Statement

When a step in a test FAILs, the steps that follow it usually depend on the failed step's effect
(e.g. a `find` that never matched, so the subsequent `click` cannot run meaningfully). Running them
anyway produced noisy cascading failures that obscured the real cause. Separately, the unified
`outputs` model (`00105`) gave find/click an `outputs.element`, but it carried only minimal data and
held a raw element reference that should not survive into reports. The question: should steps after a
FAIL be skipped rather than failed, and what should `outputs.element` expose?

## Decision Drivers

* A single root failure should not produce a cascade of derived failures.
* Skipped-after-failure is more honest than fail-after-failure for downstream steps.
* `outputs.element` should expose useful element attributes for expressions/assertions.
* Raw driver element handles must not leak into serialized reports.
* Element reads should be resilient (one bad attribute read shouldn't abort the rest).

## Considered Options

* **A. Mark steps after a FAIL as SKIPPED and populate a rich `outputs.element` (raw handle carried then stripped, concurrent resilient reads)** (chosen).
* **B. Keep failing every subsequent step.**
* **C. Skip subsequent steps but keep `outputs.element` minimal.**

## Decision Outcome

Chosen option: **A**. Two behaviors landed together:

1. **Stop-on-fail.** Once a step in a test reports FAIL, the remaining steps are marked **SKIPPED**
   rather than executed/failed, so a single root cause no longer cascades. (Cleanup/`after` steps
   are later hard-routed to run anyway — see `01000`.)
2. **Rich element outputs.** `setElementOutputs` builds a richer `outputs.element`; a `rawElement`
   handle is carried during processing and then **stripped** before reporting; attribute reads run
   concurrently via `allSettled` so one failing read doesn't abort the others.

Commits `1cd5c7b`, `b25a88c`.

### Consequences

* Good: one failure no longer cascades into many; reports point at the real cause.
* Good: expressions/assertions get richer element data via `outputs.element`.
* Good: resilient concurrent attribute reads; no raw element handles leak into reports.
* Bad: a SKIPPED-after-FAIL step can mask a second, independent failure later in the same test.
* Neutral: stop-on-fail interacts with cleanup routing, which is resolved by the ordering ADR (`01000`).

### Confirmation

Shipped in core commits `1cd5c7b`, `b25a88c`. Confirmed by SKIPPED status on post-failure steps and
the `outputs.element` shape with `rawElement` stripped before reporting.

## Pros and Cons of the Options

### A. Stop-on-fail + rich element outputs
* Good: no cascades; rich, leak-free element data.
* Bad: can hide a later independent failure.

### B. Keep failing every step
* Good: every check still runs.
* Bad: noisy cascades obscure the root cause.

### C. Skip but keep minimal outputs
* Good: stops cascades.
* Bad: leaves expressions/assertions data-starved.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `1cd5c7b`, `b25a88c`. Inventory ref:
BACKFILL-INVENTORY.md Seq 176. Related: `00105` (unified outputs object), `01000` (cleanup steps run
despite stop-on-fail), `00106` (WARNING verdict).
