---
status: accepted
date: 2023-10-20
decision-makers: doc-detective maintainers
---

# Markup-driven test auto-detection

## Context and Problem Statement

The "docs as tests" premise is that prose itself describes testable steps — a link, a button label,
a code keystroke. Doc Detective needed to read documentation markup and *generate* test steps from it
automatically, rather than requiring every step be hand-authored as JSON. That requires a way to
declare, per file type, which markup patterns map to which actions, and a runner that turns matches
into steps in the right order. What is the contract for markup `actions[]` and the auto-detection
engine?

## Decision Drivers

* Documentation markup (links, buttons, keystrokes) should auto-generate the obvious test steps.
* Mapping markup→action must be declarative and per file type, not hard-coded.
* A line that matches several rules must produce steps in a deterministic order.
* Authors must be able to opt a file out of detection and ignore specific tests.

## Considered Options

* **A. Per-file-type `actions[]` of `{name, params}` objects with an action enum, plus a runner that auto-generates tests from markup regex, with `detectSteps:false` skip and `testIgnore`** (chosen).
* **B. A single hard-coded markup→action mapping shared by all file types.**
* **C. No auto-detection — every step authored explicitly.**

## Decision Outcome

Chosen option: **A**, because a declarative per-file-type map keeps detection extensible while the
runner owns the regex-to-step generation. Markup is declared as `actions[]` entries shaped
`{name, params}` validated against an action enum; the runner scans markup with each rule's regex and
auto-generates steps — e.g. a found link/element → `find`/aria match, a URL → `goTo`/`checkLink`, a
keystroke notation → `typeKeys`. Detection is skipped when `detectSteps:false`, and `testIgnore` lets
authors exclude specific tests. When several rules match one line, the **first action per markup
rule** is used and steps from multiple matches on a line are ordered by `line.indexOf(match)`, with a
post-collection validate-filter dropping anything that fails validation.

### Consequences

* Good: documentation markup directly yields runnable steps with no hand-authoring.
* Good: per-file-type rules make detection extensible to new formats.
* Good: deterministic ordering for multi-match lines (`line.indexOf`).
* Bad: regex-driven detection can over- or under-match; the validate-filter is the safety net.
* Neutral: the `{name, params}` shape and ordering rules are later restated under v3 markup actions.

### Confirmation

Shipped in common `eaecc43`, `2010fd5` (markup `actions[]` schema + enum) and core `27e69c3d`,
`883e35d9`, `48e2456f`, `e98c0ba5` (auto-generation, skip, testIgnore) plus core `996114`, `796667`
(first-action-per-rule, `line.indexOf` ordering, validate-filter). Exercised by markup-detection
fixtures over real documentation files.

## Pros and Cons of the Options

### A. Declarative per-file-type `actions[]` + auto-generating runner
* Good: extensible, deterministic, opt-out aware.
* Bad: regex matching needs a validate-filter to stay correct.

### B. Hard-coded shared mapping
* Good: simplest.
* Bad: not extensible per format; brittle.

### C. No auto-detection
* Good: fully explicit.
* Bad: defeats the docs-as-tests premise; high authoring cost.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `eaecc43`, `2010fd5`;
doc-detective-core commits `27e69c3d`, `883e35d9`, `48e2456f`, `e98c0ba5`, `996114`, `796667`.
Inventory ref: BACKFILL-INVENTORY.md Seq 94, 98. Related: `00055` (default Markdown fileType +
markup map), `00081` (multi-regex capture-group substitution), `00096` (v3 action-as-key redesign).
