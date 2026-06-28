---
status: accepted
date: 2022-05-18
decision-makers: doc-detective maintainers
---

# moveMouse and scroll actions

## Context and Problem Statement

Recorded walkthroughs are far clearer when the cursor visibly moves to the element being discussed and
the page scrolls to bring content into view. The runner could click and type but had no way to move
the pointer to an element or scroll the viewport as explicit, recordable steps. How should pointer
movement and scrolling be expressed, and how should mouse positioning default when the author does not
specify exact coordinates?

## Decision Drivers

* Recordings need a visible cursor moving to the relevant element to be instructive.
* Scrolling is required to reveal off-screen content before interacting with it.
* Authors should not have to compute pixel offsets for the common case.

## Considered Options

* **A. `moveMouse` and `scroll` actions, with centered alignment defaults for moveMouse** (chosen).
* **B. Derive cursor motion implicitly from click targets only.**

## Decision Outcome

Chosen option: **A**. A `moveMouse` action moves the pointer to a found element (with an
install-mouse-helper cursor overlay so the motion is visible in recordings), and a `scroll` action
scrolls the viewport. `moveMouse` defaults to `alignH/alignV: "center"` with `offsetX/offsetY: 0`, so
the common case (move to the element's center) needs no coordinates. As part of the same refinement,
`find` always synthesizes a `wait` sub-action (`wait={}`) so the element is given time to appear
before the pointer moves to it.

### Consequences

* Good: recordings show deliberate, legible cursor motion and scrolling.
* Good: center-by-default alignment removes per-step coordinate math.
* Neutral: `moveMouse` is later refactored into `moveTo` (standalone and as a find sub-action) in the
  v2 era; the centered-default semantics carry forward.

### Confirmation

Shipped 2022-05-18 (`86a9b92`, `bd33e4e`) for the `moveMouse`/`scroll` actions and the
install-mouse-helper overlay, refined 2022-10-19 (`61c5db68`, `9a3285b7`) for the centered alignment
defaults and the synthesized `find` wait sub-action.

## Pros and Cons of the Options

### A. Explicit moveMouse/scroll with centered defaults
* Good: legible recordings; ergonomic defaults; explicit author control.
* Bad: two more actions plus an OS-specific cursor overlay to maintain.

### B. Implicit cursor motion from clicks
* Good: nothing extra to author.
* Bad: no standalone pointer moves or scrolls; poor recording narration.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 86a9b92, bd33e4e, 61c5db68,
9a3285b7. Inventory ref: BACKFILL-INVENTORY.md Seq 21, 49. Related: ADR 00068 (standalone moveTo and
stopRecording), ADR 00025 (supercharged find sub-actions).
