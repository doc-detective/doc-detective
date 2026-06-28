---
status: accepted
date: 2022-04-25
decision-makers: doc-detective maintainers
---

# Recursive directory walk and extension filtering for input discovery

## Context and Problem Statement

Users point the tool at a directory of documentation, not just a single file, so the tool needed to discover which files to scan for tests. The input-discovery commits (`a4332bc7`, `8ceb72ff`, 2022-04-25) added a recursive directory walk with `recursive` defaulting to true, filtered by extension using an `excludeExtensions` exclude list and a `testExtensions` allow-list. How should the tool enumerate candidate input files and decide which extensions to include?

## Decision Drivers

* Documentation is usually a tree of files, not one file.
* Not every file in a tree is a test source — extensions must be filtered.
* Recursion should be the default but overridable.
* Discovery must compose with the per-filetype test-comment contract (ADR 00003).

## Considered Options

* **Recursive walk by default + extension allow/exclude lists** (chosen).
* **Flat (single-directory) scan only.**
* **Explicit file list, no directory walking.**

## Decision Outcome

Chosen option: **recursive walk by default with extension filtering**, because pointing at a docs root and discovering all eligible files is the common case, while allow/exclude lists keep non-test files out.

Behavior decided:

1. Directory inputs are walked recursively, with `recursive` defaulting to `true` (overridable via `--recursive/-r`).
2. Discovered files are filtered by extension against `testExtensions` (allow) and `excludeExtensions` (exclude).

### Consequences

* Good: a single directory input covers an entire docs tree.
* Good: extension filtering keeps irrelevant files out of detection.
* Neutral: the `recursive` default-true behavior is later hardened to respect an explicit `false` (`?? true` vs `|| true`, ADR 00137).

### Confirmation

Observable in `bin/config.json` `recursive` and the recursive directory walk plus extension-filter logic.

## Pros and Cons of the Options

### Recursive walk + filtering
* Good: covers whole trees; configurable.
* Bad: a too-broad include list can pick up unintended files (mitigated by exclude list).

### Flat scan only
* Good: simplest.
* Bad: forces users to invoke per-directory.

### Explicit file list
* Good: maximally precise.
* Bad: tedious for large doc sets; no discovery.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `a4332bc7`, `8ceb72ff`. Inventory ref: BACKFILL-INVENTORY.md Seq 4. Related: ADR 00003 (filetype test-comment contract), ADR 00137 (explicit-false handling of `recursive`/`detectSteps`).
