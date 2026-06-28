---
status: accepted
date: 2022-05-06
decision-makers: doc-detective maintainers
---

# `find` action collapsed to a single CSS selector

## Context and Problem Statement

Locating an element on the page is the foundation of every UI assertion. The early `find` action exposed multiple locator strategies (`element_*` variants and XPath). The commits `565cfa43`, `b5eac578` (2022-05-06) collapsed `find` to a **single `css` selector field**, removing the `element_*` and XPath variants. Should the tool offer many locator strategies, or standardize on one?

## Decision Drivers

* Multiple overlapping locator fields complicate authoring and the schema.
* CSS selectors cover the overwhelming majority of element-location needs.
* A single field is easier to validate and document.
* `find` is consumed by other actions (click/type), so a simple, uniform locator helps composition.

## Considered Options

* **A single `css` selector field** (chosen).
* **Keep multiple locator strategies (`element_*`, xpath, css).**
* **XPath-only locating.**

## Decision Outcome

Chosen option: **a single `css` selector**, because CSS covers nearly all cases and one locator field keeps authoring, validation, and downstream composition simple.

Behavior decided:

1. `find` locates an element via one `css` selector field.
2. The prior `element_*` and XPath locator variants were removed.

### Consequences

* Good: simplest possible locator contract; easy to author and validate.
* Good: uniform input for composing actions (click/type against the found element).
* Bad: text/XPath-style matching is not available at this stage (later reintroduced, e.g. XPath `normalize-space()` text match and multi-criteria finding in 2025).
* Neutral: `find` later grows nested sub-actions and richer criteria, but the css-first locator remains central.

### Confirmation

Observable in the `findElement` call and the `element_*` → `css` field change.

## Pros and Cons of the Options

### Single `css` selector
* Good: minimal, uniform, easy to validate.
* Bad: no built-in text/XPath strategy at this stage.

### Multiple locator strategies
* Good: maximum flexibility.
* Bad: overlapping fields; harder schema and docs.

### XPath-only
* Good: very expressive.
* Bad: less familiar than CSS to most doc authors.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `565cfa43`, `b5eac578`. Inventory ref: BACKFILL-INVENTORY.md Seq 9. Related: ADR 00010 (`click`), ADR 00025 (supercharged `find` sub-actions).
