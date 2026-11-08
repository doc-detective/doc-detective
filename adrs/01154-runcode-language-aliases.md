---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Accept py and js as runCode languages

## Context and Problem Statement

The default Markdown `runCode` rule matches fences tagged `bash`, `python`, `py`, `javascript`, or `js`, and the
Markdown format page lists all five. The `runCode` schema accepts only `python`, `bash`, and `javascript`. A
` ```py ` or ` ```js ` fence therefore becomes a step that fails validation, and detection drops it. A test whose
only step was that fence disappears, so a run of that page finds no tests.

The runner already maps `py` to Python and `js` to Node, so only the schema stands in the way. Should `runCode`
accept the short names?

## Decision Drivers

- A fence the docs say becomes a step should become one.
- Authors write ` ```py ` and ` ```js ` as often as the long names.
- Reports should show the step as the author wrote it.
- The fix shouldn't widen what `runCode` accepts beyond names the runner already handles.

## Considered Options

- **A. Add `py` and `js` to the schema's `language` values.**
- **B. Rewrite `py` and `js` to the long names during detection.**
- **C. Drop `py` and `js` from the default Markdown rule.**

## Decision Outcome

Chosen option: **A**. `runCode.language` accepts `python`, `py`, `bash`, `javascript`, and `js`. `py` runs as
`python`, and `js` runs as `javascript`. Reports and resolved tests keep `language` as written. `node`, which the
runner also maps, stays outside the schema, because no detection rule produces it.

This is a breaking change. With step detection on, a ` ```py ` or ` ```js ` fence now becomes a `runCode` step. The
step is still marked `unsafe`, so it runs only with `allowUnsafeSteps`. It also changes the generated ID of any test
that gains it. It lands in 5.0 with the other detection changes.

### Consequences

- Good: the default Markdown rule and the schema agree, and the docs describe what happens.
- Good: a spec can use `py` and `js` directly, as well as detected steps.
- Neutral: the runner's existing alias handling becomes reachable, so no runtime code changes.
- Bad: suites with `allowUnsafeSteps` now run fences that were dropped before, and those steps can fail. The upgrade
  guide covers this.

### Confirmation

- `src/common/test/validate.test.js` asserts that each of the five names validates and is kept as written, and that
  `node`, `Python`, and `ruby` don't.
- `src/common/test/detectTests.test.js` asserts that the default Markdown fileType turns a fence in each of the five
  languages into a `runCode` step.
- `test/core-artifacts/process/runCode-aliases.spec.json` runs a `py` and a `js` step through the real runner.

## Pros and Cons of the Options

### A. Add `py` and `js` to the schema's `language` values

- Good: a two-value schema change, with the runtime mapping already in place.
- Good: keeps the author's spelling in reports.
- Neutral: one more spelling for each language in the reference.

### B. Rewrite `py` and `js` to the long names during detection

- Good: the schema keeps three values.
- Bad: specs still can't use the short names, and reports show a value the author didn't write.

### C. Drop `py` and `js` from the default Markdown rule

- Good: no schema change.
- Bad: ` ```py ` and ` ```js ` fences never become steps, contradicting the Markdown format page.
