---
status: accepted
date: 2025-11-26
decision-makers: doc-detective maintainers
---

# Respect explicit `false` for recursive and detectSteps

## Context and Problem Statement

When the wrapper merged the resolved config, it defaulted `recursive` and `detectSteps` with the
`||` operator: `config.recursive || true` and `config.detectSteps || true`. Because `false || true`
evaluates to `true`, an author who *explicitly set* `recursive: false` or `detectSteps: false` had
their choice silently overridden — the values were impossible to turn off through config. Only
`undefined`/missing should fall back to the default; an explicit `false` must be honored. How should
the merge distinguish "unset" from "set to false"?

## Decision Drivers

* An explicit `false` for `recursive`/`detectSteps` must be preserved, not coerced to `true`.
* A missing value should still default to `true`.
* The fix must be minimal and not change behavior for `true`/unset cases.
* The two fields share the same falsy-coercion bug and should be fixed together.

## Considered Options

* **A. Replace `|| true` with `?? true` (nullish coalescing) so only `null`/`undefined` defaults to
  `true` and an explicit `false` is respected** (chosen).
* **B. Explicit `typeof === "boolean"` guards before applying the default.**
* **C. Drop the default entirely and require the value everywhere.**

## Decision Outcome

Chosen option: **A**, because nullish coalescing precisely expresses "default only when unset" and is
the smallest correct change. The contract: the wrapper computes `config.recursive ?? true` and
`config.detectSteps ?? true` (replacing `|| true`), so an explicit `false` survives the merge while a
missing value still defaults to `true` (commit `2f0d969`, PR #160, `doc-detective`).

### Consequences

* Good: `recursive: false` and `detectSteps: false` now behave as written.
* Good: one-token change per field; no behavior change for `true`/unset.
* Bad: none material — corrects a latent coercion bug.
* Neutral: reinforces the convention that only nullish values trigger config defaults.

### Confirmation

The wrapper uses `config.recursive ?? true` / `config.detectSteps ?? true` as of `doc-detective`
commit `2f0d969` (PR #160). Confirmed by an explicit `false` reaching the resolver/runner unchanged.

## Pros and Cons of the Options

### A. `?? true` nullish coalescing
* Good: precise "default-when-unset"; minimal change.
* Bad: relies on readers knowing `??` vs `||` semantics.

### B. Explicit boolean guards
* Good: maximally readable intent.
* Bad: more verbose for an identical outcome.

### C. Remove the default
* Good: no implicit behavior.
* Bad: breaks every caller relying on the `true` default.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective` commit `2f0d969` (PR #160).
Inventory ref: BACKFILL-INVENTORY.md Seq 197. Related: `00088` (detectSteps test-level precedence),
`00004` (recursive directory walk).
