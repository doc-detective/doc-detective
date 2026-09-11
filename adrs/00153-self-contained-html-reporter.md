---
status: accepted
date: 2026-04-17
decision-makers: doc-detective maintainers
---

# Self-contained HTML report reporter

## Context and Problem Statement

Doc Detective emitted machine-readable JSON results (the `jsonReporter`) and a terminal
summary, but had no human-browsable artifact a reviewer could open and share. The audit
needed a reporter that renders a run's verdicts, steps, and diffs as a single
HTML file, requiring no server or external assets. It also needed a `config_v3` option to enable
it, and CLI and utils wiring to invoke it. How should an HTML report be produced and configured,
and how should it relate to the existing JSON output?

## Decision Drivers

* Reviewers need a readable, shareable artifact, not just JSON.
* The HTML must be self-contained (no external CSS/JS/server) so it opens anywhere.
* It must be an additive, opt-in reporter, with JSON output staying the default contract.
* It should slot into the existing pluggable-reporter wiring, not replace it.

## Considered Options

* **A. A self-contained `htmlReporter` plus a `config_v3` HTML-report option, wired through cli/utils** (chosen).
* **B. A separate `doc-detective report` post-processing command that converts JSON to HTML.**
* **C. Defer HTML rendering to an external/third-party viewer of the JSON results.**

## Decision Outcome

Chosen option: **A**. Rendering inline as a first-class reporter keeps the artifact
in lockstep with each run, and reuses the existing pluggable-reporter seam. A new
`src/reporters/htmlReporter.ts` produces a self-contained HTML report, with inlined styles and
assets and no server required. A `config_v3` option enables it, and cli and utils were wired to
invoke the reporter alongside the JSON output. The HTML is generated per run and, once the run-folder
archive landed (`00173`), is written beside the per-run JSON (`baa83dee`, PR #341).

### Consequences

* Good: a shareable, offline-openable artifact for every run.
* Good: additive reporter, so JSON and terminal output are unchanged.
* Good: reuses the pluggable-reporter wiring; per-run HTML lands beside the JSON.
* Neutral: opt-in via `config_v3`, so default output is unchanged unless enabled.
* Bad: inlining all assets makes the HTML file larger than a linked-asset page.

### Confirmation

Shipped as `src/reporters/htmlReporter.ts` with the `config_v3` HTML option and cli/utils
wiring (commit `253bd5a8`, PR #255); per-run HTML beside the run-folder JSON (commit
`baa83dee`, PR #341).

## Pros and Cons of the Options

### A. Inline htmlReporter + config option
* Good: per-run, self-contained, reuses reporter seam.
* Bad: larger HTML payload from inlined assets.

### B. Separate report command
* Good: decouples rendering from the run.
* Bad: extra step; can drift from the run that produced the JSON.

### C. External viewer
* Good: no new code.
* Bad: no offline single-file artifact; relies on third-party tooling.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `253bd5a8` (PR #255),
`baa83dee` (PR #341). Inventory ref: BACKFILL-INVENTORY.md Seq 215, 244. Related: `00173`
(autoScreenshot + runFolder reporter), `00108` (3.0.0 wrapper redesign / pluggable reporter).
