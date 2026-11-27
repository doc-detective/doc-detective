---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Report inline statements that don't parse, and keep YAML statements to YAML

## Context and Problem Statement

An inline statement holds JSON, YAML, or `key=value` attributes. The AsciiDoc and HTML pages showed
a one-line YAML test statement with two keys, such as `<!-- test testId: my-test description: Test
description -->`. That isn't YAML: a block mapping can't hold a second key on the same line, so the
parser rejects it. Detection dropped the statement without a word. Its steps then joined a test with
a generated ID, so the authored `testId`, `description`, and any setup it named were lost.

The YAML flow mapping, `{testId: my-test, description: Test description}`, already works.

Should Doc Detective accept the two-key form, or correct the docs? And what should happen to a
statement that doesn't parse?

## Decision Drivers

* A statement means one thing. YAML statements follow YAML.
* A statement Doc Detective ignores mustn't look like it ran.
* `test end` and `test ignore` comments also match most `testStart` patterns, and must stay quiet.

## Considered Options

* **A. Correct the docs to the flow-mapping form, and report any statement that doesn't parse** (chosen).
* **B. Parse space-separated `key: value` pairs on one line.**
* **C. Correct the docs only.**

## Decision Outcome

Chosen option: **A**. The AsciiDoc, HTML, and inline-tests pages show multi-key YAML inside braces.
A `test` or `step` statement that parses as neither JSON, YAML, nor attributes logs a warning and
reaches `onInvalid`:

```text
Couldn't parse the inline `test` statement `testId: my-test description: Test description`. Write it as JSON, as YAML with more than one key inside braces (`{key: value, key: value}`), or as `key=value` attributes.
```

So `doc-detective validate` lists the file as invalid. A run that exits on failure stops before it
runs anything, as it does for other invalid inline tests. A match that a `test end` or `test
ignore` statement covers isn't reported, and neither is one inside an ignore block.

### Consequences

* Good, because the docs show statements that parse.
* Good, because a statement that doesn't parse is named, with the fix, instead of vanishing.
* Bad, because a document that held such a statement, and passed, now fails `validate` and a run
  that exits on failure. Its tests didn't run as written before, so the failure is the true state.

### Confirmation

* `src/common/test/strictKeys.test.js` checks that an unparsed `test` or `step` statement is
  reported, that a flow mapping parses without a report, and that `test end` stays quiet.
* `test/core-artifacts/detection/inline-statement-forms.md` runs a test in each supported form.

## Pros and Cons of the Options

### A. Correct the docs and report

* Good, because the syntax stays plain YAML, which editors and linters already check.
* Bad, because it changes the result for documents that held a broken statement.

### B. Parse `key: value` pairs on one line

* Good, because the documented form would work.
* Bad, because it's ambiguous: a value can hold `: `, as in `description: Note: slow`, and nothing
  marks where one value ends and the next key starts.
* Bad, because it's a dialect only Doc Detective reads.

### C. Correct the docs only

* Good, because nothing changes for existing documents.
* Bad, because anyone who already wrote the old form keeps losing the statement without knowing.
