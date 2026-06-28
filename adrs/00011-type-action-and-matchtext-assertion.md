---
status: accepted
date: 2022-05-07
decision-makers: doc-detective maintainers
---

# Type action and matchText assertion

## Context and Problem Statement

The genesis runner could open a page, find a single CSS-selected element, and click it, but it could
neither enter text into an input nor assert that the page contained expected text. To test real
documented procedures (filling forms, verifying on-screen labels), the action vocabulary needed a way
to send keystrokes to a found element and a way to assert that text is present. How should typing and
text assertion be expressed as actions, and what should their fields and verdicts be?

## Decision Drivers

* Procedures routinely involve typing into fields and confirming on-screen text.
* The action enum must stay the single source of truth for what the runner can do.
* Typing must support special keys (e.g. Enter) that follow the typed characters.
* Text assertions should produce a normal PASS/FAIL verdict like any other action.

## Considered Options

* **A. Add `type` and `matchText` as first-class actions** (chosen).
* **B. Fold text entry into the existing `find`/`click` path with extra fields.**
* **C. Defer assertions to an external harness and keep the runner action-only.**

## Decision Outcome

Chosen option: **A**, because each is a distinct documented user behavior with its own contract, and
the action enum is the established extension point. The `type` action sends `action.keys` to the
currently found element via `typeElement`, with an optional `trailingSpecialKey` appended after the
keystrokes. The `matchText` action asserts that expected text is present and resolves to PASS/FAIL.
Both `matchText` and `curl` were added to the action enum alongside the `type` handler.

### Consequences

* Good: form-filling and text verification become directly expressible in tests.
* Good: `trailingSpecialKey` covers submit-on-Enter without a separate keypress action.
* Neutral: `matchText` later evolves substantially — it becomes a nested `find` sub-action (Seq 31)
  and folds entirely into `find`'s inline assertions in the v2 redesign (Seq 70) — but the
  text-assertion contract originates here.
* Bad: `type` depends on a prior `find` having set the active element, an implicit ordering coupling.

### Confirmation

Shipped in the 2022-05-07 commits: `typeElement` handler, the enum additions, and the `matchText()`
assertion. Later re-expressed through the v1/v2 step schemas in `doc-detective-common`.

## Pros and Cons of the Options

### A. First-class `type` and `matchText` actions
* Good: clean mapping from documented behaviors to actions; enum stays authoritative.
* Bad: implicit dependence on the find-set active element.

### B. Fold into find/click
* Good: fewer action names.
* Bad: overloads find/click semantics; harder to validate and report distinctly.

### C. External assertion harness
* Good: keeps the runner minimal.
* Bad: breaks the self-contained "docs as tests" model; no inline assertions.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 4cbb04aa, 47f0fb70, 1c2fae2c.
Inventory ref: BACKFILL-INVENTORY.md Seq 12. Related: ADR 00010 (click), ADR 00025 (supercharged
find sub-actions), ADR 00048 (find inline sub-actions v2 redesign).
