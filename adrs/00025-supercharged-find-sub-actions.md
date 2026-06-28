---
status: accepted
date: 2022-09-15
decision-makers: doc-detective maintainers
---

# Supercharged find with nested sub-actions

## Context and Problem Statement

Locating an element and then acting on it required two separate steps: a `find` to assert the element
existed, followed by a standalone `click`/`type`/`moveMouse` that re-resolved the same selector.
This duplicated selectors and let the two steps drift apart. Should `find` stay a pure existence
assertion, or should it become a composite step that runs follow-on actions directly against the
element it located?

## Decision Drivers

* Re-resolving the same selector in a follow-on step is redundant and error-prone.
* Authors think in terms of "find this, then act on it" as one operation.
* Sub-actions must run against the element `find` already matched, not a fresh query.
* Removing the now-redundant `moveMouse` from `click` keeps responsibilities clear.

## Considered Options

* **A. `find` gains nested sub-actions (`matchText`/`moveMouse`/`click`/`type`/`wait`) executed against the found element** (chosen).
* **B. Keep `find` as a pure assertion; require separate follow-on steps.**
* **C. Add an explicit element-handle variable passed between steps.**

## Decision Outcome

Chosen option: **A**, because binding follow-on actions to the element `find` already located removes
selector duplication and matches how authors describe interactions. `find` was extended so nested
sub-objects (`matchText`, `moveMouse`, `click`, `type`, and `wait`) execute against the found
element, with the matched element's `css` injected into each sub-action. `moveMouse` was removed from
`click` (it became a `find` sub-action instead), and `wait` was added as a `find` sub-action.

This "supercharged find" composite shape was later formalized and reshaped in the v2 schema, where
`find` absorbed click/moveTo/typeKeys and the standalone variants were removed (see `00048`).

### Consequences

* Good: one step locates and acts; no duplicated selectors.
* Good: sub-actions reliably target the already-matched element.
* Bad: `find` grows from an assertion into a composite, increasing its surface.
* Neutral: shifts `moveMouse`/`wait` semantics into the `find` sub-action model.

### Confirmation

Shipped in commits `8610f20`, `93664ce`, `d742ef2`; the `find` branch executes sub-objects with the
injected `css`. Later redesign confirmed by `00048`.

## Pros and Cons of the Options

### A. Nested find sub-actions
* Good: composite locate-then-act; no selector drift.
* Bad: heavier `find` surface.

### B. Pure-assertion find + separate steps
* Good: each step single-purpose.
* Bad: duplicate selectors; steps can diverge.

### C. Element-handle variable
* Good: explicit data flow.
* Bad: new variable plumbing; more verbose specs.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `8610f20`, `93664ce`,
`d742ef2`. Inventory ref: BACKFILL-INVENTORY.md Seq 31, 33. Reshaped by `00048` (v2 find redesign).
