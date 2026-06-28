---
status: accepted
date: 2023-10-26
decision-makers: doc-detective maintainers
---

# saveScreenshot directory and visual diff

## Context and Problem Statement

`saveScreenshot` wrote an image to a path, but there was no first-class place to put screenshots, no
control over when an existing image is overwritten, and no way to assert that a screenshot still
matches its prior version within a tolerance. Documentation screenshots drift as the product changes;
authors need a regression check, not just a capture. What is the contract for the output directory,
overwrite behavior, and visual-diff comparison?

## Decision Drivers

* Screenshots need a configurable output directory that is created automatically.
* Authors need control over whether an existing screenshot is replaced.
* Visual regression requires comparing against the previous image within a tolerance.
* The tolerance must be expressible as a single, well-defined number.

## Considered Options

* **A. `saveScreenshot.directory` (auto-created) with `path` relative to it; `maxVariation` (0–100) tolerance + `overwrite` enum `true`/`false`/`byVariation`; runner pixel-diff via pixelmatch/pngjs** (chosen).
* **B. Caller-managed paths and an external image-diff tool.**
* **C. Exact-match comparison only (no tolerance).**

## Decision Outcome

Chosen option: **A**, because a managed directory plus a tolerance-aware overwrite enum captures the
real workflow: keep a baseline, compare new captures, and replace only when appropriate.
`saveScreenshot` gains a `directory` field (auto-created) with `path` resolved relative to it. Visual
diff is controlled by `maxVariation` (a `0`–`100` tolerance) and an `overwrite` enum with values
`true`, `false`, and `byVariation` (overwrite only when variation is within tolerance). The runner
performs the pixel diff using pixelmatch over pngjs-decoded images.

### Consequences

* Good: a single managed location for screenshots; baselines auto-organized.
* Good: visual regression with an explicit tolerance instead of brittle exact match.
* Good: `byVariation` overwrite keeps a baseline fresh without losing regressions.
* Neutral: `maxVariation` is later re-expressed as a `0`–`1` fractional comparison; overruns later
  route to WARNING rather than FAIL.

### Confirmation

Shipped in common `25414d3`, `46ff084`, `207593a`, `ecb3d3d` (directory, path, `maxVariation`,
`overwrite` enum) and core `10953bac`, `d60b67a` (pixelmatch/pngjs diff). Exercised by screenshot
fixtures asserting capture, within-tolerance pass, and overwrite modes.

## Pros and Cons of the Options

### A. Managed directory + `maxVariation` + `overwrite` enum + pixel diff
* Good: complete regression workflow; tolerance-aware.
* Bad: bundles image-diff dependencies (pixelmatch/pngjs).

### B. Caller paths + external tool
* Good: no diff code to own.
* Bad: not integrated with the verdict model; extra orchestration.

### C. Exact match only
* Good: trivial.
* Bad: fails on sub-pixel/antialiasing noise; unusable for real screenshots.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `25414d3`, `46ff084`,
`207593a`, `ecb3d3d`; doc-detective-core commits `10953bac`, `d60b67a`. Inventory ref:
BACKFILL-INVENTORY.md Seq 96. Related: `00012` (screenshot action), `00020` (matchPrevious visual
diff), `00089` (screenshot selector crop), `00139` (fractional maxVariation), `00135` (diffs→WARNING).
