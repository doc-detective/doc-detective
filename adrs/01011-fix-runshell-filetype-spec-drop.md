---
status: accepted
date: 2026-06-30
decision-makers: doc-detective maintainers
---

# Fix: emit the spec for files matched by a custom runShell fileType

## Context and Problem Statement

A config `fileType` may carry a `runShell` template so that files with a given extension are turned
into a single `runShell` step (with `$1` substituted for the file path). This lets a user point Doc
Detective at, say, a `*.task` file and have it executed as a shell step. The detection pipeline for
this lives in `parseTests` in [src/core/detectTests.ts](../src/core/detectTests.ts).

While writing coverage tests we found that the `runShell` branch of the per-file loop
[#435](https://github.com/doc-detective/doc-detective/issues/435) **silently drops its output spec**.
The branch built the `runShell` step, validated it against `test_v3`, pushed the test onto
`spec.tests`, and then `continue`d:

```ts
if (fileType?.runShell) {
  ... build `test` with a runShell step, validate test_v3 ...
  spec.tests.push(test);
  continue;              // <-- skips the spec finalization below
}
```

The `continue` jumps past the shared spec-finalization at the end of the loop — spec_v3 validation,
`resolvePaths`, the `_phase` stamp, and `specs.push(spec)`. So the spec object was fully built and
carried a valid test, but was **never pushed to `specs`**: a `runShell`-typed file produced no output
spec, and therefore no test ever ran for it.

The documented contract — a `runShell` fileType "performs a runShell step for this file type"
([File type (executable)](../docs/fern/pages/reference/schemas/file-type-executable.mdx)) — was always
the intent. This is a control-flow bug (a `continue` placed before the push), not a contract change.

## Decision Drivers

* Restore the documented behavior: a custom `runShell` fileType must actually emit a runnable test.
* Reuse the existing finalization exactly — one source of truth for spec_v3 validation, path
  resolution, and the phase stamp — so the runShell path can't drift from the text path.
* Don't run `parseContent` for runShell files: they carry no inline test statements to parse, and the
  step has already been built.
* Keep behavior for non-runShell files byte-for-byte identical.

## Considered Options

* **Finalize in-branch, then `continue`** — after `spec.tests.push(test)`, run the same spec_v3
  validate → `resolvePaths` → `_phase` stamp → `specs.push(spec)` sequence the text path uses, then
  `continue` (skipping `parseContent`).
* **Delete the `continue` and fall through to the shared finalization** — let the runShell branch
  drop into the existing text finalization block instead of duplicating it.

## Decision Outcome

Chosen: **finalize in-branch, then `continue`**. After the test is validated and pushed, the branch
now runs the identical finalization (spec_v3 validate; on success `resolvePaths`, re-stamp
`spec._phase = config._phaseByFile?.get(path.resolve(file)) ?? "main"`, and `specs.push(spec)`) and
only then `continue`s.

Falling through was rejected because the shared block also calls `parseContent` and re-filters
`spec.tests` — appropriate for text/markdown files, but wrong for a runShell file whose single step is
already built. Falling through would run `parseContent` needlessly (and could append or drop steps),
whereas the in-branch finalization keeps the runShell path minimal and self-contained.

### Consequences

* Good: a custom `runShell` fileType now emits exactly one spec, with one test containing one
  `runShell` step — the documented behavior is restored.
* Good: the finalization mirrors the text path (same validation, `resolvePaths`, and `_phase`
  semantics), so runShell specs get the same path resolution and phase handling as every other spec.
* Neutral: files that previously produced no spec now produce one. This is the intended, documented
  behavior; no existing valid detection is altered. A runShell template that fails `test_v3` still
  logs a warning and emits nothing, unchanged.
* Trade-off: the finalization sequence is now written in two places (the runShell branch and the text
  branch) rather than shared. Accepted deliberately to avoid running `parseContent` for runShell
  files; the two copies are small and kept in sync by comment.

### Confirmation

A unit test in [test/detecttests-coverage.test.js](../test/detecttests-coverage.test.js) —
"emits a spec with a runShell step from a custom runShell fileType (#435)" — asserts that a `*.task`
file matched by a `runShell` fileType yields `specs.length === 1` whose single test's single step is a
`runShell` step. The companion test asserting that an invalid runShell template still emits nothing is
unchanged. Regression coverage in `test/spec-location.test.js` and `test/run-artifacts.test.js`
confirms non-runShell detection is unaffected.

## Docs impact

This restores **user-facing behavior**: a custom `runShell` fileType now actually emits a runnable
test rather than silently producing nothing. The generated reference page
[File type (executable)](../docs/fern/pages/reference/schemas/file-type-executable.mdx) already
documents the field as performing "a runShell step for this file type" — i.e. the page describes the
now-honored contract, so **no documentation page requires changes**. No config/CLI flag, output
format, or default is added or altered.

## Pros and Cons of the Options

### Finalize in-branch, then `continue`
* Good: minimal and self-contained; never runs `parseContent` for runShell files; reuses the exact
  validation/path/phase logic of the text path.
* Bad: duplicates the small finalization sequence (kept in sync by comment).

### Delete the `continue` and fall through
* Good: no duplicated finalization code.
* Bad: also runs `parseContent` and re-filters `spec.tests` — inappropriate for a runShell file whose
  step is already built; risks appending/dropping steps and couples the runShell path to text-parsing
  behavior.
