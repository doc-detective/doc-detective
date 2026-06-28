---
status: accepted
date: 2025-08-22
decision-makers: doc-detective maintainers
---

# dragAndDrop step type

## Context and Problem Statement

UI documentation frequently describes drag-and-drop interactions (reordering lists, moving cards, dropping files into zones), but Doc Detective had no step to verify them — `click` and `moveMouse` could not express a sustained drag from a source element to a target. The runner needed a `dragAndDrop` step. What should its contract be, and how should it work across drivers given that HTML5 drag-and-drop is notoriously inconsistent under WebDriver?

## Decision Drivers

* Drag-and-drop interactions are common in documented UIs and need verification.
* HTML5 drag-and-drop is unreliable through raw WebDriver actions alone.
* The step must identify both a source and a target element unambiguously.
* The step shape should follow the v3 action-as-key convention (`00096`).

## Considered Options

* **A. `dragAndDrop_v3` with required source + target elementSpecifications, default duration, and an HTML5-simulation primary path with a WebDriver-actions fallback** (chosen).
* **B. WebDriver native actions only.**
* **C. Coordinate-based drag (from x,y to x,y).**

## Decision Outcome

Chosen option: **A**, because element-specified source/target is robust to layout shifts in a way raw coordinates are not, and simulating the HTML5 drag-and-drop event sequence first (with a WebDriver-actions fallback) works across more real pages than either approach alone.

Contract decided:

* `dragAndDrop_v3` step requiring both a `source` and a `target` elementSpecification, with a `duration` defaulting to `1000` ms.
* Runner attempts an HTML5 drag-and-drop simulation, falling back to WebDriver actions.
* The resolver registers it as a `driverAction`.
* `findStrategies` requires **both** selector and text to match when both are supplied (tightened matching).

### Consequences

* Good: drag-and-drop UIs become testable.
* Good: HTML5 simulation + WebDriver fallback maximizes cross-page reliability.
* Neutral: requiring both source and target makes the minimal step more verbose than a single-target click.

### Confirmation

Schema in doc-detective-common `301c0ad`; runner HTML5-sim + WebDriver fallback in core `ff602f2`; resolver `driverAction` registration `75c95b5`.

## Pros and Cons of the Options

### A. HTML5-sim + WebDriver fallback, element-specified
* Good: robust to layout; works across more pages.
* Bad: two code paths to maintain.

### B. WebDriver actions only
* Good: simplest implementation.
* Bad: HTML5 drag-and-drop often does not fire under raw actions.

### C. Coordinate-based
* Good: no element resolution needed.
* Bad: brittle to any layout change.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common `301c0ad`; core `ff602f2`; resolver `75c95b5`. Inventory ref: BACKFILL-INVENTORY.md Seq 184. Related: `00096` (v3 action-as-key family).
