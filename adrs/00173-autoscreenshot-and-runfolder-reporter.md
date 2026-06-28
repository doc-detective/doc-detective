---
status: accepted
date: 2026-06-14
decision-makers: doc-detective maintainers
---

# autoScreenshot config and runFolder reporter

## Context and Problem Statement

Two related gaps shaped this decision. First, capturing visual evidence of a documented procedure
required adding an explicit `saveScreenshot` step after every browser interaction — tedious and easy
to forget. Second, a run emitted a single timestamped `testResults.json` with no durable, per-run
home for that JSON plus its screenshots, recordings, and (later) an HTML report. How should the
runner (a) auto-capture screenshots after browser steps, and (b) collect each run's artifacts into a
stable, addressable folder — without breaking the existing report shape or the GitHub Action's
results-resolution contract?

## Decision Drivers

* Visual evidence should be capturable automatically, opt-in at config/spec/test level.
* Each run needs a deterministic artifact home (`run-<runId>`) addressable after the run.
* The report must expose where artifacts landed (`runId`/`runDir`) so consumers can find them.
* Empty runs must not litter the workspace with empty `run-*` folders.
* The GitHub Action parses stdout for a "results at" line — that contract must be respected.

## Considered Options

* **Auto-screenshot capture plus a default-on `runFolder` archive reporter** (chosen).
* **Keep manual `saveScreenshot` steps and a single flat `testResults.json`.**
* **Opt-in run folder (default-off), leaving the flat results file as the default.**

## Decision Outcome

Chosen option: **auto-screenshot capture plus a default-on `runFolder` archive reporter**, because
auto-capture removes per-step boilerplate while the run folder gives every run a stable, self-describing
artifact location that the report and downstream tooling can reference.

Contract decided (across the absorbed commits):

* `autoScreenshot` config field plus `--auto-screenshot` CLI flag auto-capture a screenshot after each
  browser step; settable at config, spec, and test level (`0527292b`, PR #334).
* The `runFolder` reporter (default-on) writes `.doc-detective/run-<runId>/testResults.json`; the
  report gains `runId` and `runDir`; deterministic ID fallbacks ensure a stable `runId`.
* The run-folder archive also emits a per-run HTML report beside the JSON (`baa83dee`, PR #341;
  `htmlReporter.ts`).
* Run-folder creation is skipped when no artifacts are written, so no empty `.doc-detective/run-*`
  directories are left behind (`341b9c5c`).
* stdout is ordered so the per-run JSON "results at" line trails the HTML line; the GitHub Action
  splits stdout on "results at " to resolve results, so the ordering is a deliberate contract
  (`79f35b85`, PR #346).

Implementation in `src/core/utils.ts`, `src/core/tests.ts`, and `htmlReporter.ts`; schema additions
across config/spec/test/step/report.

### Consequences

* Good: zero-boilerplate visual evidence; every run has a stable, self-describing artifact folder.
* Good: report exposes `runId`/`runDir`; HTML sits beside JSON for human review.
* Good: empty runs leave no stray folders; stdout order keeps the Action's resolver working.
* Neutral: `runFolder` is default-on, so runs now write under `.doc-detective/` by default.
* Bad: stdout line ordering is now a load-bearing contract that downstream parsing depends on.

### Confirmation

Shipped across `0527292b` (PR #334, autoScreenshot + runFolder), `baa83dee` (PR #341, HTML beside
JSON), `79f35b85` (PR #346, stdout order), and `341b9c5c` (empty-dir skip). Schema additions span
config/spec/test/step/report.

## Pros and Cons of the Options

### Auto-screenshot + default-on runFolder archive
* Good: removes per-step screenshot boilerplate; durable per-run artifact home; report self-locates.
* Bad: introduces a stdout-ordering contract and a default `.doc-detective/` write location.

### Keep manual `saveScreenshot` and a single flat results file
* Good: no new defaults; nothing writes unless asked.
* Bad: tedious capture; no addressable per-run artifact bundle for tooling or humans.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `0527292b` (PR #334),
`baa83dee` (PR #341), `79f35b85` (PR #346), `341b9c5c`. Inventory ref: BACKFILL-INVENTORY.md
Seq 243, 245, 247 (plus 244 cross-linked). Related: `00153` (self-contained HTML reporter), `00084`
(`outputResults` file-or-directory), `00157` (screenshot reference-image regression), `00175`
(autoRecord, the recording analogue).
