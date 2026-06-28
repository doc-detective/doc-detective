---
status: accepted
date: 2023-10-27
decision-makers: doc-detective maintainers
---

# SKIPPED verdict canonicalization

## Context and Problem Statement

Result objects carry a verdict string, and skipped work (a `saveScreenshot` or recording step that
cannot run in the current environment) was reported with the verdict `SKIP`. Other verdicts
(`PASS`, `WARNING`, `FAIL`) were past-tense/state words, so `SKIP` was inconsistent and forced
consumers to handle two spellings of the same concept. What canonical string should mark a skipped
result?

## Decision Drivers

* Verdict strings should be consistent in form across all outcomes.
* Downstream consumers (reporters, CI parsing) need one spelling, not two.
* The change must be mechanical and not alter pass/fail semantics.

## Considered Options

* **A. Canonicalize the skip verdict string to `SKIPPED`** (chosen).
* **B. Keep `SKIP` and document it.**
* **C. Support both spellings indefinitely.**

## Decision Outcome

Chosen option: **A**, because a single canonical past-tense string aligns with `PASSED`/`FAILED`-style
state semantics and removes ambiguity for every consumer. The `saveScreenshot`/recording skip status
is canonicalized from `SKIP` to the `SKIPPED` verdict string throughout result objects.

### Consequences

* Good: one consistent verdict vocabulary (`PASS`/`WARNING`/`FAIL`/`SKIPPED`).
* Good: reporters and CI parsers handle a single spelling.
* Neutral: any external tooling keyed on the old `SKIP` string must update.

### Confirmation

Shipped in core `1a7b309`, `c4f03130`. The `SKIPPED` string is the verdict the combined fixture
suite asserts for guarded/skip-path permutations (every fixture must resolve to PASS or SKIPPED).

## Pros and Cons of the Options

### A. Canonicalize to `SKIPPED`
* Good: consistent vocabulary; single spelling downstream.
* Bad: one-time break for tooling reading the old `SKIP`.

### B. Keep `SKIP`
* Good: no change.
* Bad: inconsistent with other verbose verdicts.

### C. Support both
* Good: no break.
* Bad: every consumer must handle two strings forever.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `1a7b309`, `c4f03130`.
Inventory ref: BACKFILL-INVENTORY.md Seq 97. Related: `00013` (PASS/WARNING/FAIL rollup), `00045`
(runStep verdict rollup), `00106` (WARNING as third verdict).
