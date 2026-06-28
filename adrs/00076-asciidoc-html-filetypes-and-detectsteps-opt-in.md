---
status: accepted
date: 2024-03-15
decision-makers: doc-detective maintainers
---

# Add AsciiDoc/HTML fileTypes and make detectSteps opt-in (default true→false)

## Context and Problem Statement

Doc Detective's built-in fileTypes covered Markdown, but real documentation also ships as AsciiDoc
and HTML, which had no default markup-to-action mapping. Separately, `detectSteps` defaulted to
`true`, so the runner auto-generated steps from prose markup on every file — surprising users who
only wanted explicit inline tests to run and producing unexpected detected steps. Which fileTypes
ship by default, and should markup-driven step detection be on or off by default?

## Decision Drivers

* AsciiDoc and HTML are common documentation formats and deserve built-in fileType definitions.
* Auto-detecting steps from prose by default produces surprising, hard-to-control test sets.
* Explicit author intent (inline tests) should be the default behavior; detection should be opt-in.

## Considered Options

* **A. Ship AsciiDoc and HTML/XML fileTypes, extend Markdown to `.markdown`, and flip `detectSteps`
  default from `true` to `false`** (chosen).
* **B. Add the fileTypes but keep `detectSteps` defaulting to `true`.**
* **C. Keep Markdown-only and leave detection on.**

## Decision Outcome

Chosen option: **A** (`common`, commits `a33d272`, `a6d80a1`, `9d6029d`, `e89cd0d`):

1. **New fileTypes**: an AsciiDoc fileType and an HTML/XML fileType are added with their own
   markup→action maps; Markdown gains the `.markdown` extension alongside `.md`.
2. **detectSteps flip**: the `detectSteps` default changes from `true` to **`false`** — markup-driven
   step detection becomes **opt-in**. By default only explicitly authored inline tests run.

## Pros and Cons of the Options

### A. Add fileTypes + detectSteps opt-in (chosen)
* Good: built-in AsciiDoc/HTML support; predictable, author-controlled test sets.
* Bad: users who relied on auto-detection must now set `detectSteps: true`.

### B. Add fileTypes, keep detection on
* Good: no behavior change for detection users.
* Bad: keeps the surprising auto-detect default for everyone else.

### C. Markdown-only, detection on
* Good: no work.
* Bad: ignores AsciiDoc/HTML; keeps the surprising default.

### Consequences

* Good: AsciiDoc and HTML docs are testable out of the box.
* Good: runs are predictable — only authored tests execute unless detection is enabled.
* Bad: a behavior change for anyone depending on the old `detectSteps: true` default.
* Neutral: the default flips again later (3.0.0 sets `detectSteps: true` in the new wrapper defaults).

### Confirmation

AsciiDoc/HTML fileTypes, `.markdown` extension, and the `detectSteps` default flip in
`doc-detective-common` (`a33d272`, `a6d80a1`, `9d6029d`, `e89cd0d`).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `a33d272`, `a6d80a1`,
`9d6029d`, `e89cd0d`. Inventory ref: BACKFILL-INVENTORY.md Seq 109. Related: `00055` (default
Markdown fileType + markup map), `00063` (detectSteps boolean), `00088` (test-level detectSteps
precedence), `00108` (3.0.0 wrapper defaults).
