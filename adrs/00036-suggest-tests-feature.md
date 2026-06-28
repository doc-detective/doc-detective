---
status: accepted
date: 2022-10-24
decision-makers: doc-detective maintainers
---

# Suggest-tests feature (intent detection writing sidecar tests)

## Context and Problem Statement

Authoring tests by hand for existing documentation is slow, and coverage analysis can already
identify coverable markup that has no test. Could Doc Detective go a step further and *generate*
candidate tests from documentation content automatically, so an author starts from a draft rather
than a blank file? Where should those generated tests be written?

## Decision Drivers

* Lower the barrier to adopting Doc Detective on an existing doc set.
* Reuse the coverage feature's markup vocabulary to detect testable intent.
* Generated tests should be reviewable artifacts the author can edit, not opaque in-memory output.
* Output location must be configurable.

## Considered Options

* **A. A `suggest` entrypoint that detects intent and writes sidecar test files** (chosen).
* **B. Print suggestions to the console only.**
* **C. No suggestion feature.**

## Decision Outcome

Chosen option: **A**, because writing sidecar test files gives the author a concrete, editable
starting point and fits the coverage markup model already in place.

Behavior decided: a `suggest` CLI command (`npm run suggest`, `cli/suggest.js`, `src/lib/suggest.js`)
with a `testSuggestionOutput` config key. Intent detection plus per-markup builders scan content and
write candidate test files (sidecars) the author can review and refine.

This was an **add → remove** lifecycle: introduced here in 2022 and removed from the test surface at
the 3.0.0 redesign.

### Consequences

* Good: faster onboarding onto existing docs; concrete editable output.
* Good: reuses the coverage markup config (`includeInSuggestions`) rather than a parallel system.
* Bad: a generation surface to maintain; removed at 3.0.0.
* Neutral: the intent-detection idea is later echoed by AI-assisted generation skills outside the
  core runner.

### Confirmation

Shipped behavior: `src/lib/suggest.js`, the `suggest` command, and `testSuggestionOutput`. Removal
confirmed by the 3.0.0 test-surface trimming.

## Pros and Cons of the Options

### A. suggest entrypoint writing sidecars
* Good: editable artifacts; reuses markup config; eases adoption.
* Bad: extra surface; later removed.

### B. Console-only suggestions
* Good: simplest.
* Bad: not actionable as files; author must transcribe.

### C. No suggestion feature
* Good: less to build.
* Bad: leaves a real adoption pain point unaddressed.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective PR #12 — commits `9f3240d3`,
`f6be91d5`. Inventory ref: BACKFILL-INVENTORY.md Seq 50. The core `suggestTests()` impl (Seq 86) is
its implementation; removal at 3.0.0 is covered by `00103`. Related: coverage feature (`00035`).
