---
status: accepted
date: 2026-04-19
decision-makers: doc-detective maintainers
---

# origin params and step-level query-param appending

## Context and Problem Statement

Doc Detective resolves relative URLs against a configured `origin` (`00065`), but there was
no way to attach query parameters — such as a shared auth token, feature flag, or locale —
to every origin-resolved URL, nor to add per-step query params on `goTo`/`checkLink` without
hand-editing each URL string. Authors who needed `?token=…` or `?preview=true` on every
navigation had to bake it into each documented link. How should global and per-step query
parameters be declared and merged into resolved URLs?

## Decision Drivers

* Common query params (auth token, locale, feature flag) apply across many URLs.
* Per-step overrides/additions are needed on `goTo`/`checkLink` without editing URL strings.
* Merging must be predictable: keep existing query keys, dedupe, and preserve the fragment.
* The contract must live in schema (`config_v3`, `goTo_v3`, `checkLink_v3`), not be ad hoc.

## Considered Options

* **A. A `config.originParams` global plus step-level `params` on `goTo`/`checkLink`, merged into origin-resolved URLs with dedup and fragment preservation** (chosen).
* **B. Require authors to bake query params into each documented URL.**
* **C. Support only a global `originParams`, no per-step override.**

## Decision Outcome

Chosen option: **A**, because query params have both a run-wide dimension (a token for the
whole site) and a per-link dimension (one step needs an extra flag), so both a global and a
step-level surface are warranted. A new `config.originParams` and step-level `params` on
`goTo`/`checkLink` auto-append query parameters to origin-resolved URLs via an
`appendQueryParams()` helper using merge semantics: existing query keys are preserved,
duplicates are de-duplicated, and any URL fragment is kept. The contract was added to
`config_v3`, `goTo_v3`, and `checkLink_v3`.

### Consequences

* Good: run-wide params (token/locale/flag) applied without touching each URL.
* Good: per-step `params` add or override for a single navigation.
* Good: merge semantics preserve existing query keys and the fragment, with dedup.
* Neutral: precedence/merge of global vs. step params is defined by the helper.
* Bad: a global `originParams` silently affects every origin-resolved URL — authors must be
  aware it is applied run-wide.

### Confirmation

Shipped via `appendQueryParams()` with `config_v3`, `goTo_v3`, and `checkLink_v3` additions
(commit `dac029a8`, PR #261). Confirmed by the merge/dedup/fragment-preservation behavior and
schema validation.

## Pros and Cons of the Options

### A. originParams + step params, merged
* Good: covers both run-wide and per-step needs; predictable merge.
* Bad: global param applies everywhere — easy to forget.

### B. Bake into each URL
* Good: explicit per URL.
* Bad: repetitive; error-prone; no run-wide token support.

### C. Global only
* Good: simplest.
* Bad: no per-step override; inflexible.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `dac029a8` (PR #261).
Inventory ref: BACKFILL-INVENTORY.md Seq 220. Related: `00065` (relative-URL and origin
resolution), `00151`/`00152` (checkLink), `00099` (config_v3 restructure).
