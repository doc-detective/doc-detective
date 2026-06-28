---
status: accepted
date: 2025-03-10
decision-makers: doc-detective maintainers
---

# context_v3 and the browsers array redesign

## Context and Problem Statement

A v2 `context` carried per-browser keys (`chrome`, `firefox`, `safari`) as separate fields, which made "run on these browsers" awkward to express and impossible to iterate generically — adding a browser meant adding a field. The v3 redesign asked: how should a context declare its platforms and its browsers so that the set of browsers is a first-class, uniform collection, and how should Safari and WebKit be reconciled?

## Decision Drivers

* The browser set should be an iterable collection, not a fixed list of keyed fields.
* Each browser entry needs structured options (name, viewport, headless), not a bare flag.
* Platforms and browsers should be declared cleanly on `context_v3`.
* Safari and WebKit refer to the same engine and should not be two distinct names.

## Considered Options

* **A. `context_v3` platforms/browsers with a unified `browsers` array; `browserName` enum with safari≡webkit** (chosen).
* **B. Keep per-browser keys but add v3 fields around them.**
* **C. Move browser selection entirely to config, out of context.**

## Decision Outcome

Chosen option: **A**. `context_v3` declares `platforms` and a unified `browsers` array; each entry requires a `name` and the `browserName` enum is `[chrome, firefox, safari, webkit]` with `safari` treated as equivalent to `webkit`. A `contextId` uuid identifies the context. The v2 per-browser-key shape is converted to the array form during validation, so existing contexts migrate automatically.

### Consequences

* Good: the browser set is a uniform, iterable array — adding a browser is data, not schema.
* Good: each browser carries structured options.
* Good: safari≡webkit removes a duplicate-name ambiguity.
* Neutral: v2 per-browser-key contexts are converted on validate.

### Confirmation

Shipped in common commits `066f35f` (context_v2→v3 restructure) and `5383e68`, `54344fb`, `86dff292`, `07827f09` (browsers array, `browserName` enum, required `name`, `contextId`).

## Pros and Cons of the Options

### A. Unified browsers array on context_v3
* Good: iterable, structured, deduplicated browser model.
* Bad: a breaking shape change requiring conversion.

### B. Keep per-browser keys
* Good: no migration.
* Bad: non-iterable; adding a browser is a schema change.

### C. Browsers in config only
* Good: one place to set them.
* Bad: loses per-context targeting.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `066f35f`, `5383e68`, `54344fb`, `86dff292`, `07827f09`. Inventory ref: BACKFILL-INVENTORY.md Seq 142, 146. Related: `00044` (context platform gating), `00096` (v3 redesign), `00100` (resolveContexts/runOn in the runner).
