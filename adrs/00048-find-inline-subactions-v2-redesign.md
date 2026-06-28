---
status: accepted
date: 2023-03-13
decision-makers: doc-detective maintainers
---

# Redesign `find` to absorb inline `click` / `moveTo` / `typeKeys` sub-actions

## Context and Problem Statement

In v1, locating an element and then acting on it required a `find` step followed by separate
standalone `click`, `type`, `scroll`, `moveMouse`, and `matchText` steps that each had to re-target
the same element. This was verbose and fragile — the standalone actions re-found elements and could
drift from the one `find` actually located. The v2 step family (`00046`) reshaped `find`'s fields;
this decision settles the *runtime* model: should acting on a found element be expressed as inline
sub-actions of `find`, or remain separate steps?

## Decision Drivers

* Act on the *same* element `find` located, without re-targeting.
* Reduce step-list verbosity for the common find-then-act pattern.
* One coherent place for element interaction rather than scattered standalone actions.
* Fold text assertion into `find` so matching the element and its text is one step.

## Considered Options

* **A. `find` gains inline `click`/`moveTo`/`typeKeys` sub-actions; remove standalone actions**
  (chosen).
* **B. Keep standalone `click`/`type`/`scroll`/`moveMouse`/`matchText` steps.**
* **C. Add inline sub-actions but also keep the standalone steps.**

## Decision Outcome

Chosen option: **A**. `find` absorbs inline `click`, `moveTo`, and `typeKeys` sub-actions that
operate on the element it located, and `matchText` folds into `find` as text matching. The
standalone `matchText`, `click`, `type`, `scroll`, and `moveMouse` actions are **removed**. A
find-then-act flow is now a single `find` step carrying its sub-actions, eliminating the re-target
drift. This is the runtime realization of the v2 `find` reshape in `00046`; later v3 work continues
the inline model (`find` absorbing more sub-actions, `00100`), while some standalone actions
(e.g. `moveTo`) are reintroduced separately afterward (`00068`).

### Consequences

* Good: act on exactly the element `find` located; no re-targeting drift.
* Good: terser, more readable step lists for the dominant pattern.
* Bad: breaking removal of standalone `click`/`type`/`scroll`/`moveMouse`/`matchText` for v1 authors.
* Neutral: some standalone actions return later by deliberate decision (`00068`), so "inline-only"
  is not permanent for every action.

### Confirmation

The inline-subaction `find` handler and the removal of the standalone actions are implemented in
`doc-detective-core`; observable in v2 test specs where interaction nests under `find`.

## Pros and Cons of the Options

### A. Inline sub-actions, remove standalones
* Good: same-element acting; concise; one interaction surface.
* Bad: breaking change; loses standalone flexibility (partly restored later).

### B. Keep standalone steps
* Good: no migration.
* Bad: verbose; re-target drift; duplicated element logic.

### C. Both inline and standalone
* Good: maximal flexibility.
* Bad: two ways to do one thing; ambiguous, larger surface.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `6231c95f`, `e78421d`, `c59506b`
(find redesign). Inventory ref: BACKFILL-INVENTORY.md Seq 70. Runtime realization of the `find`
reshape in `00046`; continued in `00100`; standalone `moveTo` reintroduced in `00068`.
