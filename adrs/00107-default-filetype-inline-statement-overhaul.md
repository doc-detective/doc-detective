---
status: accepted
date: 2025-04-17
decision-makers: doc-detective maintainers
---

# Default fileType inline-statement overhaul (MDX/JSX/AsciiDoc/HTML)

## Context and Problem Statement

Inline test statements are the comment markers Doc Detective scans for to detect tests embedded in docs. The default Markdown fileType used `test`/`test-end` wording, but documentation is authored in more than plain Markdown: MDX and JSX use `{/* … */}` comments (HTML comments are invalid there), and AsciiDoc and HTML have their own comment syntaxes. Without per-format default fileTypes, authors on those formats had no built-in way to embed tests. What default fileTypes and inline-statement styles should ship?

## Decision Drivers

* MDX/JSX cannot use HTML comments; they need `{/* … */}` (and the Markdown `[comment]: # ()` style).
* AsciiDoc and HTML need their own default fileType definitions with native comment syntax.
* The Markdown default statement wording needed to settle on `test`/`test-end`.
* Defaults should work out of the box without per-project fileType authoring.

## Considered Options

* **A. Ship default fileTypes for Markdown (incl. MDX/JSX comment styles), AsciiDoc, and HTML with format-native inline statements** (chosen).
* **B. Require authors to define custom fileTypes for non-Markdown formats.**
* **C. Force a single comment syntax across all formats.**

## Decision Outcome

Chosen option: **A**, because each format has a different valid comment syntax and built-in defaults are what make detection work without setup. The contract:

1. Markdown statements settle on **`test`/`test-end`** wording, and Markdown gains **MDX/JSX `{/* test */}`** and **`[comment]: # (test)`** styles.
2. New default fileTypes **`asciidoc_1_0`** (AsciiDoc) and **`html_1_0`** (HTML) ship with format-native inline statements.

Commits `89dbc12b`, `f2e6f30d` in `core`.

### Consequences

* Good: docs authored in MDX/JSX, AsciiDoc, and HTML can embed tests with valid comment syntax out of the box.
* Good: no per-project fileType definition required for these formats.
* Neutral: the wrapper's default `fileTypes` list (`["markdown","asciidoc","html"]`) is set in the 3.0.0 redesign (`00108`); DITA is added later (`00126`).
* Bad: more built-in statement variants to document and keep consistent.

### Confirmation

Shipped in `core` commits `89dbc12b`, `f2e6f30d`; the `asciidoc_1_0`/`html_1_0` default fileTypes and the MDX/JSX comment styles are the confirming behavior.

## Pros and Cons of the Options

### A. Format-native default fileTypes
* Good: works out of the box per format; valid comment syntax everywhere.
* Bad: more default variants to maintain.

### B. Author-defined fileTypes
* Good: no built-in defaults to maintain.
* Bad: every non-Markdown project must configure detection manually.

### C. One forced syntax
* Good: single rule.
* Bad: invalid in MDX/JSX; awkward in AsciiDoc/HTML.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `89dbc12b`, `f2e6f30d`. Inventory ref: BACKFILL-INVENTORY.md Seq 159. Related: `00076` (AsciiDoc/HTML fileTypes), `00108` (3.0.0 default fileTypes list), `00126` (DITA support).
