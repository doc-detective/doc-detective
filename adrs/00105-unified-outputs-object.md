---
status: accepted
date: 2025-04-13
decision-makers: doc-detective maintainers
---

# Unified outputs object threaded into expression context

## Context and Problem Statement

The expressions runtime (`00104`) could evaluate `{{…}}` over meta values, but each step type still shaped its results differently — `runShell` exposed `exitCode`/`stdio`, `httpRequest` exposed response fields, `find` exposed element data — with no single, predictable tree for expressions to read. For `{{…}}` to be authorable, the values an expression can reference had to be unified into one consistently-structured object and made available inside `runStep`. What is the canonical output shape, and how does it reach the expression evaluator?

## Decision Drivers

* Expressions need one predictable tree of values to reference, not per-step ad-hoc shapes.
* `runShell`, `httpRequest`, and `find` outputs must be normalized into that tree.
* The value tree must be threaded into `runStep` so expressions evaluate against the live run state.
* Element outputs should be pruned to a minimal, stable shape.

## Considered Options

* **A. A unified `outputs` object with normalized per-step results, threaded into `runStep` as the expression context** (chosen).
* **B. Keep per-step result shapes and special-case each in the expression evaluator.**
* **C. Flatten everything into `process.env` only.**

## Decision Outcome

Chosen option: **A**, because a single normalized tree is what makes expressions predictable to author. The contract:

1. Step results restructured into a unified **`outputs`** object: `runShell` exposes `exitCode`/`stdio`; `httpRequest` exposes `outputs.response` (with `statusCode`).
2. A **`metaValues` tree** is threaded into `runStep` to serve as the expression-evaluation context.
3. Element outputs pruned to **`{text}`**.
4. The v2→v3 expression migration was authored in `common` alongside (`2902138a`, `0feb35b1`, `e030315b`, `31b76334`).

Commits `0df134cb`, `5de8d2cc`, `535fa08a`, `1118129f` in `core`.

### Consequences

* Good: one predictable `outputs` tree for expressions to reference across all step types.
* Good: expressions evaluate against live run state via the threaded `metaValues`.
* Neutral: element outputs later re-enriched with attributes (`00117` `setElementOutputs`).
* Bad: any consumer of the old per-step result shapes must move to `outputs`.

### Confirmation

Shipped in `core` commits `0df134cb`, `5de8d2cc`, `535fa08a`, `1118129f` plus the `common` migration commits; `outputs.response`/`exitCode`/`stdio`/`outputs.element.text` available to `{{…}}` is the confirming behavior.

## Pros and Cons of the Options

### A. Unified outputs threaded into runStep
* Good: predictable expression context; normalized across steps.
* Bad: breaks old per-step result consumers.

### B. Per-step shapes + special-casing
* Good: no result restructuring.
* Bad: expression evaluator becomes a pile of special cases.

### C. process.env only
* Good: simple.
* Bad: loses structure (nested objects/arrays); collides on names.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `0df134cb`, `5de8d2cc`, `535fa08a`, `1118129f`; doc-detective-common `2902138a`, `0feb35b1`, `e030315b`, `31b76334`. Inventory ref: BACKFILL-INVENTORY.md Seq 156. Related: `00104` (expressions runtime), `00117` (rich element outputs).
