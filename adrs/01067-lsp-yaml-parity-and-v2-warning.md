---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# LSP: YAML diagnostics parity via a format-agnostic model, and warn (not error) on valid v2 specs

## Context and Problem Statement

Phase 1 of the Doc Detective language server ([ADR 01066](01066-language-server-for-the-dsl.md))
shipped JSON-only diagnostics, including a flagship **error** on the `action`-keyed step antipattern.
Two problems surfaced for Phase 3:

1. **YAML is a first-class spec format** (`.spec.yaml`, `.doc-detective.yaml`) but got no
   authoring-time feedback. The JSON pipeline is built on jsonc-parser's CST (`getNodeValue`,
   `findNodeAtLocation`, source offsets); YAML needs an equivalent, and we do not want two parallel
   copies of the schema/diagnostic logic.
2. **The flagship error was a false positive on valid input.** A legacy **v2** spec writes steps in
   exactly the `action`-keyed form (`{action: "goTo", url: …}`). Doc Detective still supports v2 by
   transforming it to a valid `spec_v3` at validation time, so such a spec is *valid* — yet the
   flagship error fired on every step, telling the author their valid document was wrong.

## Decision Drivers

* Write the schema/diagnostic logic once, not once per serialization format.
* Never emit an **error** on a document the runner would accept — an LSP that red-squiggles valid
  input is worse than one that stays quiet.
* Still nudge authors off the deprecated v2 form (the original intent of the flagship), without
  lying about validity.
* Keep every module pure and hermetically unit-testable (root coverage ratchet).

## Considered Options

* **A. A format-agnostic `SpecModel` + severity split** (chosen): one interface (`value`,
  `syntaxErrors`, `rangeForPath`, `actionKeyedSteps`) implemented by a JSON backend (jsonc CST) and
  a YAML backend (`yaml` `parseDocument` AST). The action-keyed diagnostic becomes severity-aware:
  **error** only when the document is invalid; **warning** ("legacy v2 form, prefer v3") when it is
  valid.
* **B. Duplicate the JSON diagnostics module for YAML.** Two `computeDiagnostics`-like paths.
* **C. Keep flagging action-keyed steps as errors always** (status quo), accepting the v2 false
  positive, or drop the flagship entirely.

## Decision Outcome

Chosen: **A**. `src/lsp/model.ts` defines `SpecModel`; `buildModel(uri, text)` returns the JSON or
YAML backend by extension (or null). `computeDiagnostics` works entirely against `SpecModel`, so the
gate → parse → validate → map-to-ranges → action-keyed pipeline is written once and runs for both
formats. YAML nodes are located with `doc.getIn(path, true).range`; syntax errors come from
`doc.errors`. The detection gate also parses `.yaml`/`.yml` through the YAML parser so the
`$schema`/shape-sniff opt-in works for YAML, not just JSON.

For the v2 question, the action-keyed diagnostic is now **conditioned on validity**:

- **Invalid** document with an action-keyed step → the flagship **error** (with the raw `anyOf`
  noise suppressed), because in a v3 context that step is a genuine mistake.
- **Valid** document that used the action-keyed form → a non-blocking **warning** steering to the
  compact v3 form. It transformed to a valid `spec_v3`, so it is not an error; the warning is the
  correct home for the deprecation nudge (which is why the version-mixing check lives here).

A syntactically broken buffer shows only its **syntax** errors — schema validation of the partial
value produces misleading "must be object" noise, so it is skipped until the buffer parses.

B was rejected: two diagnostics paths would drift and double the maintenance of every future check.
C was rejected: erroring on valid v2 input is a false positive, and dropping the flagship loses the
single most valuable diagnostic.

### Consequences

* Good: YAML specs/configs get the same live validation, source-mapped errors, and action-keyed
  handling as JSON, with zero duplicated schema logic.
* Good: no false-positive errors on valid v2 specs; authors still get a migration nudge.
* Good: the `SpecModel` seam is exactly what Phase 4 (inline tests) needs to reuse.
* Neutral (accepted): YAML **completion/hover** are not yet provided (they need YAML cursor-context,
  which jsonc's `getLocation` gives JSON for free); deferred and documented in the design doc.
* Neutral: fs/cross-file semantic checks (`loadVariables` path existence, variable origin, deep
  `runOn` sanity) remain deferred — they need a workspace-filesystem seam, out of scope for the
  pure in-process modules shipped here.

### Confirmation

* Red→green hermetic tests in `test/lsp.test.js`: YAML valid/invalid/syntax/action-keyed diagnostics;
  the "warns (not errors) on a valid legacy v2 spec" case for both JSON and YAML; the YAML
  positions module (instancePath→range, action-keyed detection, syntax spans); and the `SpecModel`
  contract. `dist/lsp` stays at 100% line/branch/function/statement coverage.

## Pros and Cons of the Options

### A. Format-agnostic SpecModel + severity split
* Good: one logic path; correct severity; reusable seam for inline tests.
* Bad: a small abstraction layer and two backend implementations to keep in step (pinned by shared
  tests).

### B. Duplicate the diagnostics module per format
* Good: no abstraction.
* Bad: two drifting copies of every schema/diagnostic rule.

### C. Always error on action-keyed / drop the flagship
* Good: no new code.
* Bad: false positives on valid v2 specs, or loss of the highest-value diagnostic.

## More Information

Design and phased roadmap: [docs/design/dsl-lsp.md](../docs/design/dsl-lsp.md) (Phase 3, incl. the
deferred follow-ups). Builds on [ADR 01066](01066-language-server-for-the-dsl.md).
