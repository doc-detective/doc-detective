---
status: accepted
date: 2022-05-27
decision-makers: doc-detective maintainers
---

# Screenshot visual-diff matching

## Context and Problem Statement

A screenshot action could capture an image, but capturing alone does not catch visual regressions — a
broken layout or changed UI would pass silently. Documentation testing benefits from comparing a new
screenshot against a previously captured baseline and failing when the page has visibly drifted. How
should visual regression be expressed and how should "different enough to fail" be decided?

## Decision Drivers

* Detecting unintended UI changes is a key value of testing docs against the live product.
* Pixel comparisons need a tolerance so trivial noise does not cause flaky failures.
* The comparison should reuse a proven image-diff library, not a hand-rolled one.

## Considered Options

* **A. `matchPrevious` pixel-diff with a threshold via pixelmatch/pngjs** (chosen).
* **B. Exact byte-for-byte image equality.**
* **C. No comparison — capture only.**

## Decision Outcome

Chosen option: **A**. The screenshot action gains a `matchPrevious` option that compares the freshly
captured image against the prior baseline using `pixelmatch` (with `pngjs` for decoding) against a
threshold; if the difference exceeds the threshold the action fails. A tolerance-based pixel diff
avoids the brittleness of exact equality while still catching meaningful visual drift. This is the
origin of the visual-regression contract that later grows `maxVariation`, `overwrite` enums,
selector-based crop, and URL/reference-image comparison.

### Consequences

* Good: screenshots become regression assertions, not just captures.
* Good: threshold tolerance reduces false failures from sub-pixel noise.
* Neutral: the comparison contract is substantially reshaped later — `maxVariation` (0–100, then
  fractional 0–1), `overwrite: true/false/byVariation`, and diffs-to-WARNING behavior — but the
  pixel-diff baseline-compare idea starts here.

### Confirmation

Shipped 2022-05-27 (`10c94783`): `tests.js` adds `matchPrevious` comparison backed by the new
`pixelmatch`/`pngjs` dependencies.

## Pros and Cons of the Options

### A. matchPrevious threshold pixel diff
* Good: catches real visual drift with tolerance for noise; uses proven libraries.
* Bad: a single global threshold is coarse (later refined by `maxVariation`).

### B. Exact equality
* Good: trivial to implement.
* Bad: extremely flaky — any anti-aliasing or timing difference fails the test.

### C. Capture only
* Good: simplest.
* Bad: never detects regressions; defeats the purpose of testing against the live UI.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit 10c94783. Inventory ref:
BACKFILL-INVENTORY.md Seq 24. Related: ADR 00012 (screenshot action), ADR 00066 (saveScreenshot
directory and visual diff), ADR 00135 (regression diffs to WARNING), ADR 00139 (fractional
maxVariation comparison), ADR 00157 (screenshot reference-image regression).
