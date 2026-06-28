---
status: accepted
date: 2025-04-14
decision-makers: doc-detective maintainers
---

# goTo waits for readyState=complete; timeout becomes WARNING

## Context and Problem Statement

The `goTo` step navigated the browser but did not wait for the page to finish loading before subsequent steps ran, so a `find` or `screenshot` immediately after a `goTo` could race an incomplete page. The natural fix is to wait for the document to be ready — but that raises a verdict question: if a page never reaches a ready state within the timeout, is that a hard FAIL (the test author's procedure is broken) or a softer signal (the page was slow, but the navigation itself happened)? How should `goTo` wait, and what verdict should a wait timeout produce?

## Decision Drivers

* Steps after `goTo` must not race a page that hasn't finished loading.
* A slow page is not the same failure class as a wrong assertion — a hard FAIL overstates it.
* A timeout should still surface visibly, not pass silently.
* The verdict model needed a middle state between PASS and FAIL for soft regressions.

## Considered Options

* **A. `goTo` waits for `document.readyState === "complete"`; a wait timeout yields WARNING (a third verdict state)** (chosen).
* **B. Wait for readyState; timeout yields FAIL.**
* **C. Don't wait; leave timing to explicit `wait` steps.**

## Decision Outcome

Chosen option: **A**, because navigation succeeding-but-slow is a soft signal, and the existing PASS/FAIL pair could not express it. The contract:

1. `goTo` waits for **`document.readyState === "complete"`**, default timeout **15000 ms**.
2. A wait timeout sets the step result to **WARNING** — establishing WARNING as a third verdict state (distinct from FAIL) at the step level.

Commit `dcec4374` in `core`.

### Consequences

* Good: downstream steps see a loaded page; fewer flaky `find`/`screenshot` races.
* Good: slow pages surface as WARNING without failing the run.
* Neutral: the WARNING verdict is later reused for visual/output regressions (`00135`) and the `waitUntil` conditions extend `goTo` waiting (`00136`).
* Bad: authors who want a slow page to hard-fail must assert it explicitly.

### Confirmation

Shipped in `core` commit `dcec4374`; `goTo` blocking on `readyState=complete` and emitting WARNING on timeout is the confirming behavior.

## Pros and Cons of the Options

### A. readyState wait + WARNING on timeout
* Good: no race; soft signal preserved and visible.
* Bad: introduces a third verdict to reason about.

### B. readyState wait + FAIL on timeout
* Good: simpler binary verdict.
* Bad: a slow-but-loaded page fails the test — overstated.

### C. No implicit wait
* Good: explicit and predictable.
* Bad: every author must hand-write waits; easy to forget.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `dcec4374`. Inventory ref: BACKFILL-INVENTORY.md Seq 157. Related: `00135` (regression diffs → WARNING), `00136` (goTo `waitUntil` conditions).
