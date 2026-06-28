---
status: accepted
date: 2026-04-18
decision-makers: doc-detective maintainers
---

# Screenshot crop shift-rather-than-shrink clamp

## Context and Problem Statement

The `screenshot` crop option (`00089`) crops a capture to an element's bounding rectangle
plus `padding`. When the requested crop region extended past the image edge, the previous
clamp *shrank* the region to fit — which changed the crop's width/height and therefore its
aspect ratio, breaking visual-regression comparisons against a reference image. Sub-pixel
aspect-ratio jitter from device-pixel-ratio rounding caused the same problem. How should the
crop clamp keep the requested region's size when it runs off the image edge?

## Decision Drivers

* Visual regression requires a stable crop size/aspect ratio across runs.
* A crop region overrunning an edge must still fit inside the image.
* Sub-pixel aspect-ratio jitter from DPR rounding should not break comparisons.
* The element's intended framing (size + padding) should be preserved, not silently reduced.

## Considered Options

* **A. Shift the crop region inward to fit (preserving width/height) and tolerate small aspect-ratio jitter** (chosen).
* **B. Keep shrinking the region to fit (status quo).**
* **C. Fail the step when the crop region overruns the image edge.**

## Decision Outcome

Chosen option: **A**, because preserving the requested crop dimensions is what keeps visual
regression stable; moving the box is preferable to resizing it. The crop clamp in
`saveScreenshot.ts` now **shifts** an overrunning crop region inward (translating it so it
fits within the image while keeping the requested width and height) rather than shrinking it,
and tolerates small aspect-ratio jitter introduced by device-pixel-ratio rounding so
near-identical crops still compare as matches.

### Consequences

* Good: crop width/height (and aspect ratio) stay stable for visual regression.
* Good: DPR-rounding jitter no longer spuriously fails comparisons.
* Good: edge-overrun crops still produce a valid, full-size region.
* Neutral: a shifted crop may include slightly different content near the edge than the
  literal requested origin.
* Bad: when the requested region is larger than the image, shifting alone cannot fully
  satisfy it (an inherent limit).

### Confirmation

Shipped in `saveScreenshot.ts` (commit `1431c9bb`). Confirmed by the shift-rather-than-shrink
clamp and aspect-ratio jitter tolerance in crop comparison.

## Pros and Cons of the Options

### A. Shift-to-fit + jitter tolerance
* Good: stable crop size; robust comparisons.
* Bad: edge content may shift slightly.

### B. Shrink-to-fit (status quo)
* Good: always fits.
* Bad: changes aspect ratio; breaks regression.

### C. Fail on overrun
* Good: explicit.
* Bad: rejects recoverable near-edge crops; brittle.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `1431c9bb`. Inventory
ref: BACKFILL-INVENTORY.md Seq 218. Related: `00089` (selector-based screenshot crop),
`00157` (screenshot reference-image regression), `00139` (fractional maxVariation comparison).
