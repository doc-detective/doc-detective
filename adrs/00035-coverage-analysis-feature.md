---
status: accepted
date: 2022-10-13
decision-makers: doc-detective maintainers
---

# Coverage-analysis feature (runCoverage + content-coverage markup)

## Context and Problem Statement

Running tests answers "do the documented procedures pass?" but not "how much of the documentation is
actually covered by tests?" There was no way to scan source content for testable markup (UI text,
links, code blocks, interactions) and report which portions were exercised. Should Doc Detective
ship a coverage-analysis entrypoint, and how does it know what markup in a file counts as coverable?

## Decision Drivers

* Authors want a measure of how much documentation has test coverage, not just pass/fail.
* Coverage needs a configurable notion of "what markup is coverable" per file type.
* The feature should be a first-class entrypoint (programmatic, CLI, and npm script) alongside test
  running.
* Markup matching must handle multi-line and array-valued patterns, not just single lines.

## Considered Options

* **A. A dedicated `coverage` entrypoint plus per-fileType content-coverage markup config** (chosen).
* **B. Fold coverage into the normal test run as a side report.**
* **C. No coverage feature.**

## Decision Outcome

Chosen option: **A**, because coverage is a distinct analysis with its own output and its own notion
of coverable markup, warranting a separate entrypoint and config block.

Behavior decided:

1. **Entrypoint** — `coverage.js` with a `coverage` export, a `cli/coverage.js` command, and an
   `npm run coverage` script; output path via `coverageOutput` (config/CLI/env). Markup matching
   supports multi-line and array patterns.
2. **Markup config** — `fileType.markup{}` with regex arrays for `onscreenText`, `hyperlink`,
   `lists`, `codeBlock`, and `interaction`, plus a `testIgnoreStatement`. Each markup entry carries
   `includeInCoverage` / `includeInSuggestions` flags so authors choose what counts.

This was an **add → remove** lifecycle: introduced here in 2022 and removed from the test surface at
the 3.0.0 redesign.

### Consequences

* Good: documentation coverage becomes measurable and configurable per file type.
* Good: shared markup config feeds both coverage and the suggest feature.
* Bad: a second analysis surface to maintain; ultimately removed at 3.0.0 as scope narrowed.
* Neutral: the markup vocabulary later informs the v3 detection/markup-map work even after the
  coverage entrypoint itself is gone.

### Confirmation

Shipped behavior: `coverage.js`, `coverageOutput` config/CLI/env, and the `fileType.markup{}` block.
Removal confirmed by the 3.0.0 test-surface trimming.

## Pros and Cons of the Options

### A. Dedicated coverage entrypoint + markup config
* Good: clear separation; configurable coverable markup; reusable for suggestions.
* Bad: extra surface; later removed.

### B. Side report inside the test run
* Good: one entrypoint.
* Bad: conflates two different analyses; muddier output.

### C. No coverage
* Good: less to build.
* Bad: leaves the coverage question unanswered.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective PR #9 — commits `da2fdba`,
`030f231`, `8efab8d` (entrypoint) and `fb3dcca5`, `1ff77c07`, `f136afa3` (markup config). Inventory
ref: BACKFILL-INVENTORY.md Seq 47, 48. The core `runCoverage()` impl (Seq 84) is its implementation;
removal at 3.0.0 is covered by `00103`. Related: suggest feature (`00036`).
