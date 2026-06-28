---
status: accepted
date: 2022-05-07
decision-makers: doc-detective maintainers
---

# `click` action

## Context and Problem Statement

Interacting with the UI requires clicking elements — buttons, links, controls — as part of a documented procedure. With `find` already locating an element via a CSS selector (ADR 00008), the runner needed a step that clicks the located element. The commit `0581b404` (2022-05-07) added a `click` action: `runAction`'s `case "click"` finds the element and clicks it. What step should perform a click, and how does it locate its target?

## Decision Drivers

* UI procedures routinely click buttons, links, and controls.
* The click target should reuse the existing CSS-selector locating from `find` (ADR 00008).
* A dedicated action keeps the step vocabulary explicit and enumerable.

## Considered Options

* **A dedicated `click` action that finds-then-clicks via CSS** (chosen).
* **Fold clicking into `find` as an option only.**
* **A coordinate-based click (x/y) rather than selector-based.**

## Decision Outcome

Chosen option: **a dedicated `click` action**, because clicking is a distinct, common step that belongs in the action enum, and reusing the CSS-selector locating keeps it consistent with `find`.

Behavior decided:

1. `click` locates its target element via a CSS selector (`findElement`) and then clicks it (`clickElement`), implemented as `runAction`'s `case "click"`.

### Consequences

* Good: explicit, enumerable click step consistent with `find`.
* Good: selector-based clicks are stable across viewports (unlike coordinates).
* Neutral: clicking is later also offered as a nested sub-action of `find` (ADR 00025) so a single step can find-and-click; the standalone `click` and the inline form coexist and evolve through the v2/v3 schema redesigns.

### Confirmation

Observable in `runAction` `case "click"` performing `findElement` followed by `clickElement`.

## Pros and Cons of the Options

### Dedicated `click` action
* Good: explicit step; reuses CSS locating.
* Bad: a separate find + click is two concerns until the inline form arrives.

### Click only as a `find` option
* Good: one step does both.
* Bad: at this stage `find` is not yet a sub-action host.

### Coordinate-based click
* Good: can hit non-selectable regions.
* Bad: brittle across viewports and themes.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `0581b404`. Inventory ref: BACKFILL-INVENTORY.md Seq 11. Related: ADR 00008 (`find` single CSS selector), ADR 00025 (supercharged `find` sub-actions including inline click).
