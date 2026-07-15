---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# LSP: inline-test diagnostics across all fileTypes, with a collapsed step error and a relaxed open statement

## Context and Problem Statement

Doc Detective's most distinctive authoring surface is tests embedded **inline** in
documentation — `<!-- test … -->` / `<!-- step … -->` comments (and the asciidoc/
html/dita equivalents) interleaved with prose. The prior LSP phases handled
standalone `.spec.json`/`.spec.yaml` files but gave inline authors nothing. Phase 4
extends diagnostics into markup files, which raises three problems a naive
implementation gets wrong:

1. **Detection must match the runner exactly.** If the LSP recognizes a different
   set of statement delimiters than the runner, it will flag valid tests or miss
   real ones.
2. **A single invalid step explodes into dozens of errors.** `step_v3` is a large
   `anyOf` over every action; an invalid step matches no branch, so AJV emits a
   "must have required property …" failure for *every* action — an unreadable wall.
3. **A valid open statement has neither `steps` nor `contexts`.** The runner
   assembles a test's steps from the statements that *follow* the open statement,
   so `test_v3`'s top-level "steps or contexts required" must NOT fire on an open
   statement alone — but every other field in it must still be validated.

## Decision Drivers

* Never drift from the runner's own detection or validation.
* One clear, actionable diagnostic per problem — not a schema-shaped error dump.
* No false positives on the (valid) fragmentary shapes inline authoring produces.
* Stay silent on ordinary prose; only recognized statement regions get flagged.
* Pure, hermetically testable modules (root coverage ratchet).

## Considered Options

* **A. Reuse the runner's `inlineStatements` patterns + fragment-aware validation**
  (chosen): extract statements with the fileType's own regexes, validate `step`
  fragments against `step_v3` (collapsing the `anyOf` wall to one action-scoped
  message), and validate `test` open fragments against `test_v3` with the
  top-level steps/contexts requirement filtered out.
* **B. Drive diagnostics off `detectTests`' assembled output.** Let common assemble
  the tests and validate those.
* **C. Re-implement a bespoke inline parser** tuned for the LSP.

## Decision Outcome

Chosen: **A**, in `src/lsp/inline.ts`. `computeDiagnostics` routes any markup file
(by extension) to the inline pipeline. Statements are found with the fileType's own
`inlineStatements.testStart` / `.step` patterns (from `defaultFileTypes`), honoring
`ignoreStart`/`ignoreEnd` blocks and using the regex `d` (hasIndices) flag to anchor
each diagnostic on the statement's payload span. Payloads are parsed with common's
`parseObject` (JSON / YAML / xml-attr).

- **`step` fragment** → validate against `step_v3`. If it's action-keyed, the
  flagship **error** (invalid) or the v2-deprecation **warning** (valid). Otherwise,
  the `anyOf` wall is collapsed: the intended action is inferred from the single
  top-level key that is a known action (via the registry), and only that action's
  own value errors are shown — reduced to one concise message (its value can fail
  several internal branches, e.g. `goTo` accepts a URL string *or* an object). If no
  known action key is present, a single "not a recognized step" message.
- **`test` open fragment** → validate against `test_v3`, then **filter out the
  top-level steps/contexts requirement** (a root-level `anyOf` failure, or a root
  `required` error naming `steps`/`contexts`). Everything else — bad `runOn`, an
  unknown property, a wrong-typed field — is still reported.

B was rejected: `detectTests` assembles and *validates*, dropping the invalid
fragments an authoring tool most needs to flag, and it does not surface per-open-
statement offsets for precise ranges. C was rejected: a second parser would drift
from the runner — exactly what A avoids by consuming the runner's own patterns.

### Consequences

* Good: inline authors get the same live validation as standalone specs, in every
  runner-supported fileType, anchored on the offending statement.
* Good: one readable diagnostic per problem instead of a schema dump; no false
  positives on valid fragmentary open statements.
* Good: silent on prose without Doc Detective statements (biased to silence).
* Neutral (accepted): inline **completion/hover** are deferred (they need cursor
  context inside arbitrary markup), as is the cross-statement **assembled-region**
  check (correlating `detectTests`' assembled output back to statement offsets to
  flag e.g. a region that never gains steps). Both are documented follow-ups.
* Neutral: the anyOf-collapse and the relaxed-open filter are heuristics tuned to
  AJV's current error shapes for `step_v3`/`test_v3`; they are pinned by tests so a
  schema change that alters those shapes surfaces as a test failure.

### Confirmation

* Red→green hermetic tests in `test/lsp.test.js`: valid inline test; collapsed
  invalid-step message; unknown-step message; action-keyed error vs v2 warning;
  relaxed open statement (no false steps/contexts error) vs a real field error and
  an unknown property; ignore blocks (closed and unterminated); unparsable payloads;
  and all four fileTypes. `dist/lsp` stays at 100% line/branch/function/statement
  coverage.

## Pros and Cons of the Options

### A. Reuse runner patterns + fragment-aware validation
* Good: no detection/validation drift; readable diagnostics; no fragment false
  positives.
* Bad: the collapse and relaxed-open filter are AJV-shape heuristics (pinned by
  tests).

### B. Drive off `detectTests` assembled output
* Good: no separate extraction.
* Bad: drops invalid fragments (the ones authors need flagged); no per-open-statement
  offsets.

### C. Bespoke inline parser
* Good: full control.
* Bad: a second detector that drifts from the runner.

## More Information

Design and phased roadmap: [docs/design/dsl-lsp.md](../docs/design/dsl-lsp.md)
(Phase 4, incl. deferred follow-ups). Builds on
[ADR 01066](01066-language-server-for-the-dsl.md) and
[ADR 01067](01067-lsp-yaml-parity-and-v2-warning.md). Reuses common's
`detectTests`/`parseObject` (`src/common/src/detectTests.ts`) and `defaultFileTypes`
(`src/common/src/fileTypes.ts`).
