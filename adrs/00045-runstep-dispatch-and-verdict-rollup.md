---
status: accepted
date: 2023-03-04
decision-makers: doc-detective maintainers
---

# `runStep` action dispatch and FAIL > WARNING > PASS verdict roll-up

## Context and Problem Statement

The core runner had to turn a tree of specs → tests → contexts → steps into a single, predictable
result. Two things were missing: a uniform way to dispatch each step to its handler based on the
step's `action`, and a deterministic rule for combining many step results into one verdict at each
level of the tree. Without these, every action returned an ad-hoc shape and there was no agreed
precedence for mixing passes, warnings, and failures. How should steps be dispatched and how should
verdicts roll up?

## Decision Drivers

* One dispatch point keyed on `step.action`, with a defined behavior for unknown actions.
* A uniform per-step result shape every handler returns.
* A single, associative roll-up rule so the same results always produce the same verdict.
* Drive the engine only when needed (don't warm up Appium for non-browser tests).

## Considered Options

* **A. `runStep(step)` keyed on `step.action` + FAIL>WARNING>PASS roll-up** (chosen).
* **B. Per-action methods called directly by the test loop (no central dispatch).**
* **C. Last-step-wins or count-based verdict aggregation.**

## Decision Outcome

Chosen option: **A**, because a single dispatch point and an associative precedence rule make
results deterministic and easy to reason about. `runStep` switches on `step.action` and returns a
standard `{status, description}`; an unknown action yields **FAIL**. Results roll up by the
precedence **FAIL > WARNING > PASS** at every level (step → context → test → spec), so any failure
dominates a warning and any warning dominates a pass. Appium warm-up is gated by `isAppiumRequired`
so non-browser tests don't pay for a driver. This dispatch-and-rollup contract underpins later
verdict work: `SKIP`→`SKIPPED` canonicalization (`00067`), the WARNING third verdict for timeouts
(`00106`), and stop-on-fail step skipping (`00117`).

### Consequences

* Good: deterministic verdicts; one place to add or change action handling.
* Good: unknown actions fail loudly instead of being silently ignored.
* Good: no Appium cost for tests that don't need a browser.
* Neutral: the standard `{status, description}` shape constrains handlers; richer step results are
  spread in later work (`00074`).

### Confirmation

`runStep` dispatch and the FAIL>WARNING>PASS roll-up are implemented in `doc-detective-core`;
observable in result objects at every tree level and in the unknown-action FAIL path.

## Pros and Cons of the Options

### A. Central `runStep` + precedence roll-up
* Good: deterministic, single dispatch point, loud unknown-action handling.
* Bad: every handler must conform to one result shape.

### B. Direct per-action calls
* Good: no dispatch indirection.
* Bad: scattered logic; inconsistent result shapes; harder to extend.

### C. Last-wins / count-based aggregation
* Good: trivial.
* Bad: non-deterministic or misleading verdicts when results mix.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `db3d7108`, `0ae5d767`, `3f7d1ad4`
(dispatch + roll-up). Inventory ref: BACKFILL-INVENTORY.md Seq 66. Verdict model evolves in
`00067`, `00106`, `00117`; step-result shape in `00074`.
