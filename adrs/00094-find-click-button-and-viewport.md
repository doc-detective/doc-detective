---
status: accepted
date: 2025-01-18
decision-makers: doc-detective maintainers
---

# find.click.button and context viewport

## Context and Problem Statement

The `find` step (v2) could click an element it located, but always issued a left click — there was no way to express a right- or middle-click against a found element. Separately, the test `context` had no way to declare the browser viewport size, so layout-sensitive procedures and screenshots could not pin a width/height. What contract should express the mouse button for a find-driven click, and how should a context declare viewport dimensions?

## Decision Drivers

* Documentation procedures sometimes describe right-click / context-menu interactions.
* The button choice belongs on the click sub-action of `find`, not as a new step.
* Layout-dependent tests need a deterministic viewport.
* Both additions must fit the existing v2 schema shape.

## Considered Options

* **A. Add `find_v2.click.button` enum + `context_v2` viewport width/height** (chosen).
* **B. A standalone `rightClick` step plus a config-level viewport.**
* **C. Leave button as left-only; size the window via browser options only.**

## Decision Outcome

Chosen option: **A**. `find_v2` gains a `click.button` field with the enum `left` / `right` / `middle`, defaulting to `left`, so a found element can be clicked with any mouse button. `context_v2` gains viewport `width`/`height` fields so a context fixes the rendering size for layout-sensitive steps and screenshots.

### Consequences

* Good: right/middle clicks expressible without a new step type.
* Good: deterministic viewport per context.
* Neutral: button lives on `find.click`, not as a top-level field.
* Neutral: this v2 shape is carried into the v3 redesign (`00096`).

### Confirmation

Shipped in common commits `e76cfdcd` (find click button) and `04338977` (context viewport). Covered by the schema example fixtures.

## Pros and Cons of the Options

### A. find.click.button enum + context viewport
* Good: minimal, schema-native additions.
* Bad: button is nested under the click sub-action.

### B. Standalone rightClick + config viewport
* Good: explicit step name.
* Bad: duplicates find/click logic; viewport divorced from context.

### C. No change
* Good: nothing to add.
* Bad: no right-click; no deterministic layout sizing.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `e76cfdcd`, `04338977`. Inventory ref: BACKFILL-INVENTORY.md Seq 137. Related: `00096` (v3 find/click redesign).
