---
status: accepted
date: 2025-04-10
decision-makers: doc-detective maintainers
---

# Drop Edge caps and remove runCoverage / suggestTests from the test surface

## Context and Problem Statement

As the v3 runner matured, two pieces of accumulated surface area no longer paid for themselves. The Microsoft Edge browser capabilities (`00073`) added another driver target with bespoke caps and an unconditional `--no-sandbox` flag, while the `runCoverage` (`00035`) and `suggestTests` (`00036`) analysis entrypoints — content-coverage measurement and test-suggestion generation — were ~943 lines of `analysis.js`/`suggest.js` that the v3 redesign was leaving behind. Should the v3 runner keep carrying Edge support and the coverage/suggest analysis features, or retire them to focus the test surface?

## Decision Drivers

* Edge added a driver target with little marginal value over Chrome/Firefox/Safari.
* The unconditional `--no-sandbox` flag was a container-only concern leaking into every run.
* `runCoverage`/`suggestTests` were large, separately-maintained analysis features diverging from the test runner.
* The 3.0.0 redesign was narrowing the product to `runTests` only.

## Considered Options

* **A. Drop Edge caps and remove `runCoverage`/`suggestTests` from the test surface** (chosen).
* **B. Keep Edge; remove only coverage/suggest.**
* **C. Keep all three behind feature flags.**

## Decision Outcome

Chosen option: **A**, because both were add→remove lifecycle features the v3 product no longer included. The decision:

1. **Edge browser caps dropped**; Chrome caps simplified (`browserName` forced `chrome`).
2. The unconditional **`--no-sandbox`** flag removed (sandbox handling becomes container-conditional elsewhere).
3. **`runCoverage` and `suggestTests` removed** from the test surface — `analysis.js`/`suggest.js` deleted (−943 lines).

Commits `0ef0f10d`, `12dd65e0`, `177f8102`, `9f426e6` in `core`. The wrapper-side removal of the `runCoverage`/`suggestTests` commands lands with the 3.0.0 redesign (`00108`).

### Consequences

* Good: smaller, focused test surface aligned with the v3/`runTests`-only product.
* Good: removes a whole driver target and ~943 lines of analysis code from maintenance.
* Bad: coverage measurement and test suggestion are no longer available (closes the lifecycle opened by `00035`/`00036`).
* Bad: Edge as a test target is gone.

### Confirmation

Shipped in `core` commits `0ef0f10d`, `12dd65e0`, `177f8102`, `9f426e6`; the absence of Edge caps and of the coverage/suggest entrypoints is the confirming behavior, completed at the wrapper in `00108`.

## Pros and Cons of the Options

### A. Drop Edge + remove coverage/suggest
* Good: focused surface; large maintenance reduction.
* Bad: loses two shipped capabilities.

### B. Keep Edge only
* Good: retains a browser target.
* Bad: keeps bespoke caps for marginal value.

### C. Flag everything off
* Good: reversible.
* Bad: dead code behind flags; ongoing maintenance.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `0ef0f10d`, `12dd65e0`, `177f8102`, `9f426e6`. Inventory ref: BACKFILL-INVENTORY.md Seq 154. Related: `00035` (coverage), `00036` (suggest), `00073` (Edge), `00108` (3.0.0 wrapper redesign).
