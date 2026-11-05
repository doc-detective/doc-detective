---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Read inline statements in the LSP the way the runner does

## Context and Problem Statement

The language server flags invalid inline `test` and `step` statements in Markdown, AsciiDoc, HTML, and DITA files. It
found them with its own regex scan, beside the runner's. The two disagreed about ignore blocks:

- The LSP hid everything from `test ignore start` to `test ignore end`, or to the end of the file. The runner also ends
  an ignore block at `test end`, so the LSP missed steps the runner runs.
- The LSP hid `test` statements in an ignore block. The runner opens those tests, so the LSP missed errors the runner
  acts on.

[ADR 01155](01155-detect-tests-with-selectors.md) adds `inlineStatements.in`, which reads statements from parsed nodes.
A second scanner would have to learn that too. Should the LSP keep its own scanner?

## Decision Drivers

- The editor should flag the statements the runner reads, and only those.
- One scanner to maintain.

## Considered Options

- **A. The LSP reads statements through common's `collectStatements`, and walks them as `parseContent` does.**
- **B. Keep the LSP's scanner, and teach it containers and the runner's ignore rules.**

## Decision Outcome

Chosen option: **A**. `computeInlineDiagnostics` collects statements with step detection off, then walks them in order.
`test ignore start` hides the steps after it until `test ignore end` or `test end`. `test` statements are always
checked, since the runner opens them. A diagnostic covers the statement's payload when it appears in the source, and
the whole statement otherwise. The LSP's `compilePattern`, `ignoreRanges`, `collectMatchOffsets`, and
`extractStatements` are gone.

### Consequences

- Good: the editor flags what the runner reads, including statements in a custom file type's containers. It skips the
  statements inside code that the runner skips.
- Good: one scanner. Zero-width patterns stay safe, because the collector uses `matchAll`, which always advances.
- Neutral: a file the runner would warn about, such as invalid MDX, gets no diagnostic for the warning.

### Confirmation

`test/lsp.test.js` asserts that a step after `test end` is flagged inside an unclosed ignore block, and that a `test`
statement in an ignore block is checked. It also asserts that a diagnostic covers the payload, and that a custom file
type's comment container skips a statement inside a code fence. A zero-width pattern still terminates.

## Pros and Cons of the Options

### A. Read statements through `collectStatements`

- Good: deletes the parallel scanner, about 70 lines.
- Bad: the collector reports the statement's span, so the LSP finds the payload inside it by text.

### B. Keep the LSP's scanner

- Good: no change to diagnostics ranges.
- Bad: two scanners that must agree, now on parsed nodes as well as regex.
