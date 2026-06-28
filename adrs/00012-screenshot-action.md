---
status: accepted
date: 2022-05-07
decision-makers: doc-detective maintainers
---

# Screenshot action

## Context and Problem Statement

The `screenshot` action existed in the action enum and a `screenshot(action, page)` handler had been
scaffolded, but the dispatch case was commented out, so tests could not actually capture images.
Documentation testing frequently needs to capture the visual state of a page at a known step (to
embed in docs or to compare against a baseline later). Should screenshot capture be a first-class,
always-available action wired into the runner's dispatch?

## Decision Drivers

* Capturing page imagery at a step is a core "docs as tests" use case (generating doc figures).
* The handler already existed; only the dispatch wiring was missing.
* Screenshots are a building block for later visual-diff and media-management features.

## Considered Options

* **A. Enable the `screenshot` dispatch case so the existing handler runs** (chosen).
* **B. Keep screenshots as a side effect of recording only.**

## Decision Outcome

Chosen option: **A**. The commit un-comments `screenshot(action, page)` in the action switch, making
`screenshot` a first-class action the runner executes against the current page. This establishes the
screenshot contract that later acquires a target directory, visual-diff comparison (`matchPrevious`,
Seq 24 / ADR 00020), crop, and reference-image regression in subsequent decisions.

### Consequences

* Good: tests can capture page imagery deterministically at any step.
* Good: lays the foundation for visual regression and media-directory features.
* Neutral: the initial form is minimal (capture only); options accrete over later ADRs.

### Confirmation

Shipped 2022-05-07 (`1b9f3b05`): the switch case for `screenshot` is enabled, invoking the
pre-existing handler.

## Pros and Cons of the Options

### A. Enable screenshot dispatch
* Good: minimal change; unlocks a core use case immediately.
* Bad: none material — the handler already existed.

### B. Recording-only screenshots
* Good: fewer actions.
* Bad: forces a full recording for a single still; no per-step capture.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit 1b9f3b05. Inventory ref:
BACKFILL-INVENTORY.md Seq 13. Related: ADR 00020 (screenshot visual-diff matching), ADR 00014
(unified media directory).
