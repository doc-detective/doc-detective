---
status: accepted
date: 2025-11-13
decision-makers: doc-detective maintainers
---

# httpRequest response.required field-path assertions

## Context and Problem Statement

The `httpRequest` step can assert response status, headers, and a deep body comparison, but a deep
comparison requires knowing (and pinning) exact values. Documentation often needs a weaker, more
durable assertion: that a response *contains* certain fields — e.g. `data.id` or `items[0].token` —
regardless of their concrete values, which may be dynamic. How should `httpRequest_v3` express
"these fields must exist" without forcing an exact-value match?

## Decision Drivers

* API docs need existence assertions on response fields whose values are dynamic.
* The assertion must address nested fields by dot/bracket path, not just top-level keys.
* "Exists" must accept any value, including `null`, to distinguish presence from value.
* The default must be a no-op so existing httpRequest steps are unaffected.

## Considered Options

* **A. A `response.required` array of dot/bracket field paths that must exist (any value, including
  `null`), default `[]`; the runner fails the step listing missing fields** (chosen).
* **B. Reuse the deep `response.body` comparison with wildcard/placeholder values.**
* **C. Capture each field via an expression and assert non-undefined separately.**

## Decision Outcome

Chosen option: **A**, because a dedicated path list is the clearest contract for existence checks and
keeps value-matching (`response.body`) orthogonal. The contract: `httpRequest_v3` gains
`response.required`, an array of dot/bracket field paths (e.g. `data.id`, `items[0].token`) that must
exist in the response — any value, including `null`, satisfies the check; the default is `[]` (no
required fields). The runner walks each path with a `fieldExistsAtPath` helper and FAILs the step,
listing the missing field paths (schema `doc-detective-common` `fff0569`; runner `doc-detective-core`
`07523f04`).

### Consequences

* Good: durable presence assertions on dynamic responses without pinning values.
* Good: nested fields addressable by path; `null` counts as present.
* Bad: a typo'd path silently asserts a field the API never returns (reported as missing).
* Neutral: complements, rather than replaces, the deep `response.body` value comparison.

### Confirmation

`httpRequest_v3` schema carries `response.required` (array, default `[]`) in `doc-detective-common`
`fff0569`; the runner's `fieldExistsAtPath` FAIL-with-missing-list lands in `doc-detective-core`
`07523f04`.

## Pros and Cons of the Options

### A. `response.required` path array
* Good: explicit existence contract; nested paths; `null`-aware.
* Bad: paths are stringly-typed; typos surface only at run time.

### B. Wildcard deep body match
* Good: reuses existing comparison.
* Bad: overloads value-matching with placeholders; awkward and ambiguous.

### C. Expression-extract + assert
* Good: maximally flexible.
* Bad: verbose per field; no first-class "these must exist" contract.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commit `fff0569`,
`doc-detective-core` commit `07523f04`. Inventory ref: BACKFILL-INVENTORY.md Seq 193. Related:
`00030` (httpRequest action), `00096` (v3 action-as-key schema redesign).
