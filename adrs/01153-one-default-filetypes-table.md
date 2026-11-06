---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Use one default fileTypes table

## Context and Problem Statement

Two tables define the default `fileTypes`. `doc-detective-common` and the LSP use the one in
`src/common/src/fileTypes.ts`, and the runner uses a copy in `src/core/config.ts`. The copies drifted. The
runner's Markdown `typeText` rule matches only lowercase verbs, so `Type "kittens"` isn't detected. Common's rule,
the LSP, and the docs accept either case.

The runner also hands every run the same default objects, and `setConfig` normalizes them in place. A caller that
changes `config.fileTypes` therefore changes the defaults for every later run in the process.

Which table should the runner use?

## Decision Drivers

- The runner, common, and the LSP should detect the same things.
- The docs already promise that `Type "Hello World"` becomes a `type` step.
- One run's config must not leak into another run.
- The 5.0 plan moves these tables to structure-aware selectors, and one copy halves that work.

## Considered Options

- **A. Delete core's copy, and give each run its own copy of common's table.**
- **B. Keep both tables, and fix the `typeText` drift.**
- **C. Use common's table, but keep the runner's lowercase-only rule as an override.**

## Decision Outcome

Chosen option: **A**. `setConfig` expands a fileType keyword from common's `defaultFileTypes`, and gives the run
its own copy with `structuredClone`. The `extends` path already copied. The Markdown `typeText` rule matches
`Press`, `Enter`, and `Type` with either a capital or a lowercase first letter.

This is a breaking change. With step detection on, a capitalized instruction now becomes a step. That can add
failing steps, and it changes the generated ID of any test that gains one. It lands in 5.0, so users take it with
the other detection changes.

### Consequences

- Good: there's one table to maintain, so the runner, common, and the LSP can't drift apart again.
- Good: the runner matches its docs.
- Good: runs no longer share mutable default objects.
- Bad: suites that relied on capitalized instructions being ignored get new steps. The upgrade guide covers this.

### Confirmation

- `test/config-coverage.test.js` asserts that keywords expand to common's table, and that capitalized
  instructions match. It also asserts that changing one run's fileTypes leaves the next run's defaults intact.
- `test/detecttests-coverage.test.js` asserts that detection through `setConfig` turns `Type`, `type`, and
  `Enter` instructions into `type` steps.

## Pros and Cons of the Options

### A. Delete core's copy, and give each run its own copy of common's table

- Good: removes 272 lines, and the drift with them.
- Neutral: one copy per run, about the cost of the `extends` copy that already happens.

### B. Keep both tables, and fix the `typeText` drift

- Good: the smallest diff.
- Bad: the tables can drift again, and the 5.0 migration would have to change both.

### C. Use common's table, with the lowercase-only rule as an override

- Good: no change to what the runner detects.
- Bad: keeps a rule that contradicts the docs, and the override is a second table in miniature.
