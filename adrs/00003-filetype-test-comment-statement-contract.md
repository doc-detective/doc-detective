---
status: accepted
date: 2022-04-23
decision-makers: doc-detective maintainers
---

# Per-filetype test-comment statement contract

## Context and Problem Statement

Tests had to be embedded in documentation source files of different formats, so the tool needed a way to recognize where a test begins and ends inside (for example) Markdown versus HTML. The first contract (`8673d5d8`, `0fb1987b`, `5dcbea40`, 2022-04-23) introduced a `fileTypes[]` array keyed by `extensions`, each entry declaring `openTestStatement`/`closeTestStatement` and `open/closeBlockTestStatement` markers (e.g. `// test` for Markdown, `<!-- test` / `-->` for HTML), plus a `testExtensions` allow-list. This contract then evolved: a substring-based parser replaced the block-statement pair (`ba6cc96`, 2022-05-10), and the statement keys were renamed `open/closeTestStatement` → `actionStatementOpen/Close` with explicit test start/end parsing added (`d06fcc0c`, `21a8e7eb`, `17acc84f`, 2022-10-04). How should per-extension test comments be declared and parsed?

## Decision Drivers

* Different file formats use different comment syntaxes for embedding tests.
* The marker set must be configurable per extension, not hard-coded.
* Authors need both inline and block comment forms.
* Missing/incomplete fileType options should fail loudly rather than silently skip.

## Considered Options

* **Per-extension configurable statement markers in `fileTypes[]`** (chosen).
* **A single hard-coded comment syntax for all files.**
* **Format-specific parser plugins per extension.**

## Decision Outcome

Chosen option: **per-extension configurable statement markers**, because documentation lives in many formats and each needs its own comment delimiters, while keeping detection data-driven.

Behavior decided (with its evolution):

1. `fileTypes[]` entries are keyed by `extensions` and declare the open/close test-comment markers; a `testExtensions` allow-list governs which files are scanned.
2. Parsing moved from a block-statement pair to a **substring-based** parser; `open/closeBlockTestStatement` was dropped and a missing fileType options set exits with code 1 (`ba6cc96`).
3. The statement keys were renamed `open/closeTestStatement` → `actionStatementOpen/Close`, and an explicit **test start/end statement** concept was added to `parseTests` (`d06fcc0c`, `21a8e7eb`, `17acc84f`).

### Consequences

* Good: any text format can host tests by declaring its comment markers.
* Good: data-driven detection — no per-format code branch.
* Bad: the early key renames are breaking for hand-written configs of that era.
* Neutral: this contract is the ancestor of the later markup-driven detection and v2/v3 fileType schemas.

### Confirmation

Observable in `bin/config.json` `fileTypes[].extensions` and statement keys, and in the `setTests`/`parseTests` parsing path.

## Pros and Cons of the Options

### Per-extension configurable markers
* Good: flexible across formats; data-driven.
* Bad: early key churn before the schema stabilized.

### Single hard-coded syntax
* Good: trivial.
* Bad: cannot support more than one file format.

### Per-format parser plugins
* Good: maximally precise.
* Bad: far more machinery than comment-delimiter matching needs.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `8673d5d8`, `0fb1987b`, `5dcbea40`, `ba6cc96`, `d06fcc0c`, `21a8e7eb`, `17acc84f`. Inventory ref: BACKFILL-INVENTORY.md Seq 3, 15, 43. Later superseded by the markup-driven detection and v2/v3 fileType schema family.
