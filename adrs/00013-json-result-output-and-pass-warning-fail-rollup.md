---
status: accepted
date: 2022-05-09
decision-makers: doc-detective maintainers
---

# JSON result output and PASS/WARNING/FAIL rollup

## Context and Problem Statement

Once the runner could execute actions, it needed a durable, machine-readable record of what happened
and a way to express an overall verdict. Early runs produced no result file and had no defined notion
of a per-test or per-action status. This ADR records three tightly related decisions: what the result
object looks like, where it is written, and how individual action outcomes roll up into a single
verdict. How should results be shaped, persisted, and summarized?

## Decision Drivers

* CI and tooling need a stable JSON artifact, not just console output.
* A test with one failing assertion must report as failed; soft issues should be distinguishable.
* Config keys for input/output paths should be unambiguous.
* The result shape must carry per-action detail (status plus captured media).

## Considered Options

* **A. Structured result object + JSON file + three-level rollup** (chosen).
* **B. Boolean pass/fail per test, console-only.**
* **C. Exit-code-only signaling with no artifact.**

## Decision Outcome

Chosen option: **A**. The `testDefinition` gains a `status` field and each action gains a
`result{status, description, image, video}` block. Results are written to a JSON file
(`outputResults()` writes `results.json`), and the path config keys are renamed to the clearer
`inputPath`/`outputPath` (from `input`/`output`). Verdicts roll up per test as **PASS / WARNING /
FAIL**: results are mutated onto `test.status` and `action.result`, and the runner returns a `tests`
object. WARNING is a distinct third verdict for non-fatal issues, sitting between PASS and FAIL.

### Consequences

* Good: a stable, inspectable JSON artifact with per-action detail and media references.
* Good: WARNING gives a soft-failure signal without forcing a hard FAIL.
* Neutral: the path-key rename (`input`/`output` → `inputPath`/`outputPath`) is later revisited as
  the config contract matures.
* Neutral: the precise rollup precedence (FAIL > WARNING > PASS) and the `SKIP`→`SKIPPED` string are
  refined in later ADRs (00045, 00067).

### Confirmation

Shipped across 2022-05-09…05-13: `ref/testDefinition.json` adds `status`/`result`; `index.js`
`outputResults()` writes `results.json`; `src/lib/tests.js` performs the PASS/WARNING/FAIL rollup and
returns the `tests` object.

## Pros and Cons of the Options

### A. Structured object + JSON file + three-level rollup
* Good: durable artifact, per-action detail, soft-vs-hard failure distinction.
* Bad: a richer shape to maintain and keep backward-compatible.

### B. Boolean console-only
* Good: trivial.
* Bad: no artifact, no soft-failure tier, useless for CI integration.

### C. Exit-code-only
* Good: simplest CI signal.
* Bad: discards all detail; no per-action results or media references.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 51504a4, 0282efc, a45341b,
60dca37. Inventory ref: BACKFILL-INVENTORY.md Seq 14, 16, 17. Related: ADR 00045 (runStep dispatch
and verdict rollup), ADR 00067 (SKIPPED verdict canonicalization), ADR 00084 (outputResults file or
directory).
