---
status: accepted
date: 2025-11-19
decision-makers: doc-detective maintainers
---

# Regression diffs downgrade to WARNING; skipped-context report shape fix

## Context and Problem Statement

When a `screenshot` visual diff or a `runShell` output diff exceeds its `maxVariation` threshold, the
runner previously marked the step FAIL — turning a documentation suite red on a visual jitter or a
benign output drift. A FAIL halts and alarms even when the artifact was still produced. Separately,
an unsupported-context skip was being recorded as a `{ status: "SKIPPED" }` object rather than the
flat `"SKIPPED"` string, which mis-rolled-up into a spurious PASS, and its skip was logged at warning
level. How should regression overruns and skipped-context results be reported?

## Decision Drivers

* A visual/output regression should be visible without nuking the whole suite to FAIL.
* The compared artifact (screenshot/output) should still be written for inspection.
* Skipped-context results must roll up correctly — never as a false PASS.
* Routine unsupported-context skips should not be logged as warnings.

## Considered Options

* **A. Set status WARNING (not FAIL) on `maxVariation` overruns and still write the file; fix the
  skipped-context result to a flat `"SKIPPED"` string and lower its log level to info** (chosen).
* **B. Keep FAIL on overruns and rely on per-step `maxVariation` tuning.**
* **C. Add a separate config flag to choose FAIL vs. WARNING for regressions.**

## Decision Outcome

Chosen option: **A**, because a regression is a signal worth surfacing but not a hard failure, and the
skipped-context shape was simply a reporting bug. The contract: when a `screenshot` or `runShell`
`maxVariation` overrun occurs, the step status is set to **WARNING** (the third verdict state) and the
compared file is still written (commit `1595353`, `doc-detective-core`). The unsupported-context skip
result is changed from a `{ status: "SKIPPED" }` object to the flat string `"SKIPPED"` so it rolls up
correctly instead of producing a spurious PASS, and the skip log is lowered warning→info (commits
`6a61bf6`, `2d28d3`, `doc-detective-core`).

### Consequences

* Good: visual/output regressions surface as WARNING without failing the run; artifacts retained.
* Good: skipped contexts no longer mis-report as PASS; quieter logs for routine skips.
* Bad: a real regression now reads WARNING, which a strict gate must treat as actionable.
* Neutral: aligns with the WARNING-as-third-verdict model already used elsewhere (e.g. goTo timeout).

### Confirmation

WARNING-on-overrun with file still written ships in `doc-detective-core` `1595353`; the flat
`"SKIPPED"` report shape and info-level skip log land in `6a61bf6`, `2d28d3`. Confirmed by the
roll-up no longer producing a false PASS for skipped contexts.

## Pros and Cons of the Options

### A. Overrun→WARNING + skipped-context shape fix
* Good: regressions visible but non-fatal; correct skip roll-up; quieter logs.
* Bad: strict pipelines must now act on WARNING for regressions.

### B. Keep FAIL on overruns
* Good: zero ambiguity — any drift is a failure.
* Bad: brittle suites; visual jitter turns everything red.

### C. Configurable FAIL/WARNING
* Good: per-project choice.
* Bad: extra config surface for what one sensible default (WARNING) covers.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `1595353`, `6a61bf6`,
`2d28d3`. Inventory ref: BACKFILL-INVENTORY.md Seq 195, 198. Related: `00106` (goTo timeout →
WARNING, third verdict), `00066`/`00139` (visual-diff / fractional maxVariation).
