---
status: accepted
date: 2024-07-11
decision-makers: doc-detective maintainers
---

# `outputResults` accepts a file path or a directory, with collision auto-increment

## Context and Problem Statement

Results are written by `outputResults()`. Users want two different behaviors from the output
target: write to one specific JSON file, or drop a results file into a directory (creating it if
needed). A single string argument is ambiguous between these, and writing to a fixed file path
risks silently overwriting a previous run's results. How should `outputResults` interpret its
output target and avoid clobbering existing files?

## Decision Drivers

* Users need both a fixed-file target and a "put it in this folder" target.
* A run should not silently overwrite a previous run's results file.
* Missing output directories should be created, not error out.
* The behavior must be inferable from the target string without an extra flag.

## Considered Options

* **A. Treat a `.json` path as a file (auto-increment `-N.json` on collision) and any other path as
  a directory (recursive mkdir)** (chosen).
* **B. Add a separate flag to declare whether the target is a file or a directory.**
* **C. Always write to a directory and never accept a fixed file path.**

## Decision Outcome

Chosen option: **A**, because the `.json` extension is an unambiguous, flag-free signal of intent.
`outputResults()` was reworked so a `.json` file path is treated as a file, auto-incrementing to
`-N.json` on collision instead of overwriting; any other path is treated as a directory and created
with a recursive mkdir (doc-detective `2cf919b7`, Seq 125).

### Consequences

* Good: one argument expresses both file and directory intent, no extra flag.
* Good: existing results are never silently overwritten (collision → `-N.json`).
* Good: target directories are auto-created.
* Bad: the `.json`-suffix heuristic couples behavior to the filename extension.
* Neutral: directory mode picks the filename; only file mode honors an exact name.

### Confirmation

Shipped in doc-detective commit `2cf919b7`. Confirmed by the `outputResults` rework: `.json` →
file with `-N.json` increment, otherwise recursive mkdir as a directory.

## Pros and Cons of the Options

### A. `.json` ⇒ file (auto-increment), else directory
* Good: flag-free; collision-safe; auto-creates dirs.
* Bad: relies on extension as the discriminator.

### B. Explicit file/dir flag
* Good: unambiguous intent.
* Bad: extra surface; redundant with the extension signal.

### C. Directory-only
* Good: simplest rule.
* Bad: loses the fixed-file use case.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `2cf919b7`. Inventory ref:
BACKFILL-INVENTORY.md Seq 125. Related: `00013` (JSON result output), `00054` (timestamped result files).
