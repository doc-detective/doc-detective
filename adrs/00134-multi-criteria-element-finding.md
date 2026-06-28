---
status: accepted
date: 2025-11-16
decision-makers: doc-detective maintainers
---

# Multi-criteria element finding

## Context and Problem Statement

Element-targeting actions (`find`, `click`, `screenshot`, `type`, `dragAndDrop`) located elements by
CSS selector or visible text. Real documentation often needs to target an element by other stable
attributes — its `id`, a test id, a class, an arbitrary attribute, or an ARIA role/label — and a
plain string shorthand should "just find it" without the author specifying which attribute matched.
How should the object form express these additional criteria, and what should the bare-string
shorthand mean?

## Decision Drivers

* Authors need to target elements by id, test id, class, attribute, or ARIA, not only selector/text.
* Each criterion should accept a string or array, support regex, and test presence.
* A bare string should remain a low-ceremony shorthand that finds an element however it can.
* The behavior must be consistent across every element-targeting action.

## Considered Options

* **A. Add `elementId`/`elementTestId`/`elementClass`/`elementAttribute`/`elementAria` criteria
  (string or array, regex, presence) to every element object form; make the string shorthand a
  multi-field OR; the runner resolves criteria in parallel as an OR** (chosen).
* **B. Keep selector/text only and require authors to write CSS/XPath for everything else.**
* **C. Add a single generic `elementMatch` map of attribute→value pairs.**

## Decision Outcome

Chosen option: **A**, because first-class named criteria read clearly and the OR semantics make the
bare-string shorthand robust. The contract: the object form of `find`/`click`/`screenshot`/`type`/
`dragAndDrop` gains `elementId`, `elementTestId`, `elementClass`, `elementAttribute`, and
`elementAria`, each accepting a string or array, supporting regex and presence checks. A bare-string
shorthand is treated as a multi-field OR across these criteria (plus selector/text). The runner's
`findByCriteria` evaluates the criteria as a parallel OR and returns the first match (schema
`doc-detective-common` `158a270`, `c6376be`, `2c07987`; runner `doc-detective-core` `983de50`).

### Consequences

* Good: stable targeting by id/test-id/class/attribute/ARIA without hand-written selectors.
* Good: bare-string shorthand finds elements by any criterion (OR), lowering authoring friction.
* Bad: an over-broad string can match more than one element; first-match wins.
* Neutral: criteria are uniform across all element-targeting actions, so the contract is learned once.

### Confirmation

Schema fields land across `doc-detective-common` `158a270`, `c6376be`, `2c07987`; the
`findByCriteria` parallel-OR resolver ships in `doc-detective-core` `983de50`.

## Pros and Cons of the Options

### A. Named criteria + string-shorthand OR
* Good: clear, regex/presence-capable, uniform across actions.
* Bad: broad shorthand can be ambiguous (first match wins).

### B. Selector/text only
* Good: nothing new to learn.
* Bad: forces brittle CSS/XPath for id/attribute/ARIA targeting.

### C. Generic `elementMatch` map
* Good: one field covers all attributes.
* Bad: loses named-criterion clarity, regex/presence nuance, and ARIA-specific semantics.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commits `158a270`,
`c6376be`, `2c07987` and `doc-detective-core` commit `983de50`. Inventory ref: BACKFILL-INVENTORY.md
Seq 194. Related: `00048`/`00100` (find redesigns), `00158` (origin/params — sibling element/URL
contract work).
