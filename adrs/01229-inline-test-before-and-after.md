---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Inline test statements run their `before` and `after` files

## Context and Problem Statement

A test can name a `before` file, whose first test's steps run ahead of its own, and an `after`
file, whose steps run after them. The test schema allows both keys on every test, and the inline
tests page says an inline `test` statement takes "any of the test properties."

Detection merged those files only for JSON and YAML spec files. An inline statement such as
`<!-- test {"testId":"t","before":"set-cookie.spec.json"} -->` validated, then ran without its setup
steps. A test that depended on the setup failed, and nothing said why.

Should inline statements honor `before` and `after`, and how?

## Decision Drivers

* A key the schema accepts does what it says, wherever a test is written.
* One merge path, so setup and cleanup behave the same in spec files and documents.
* Cleanup steps keep their routing: they run after a failure and don't cascade-skip.

## Considered Options

* **A. Run the spec-file merge for tests detected in documents too** (chosen).
* **B. Reject `before` and `after` in inline statements.**

## Decision Outcome

Chosen option: **A**. The spec-file merge moves into one helper. Detection calls it for spec files,
as before, and for a document whose tests name `before` or `after`, after their paths resolve. The
merged spec is validated again, and a document whose merged spec is invalid is skipped with the
same message a spec file gets.

### Consequences

* Good, because an inline test runs the same steps as the identical test in a spec file.
* Good, because cleanup steps from an inline `after` keep the hard-routing that `after` promises.
* Neutral, because a setup or cleanup step has no source location in the document. It comes from
  another file.

### Confirmation

* `test/detecttests-coverage.test.js` checks that a Markdown test statement's `before` and `after`
  steps wrap its own steps, and that the cleanup steps keep their marker.
* `test/core-artifacts/detection/inline-before-after/` runs the reported case end to end. The setup
  file sets a cookie, and the test's `find` step passes only if the setup ran in its session.

## Pros and Cons of the Options

### A. Run the merge for document tests

* Good, because it matches the schema and the docs.
* Bad, because a document with `before` or `after` is validated twice. Documents without them skip
  the extra pass.

### B. Reject the keys inline

* Good, because it's a smaller change.
* Bad, because it takes a documented feature away from inline tests and breaks the shared test
  schema.
