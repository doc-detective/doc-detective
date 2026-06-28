---
status: accepted
date: 2025-12-02
decision-makers: doc-detective maintainers
---

# Fractional (0–1) maxVariation comparison contract

## Context and Problem Statement

Doc Detective compares strings (`runShell`/`httpRequest` output diffs) and images against a
`maxVariation` tolerance, but the unit was inconsistent: some paths computed a *percentage*
difference (0–100, via a `calculatePercentageDifference` helper) while the v3 schemas had moved
`maxVariation` toward a 0–1 fraction (e.g. screenshot default `0.05`). A step authored against one
convention could be evaluated under the other. What single comparison contract should all
`maxVariation` checks share?

## Decision Drivers

* `maxVariation` must mean the same thing everywhere — image and text comparisons alike.
* The v3 schema convention (0–1 fractional, e.g. screenshot default `0.05`) should be canonical.
* The change must not silently invert or rescale existing thresholds incorrectly.
* The wait/pause helper should also use the driver's pause when a driver is present.

## Considered Options

* **A. Replace `calculatePercentageDifference` with `calculateFractionalDifference` (0–1, Levenshtein
  over max length) and compare against the raw `maxVariation` (no `*100`) everywhere** (chosen).
* **B. Standardize on percentages (0–100) and rescale the schema defaults back.**
* **C. Accept both units and infer scale from the value's magnitude.**

## Decision Outcome

Chosen option: **A**, because the 0–1 fraction matches the v3 schema defaults and yields one
comparison rule across image and text. The contract: `calculatePercentageDifference` is replaced by
`calculateFractionalDifference`, computing a 0–1 value (Levenshtein distance over the max length for
strings); `httpRequest`/`runShell` compare against the raw `maxVariation` with no `*100` scaling, so
the threshold is a fraction throughout. Separately, `wait` uses `driver.pause` when a driver is
present (commits `580f4d`, `a6e092`, `doc-detective-core`).

### Consequences

* Good: one consistent 0–1 `maxVariation` meaning across image and text comparisons.
* Good: aligns runtime with the v3 schema defaults (e.g. screenshot `0.05`).
* Bad: any threshold authored as a 0–100 percentage must be re-expressed as a 0–1 fraction.
* Neutral: `wait` now prefers the driver's pause when a session is active.

### Confirmation

`calculateFractionalDifference` (0–1 Levenshtein/maxLength) and raw-`maxVariation` comparison ship in
`doc-detective-core` `580f4d`, `a6e092`, alongside the `driver.pause` change for `wait`.

## Pros and Cons of the Options

### A. Fractional 0–1 everywhere
* Good: matches v3 schema; single comparison rule; no scaling drift.
* Bad: percentage-authored thresholds need converting to fractions.

### B. Percentages 0–100
* Good: familiar to some authors.
* Bad: contradicts the v3 schema defaults; requires rescaling them.

### C. Infer scale from magnitude
* Good: tolerant of both conventions.
* Bad: ambiguous near boundary values; magic behavior, hard to reason about.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `580f4d`, `a6e092`.
Inventory ref: BACKFILL-INVENTORY.md Seq 200. Related: `00066` (saveScreenshot visual diff +
maxVariation), `00135` (regression diffs → WARNING).
