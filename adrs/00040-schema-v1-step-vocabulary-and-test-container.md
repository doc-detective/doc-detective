---
status: accepted
date: 2023-01-30
decision-makers: doc-detective maintainers
---

# Schema v1 step vocabulary and the test_v1 spec-file container

## Context and Problem Statement

With the engine unbundled and a standalone schema package in place (draft 2020-12 + dynamic loader),
the project needed to pin down *which* step types exist as v1 and *how* a spec file declares a list
of tests made of those steps. There was no canonical, validated vocabulary of actions and no
spec-file shape that enforced "an action must be one of the known step types." What is the v1 action
set, and what container shape validates a spec file against it?

## Decision Drivers

* A fixed, validated set of action schemas so specs can be checked against known step types.
* A spec-file container that lets each test list arbitrary valid actions.
* Constrained value sets (e.g. click button, HTTP method) enforced at the schema level.
* Composition via `$ref` so the container references the per-action schemas rather than duplicating
  them.

## Considered Options

* **A. 13 per-action v1 schemas + a `test_v1` container whose actions are a `oneOf` over them** (chosen).
* **B. A single freeform action schema with a loose `action` string.**
* **C. Inline all action shapes directly in the container (no `$ref`).**

## Decision Outcome

Chosen option: **A**, because per-action schemas keep each contract focused and a `oneOf`-of-`$ref`
container validates that every authored action is one of the known v1 steps.

Behavior decided:

1. **v1 action vocabulary** — 13 step schemas: `checkLink`, `click`, `find`, `goTo`, `httpRequest`,
   `matchText`, `moveMouse`, `screenshot`, `scroll`, `startRecording`, `stopRecording`, `type`,
   `wait`. Constrained enums include the click `button` set and HTTP `method` set.
2. **`test_v1` container** — a `testObject` with a `tests[]` array; each test's `actions[]` is a
   `oneOf` of `$ref`s to every v1 step schema. This is the spec-file contract that validates an
   authored test file.

### Consequences

* Good: spec files are validatable against a precise, enumerated step set.
* Good: each action contract is isolated and individually versionable.
* Good: enum constraints (button/method) catch invalid values at validation time.
* Neutral: this v1 family is later superseded by the v2 (`const` action) and v3 (action-as-key)
  redesigns; v1 is the baseline they evolve from.
* Bad: a large `oneOf` grows with every new step type.

### Confirmation

Shipped behavior in `common`: the per-action `*.schema.json` files and `test_v1` with the `tests[]` /
`oneOf`-`$ref` actions shape.

## Pros and Cons of the Options

### A. Per-action schemas + test_v1 oneOf container
* Good: precise, validatable, composable, versionable.
* Bad: large `oneOf`; many files.

### B. Single freeform action schema
* Good: minimal files.
* Bad: no per-action validation; loose `action` string defeats the contract.

### C. Inline shapes in the container
* Good: one file.
* Bad: duplication; unwieldy; no per-action reuse.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `b9e3a6b6` (action
vocabulary) and `d7dca149` (`test_v1`). Inventory ref: BACKFILL-INVENTORY.md Seq 58, 61. Related:
schema package + draft 2020-12 (`00038`), AJV adoption (`00041`), and the v2/v3 schema redesigns
(`00046`, `00096`).
