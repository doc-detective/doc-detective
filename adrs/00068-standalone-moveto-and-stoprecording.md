---
status: accepted
date: 2023-12-14
decision-makers: doc-detective maintainers
---

# Standalone moveTo and stopRecording

## Context and Problem Statement

Cursor movement existed only as a boolean sub-option of `find` (`find.moveTo`), which couldn't
express *where* to move (a selector, alignment, offset, duration). Recording also needed a versioned
stop action that could stand on its own in a test's step list. To support cursor-driven recordings
and clearer authoring, we needed a standalone `moveTo` action and a `stopRecording_v2` action, and we
needed `find.moveTo` to carry configuration rather than just on/off. What should these action shapes
be?

## Decision Drivers

* Cursor movement needs target, alignment, offset, and timing — a boolean can't express that.
* `find.moveTo` should configure the move, not just toggle it.
* Recording stop must be a first-class, versioned action usable directly in steps.
* Start/stop recording must be part of the test-steps union so they validate as steps.

## Considered Options

* **A. A standalone `moveTo` action (selector, alignment enum, offset, duration default `500`); promote `find.moveTo` from bool→object; add `stopRecording_v2`; include start/stopRecording in the test-steps union** (chosen).
* **B. Keep `moveTo` only as a `find` sub-option; extend the boolean into an object there only.**
* **C. No standalone movement; rely on click position.**

## Decision Outcome

Chosen option: **A**, because cursor movement is a meaningful step in its own right (especially for
recordings) and deserves a real action shape. A standalone `moveTo` action is added with a `selector`,
an `alignment` enum, an `offset`, and a `duration` (default `500` ms). `find.moveTo` is promoted from
a boolean to an object so it carries the same movement configuration. A versioned `stopRecording_v2`
action is added, and start/stopRecording actions are included in the test-steps union so they validate
as ordinary steps.

### Consequences

* Good: cursor movement is fully configurable and reusable outside `find`.
* Good: recording stop is a first-class, versioned, validatable step.
* Bad: `find.moveTo` changing from bool→object is a shape change older specs must follow.
* Neutral: these v2-era action shapes are later restated under the v3 action-as-key schema.

### Confirmation

Shipped in common `aef6d5f`, `f842cda` (standalone `moveTo`, `stopRecording_v2`, `find.moveTo`
object, recording actions in the steps union). Exercised by recording fixtures that move the cursor
to a selector and stop recording as discrete steps.

## Pros and Cons of the Options

### A. Standalone `moveTo` + `stopRecording_v2` + object `find.moveTo`
* Good: expressive, reusable, validatable.
* Bad: bool→object migration for `find.moveTo`.

### B. `find`-only object move
* Good: smaller surface.
* Bad: can't move the cursor outside a find.

### C. No standalone movement
* Good: nothing new.
* Bad: no cursor control for recordings/walkthroughs.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `aef6d5f`, `f842cda`.
Inventory ref: BACKFILL-INVENTORY.md Seq 99. Related: `00017` (moveMouse/scroll actions), `00069`
(FFmpeg recording engine, cursor overlay), `00096` (v3 action-as-key redesign).
