---
status: accepted
date: 2024-08-26
decision-makers: doc-detective maintainers
---

# `saveScreenshot.crop` to a selector's bounding rect via sharp

## Context and Problem Statement

`saveScreenshot` captured the full viewport. Documentation screenshots usually need to show a
specific element — a button, a panel, a form — not the whole page, and the relevant region differs
per element and per display density. There was no way to crop a screenshot to a particular element.
How should `saveScreenshot` express "capture just this element," and how should the runner produce
that crop accurately across devicePixelRatio differences?

## Decision Drivers

* Documentation screenshots typically focus on one UI element, not the full viewport.
* The crop region must follow the element, so it should be selector-driven.
* High-DPI displays scale CSS pixels to device pixels; the crop must account for that.
* Authors may want a margin around the element.

## Considered Options

* **A. Add a `crop` object (`{selector (required), padding}`) and crop to the element's bounding
  rect with sharp, scaled by devicePixelRatio** (chosen).
* **B. Accept fixed pixel coordinates for the crop rectangle.**
* **C. Capture full viewport and leave cropping to external tooling.**

## Decision Outcome

Chosen option: **A**, because a selector tracks the element regardless of layout shifts and a
`padding` field covers the common "a little margin" need. `saveScreenshot` gained a `crop` object
with a required `selector` and optional `padding`; the runner resolves the element's bounding rect
and crops to it using sharp, multiplying by devicePixelRatio so the crop is correct on high-DPI
displays (common `d8fc52c6`; core `8ba7f87`, `15411b8`, `38505fb`, Seq 131).

### Consequences

* Good: screenshots can target a single element by selector.
* Good: devicePixelRatio scaling keeps crops correct on high-DPI displays.
* Good: `padding` provides a margin without manual coordinate math.
* Bad: adds a sharp-based crop path and a dependency on accurate bounding-rect measurement.
* Neutral: crop is selector-required; coordinate-based cropping is not offered.

### Confirmation

Shipped across doc-detective-common commit `d8fc52c6` and doc-detective-core commits `8ba7f87`,
`15411b8`, `38505fb`. `crop{selector,padding}` is part of the saveScreenshot schema; the runner
crops via sharp.

## Pros and Cons of the Options

### A. Selector crop + padding via sharp
* Good: element-tracking; DPI-correct; margin support.
* Bad: depends on accurate bounding-rect + sharp.

### B. Fixed pixel coordinates
* Good: no element measurement.
* Bad: brittle to layout changes; not element-aware.

### C. Full viewport + external crop
* Good: no new step code.
* Bad: not integrated; manual post-processing.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commit `d8fc52c6`;
doc-detective-core commits `8ba7f87`, `15411b8`, `38505fb`. Inventory ref:
BACKFILL-INVENTORY.md Seq 131. Related: `00012` (screenshot action), `00066` (saveScreenshot
directory + visual diff), later `00156` (crop shift-clamp).
