---
status: accepted
date: 2026-07-27
decision-makers: [hawkeyexl]
---

# Pass Vale's changed-file list as a JSON array, not a space-separated string

## Context and Problem Statement

The Vale style check ([.github/workflows/vale.yml](../.github/workflows/vale.yml)) is meant to
lint only the docs files a PR touches ([PR #325](https://github.com/doc-detective/doc-detective/pull/325)).
It collected changed paths with `tj-actions/changed-files` (space-separated by default) and handed
them to `errata-ai/vale-action` with `separator: " "`. In practice the scoping never engaged: runs
logged `##[warning]User-specified path (...) is invalid; falling back to 'all'` and linted the
entire docs tree, so pre-existing ERROR-severity findings in untouched files (e.g.
`Google.Exclamation` in `docs/fern/pages/contribute/index.mdx`) turned the check red on unrelated
PRs — observed on [PR #691](https://github.com/doc-detective/doc-detective/pull/691).

Root cause: vale-action reads its `separator` input via `@actions/core`'s `getInput()`, which
**trims whitespace by default**. A `" "` (or any all-whitespace) separator arrives as `""`, so the
split branch is skipped, the space-separated list falls through to `JSON.parse()`, the parse
throws, and the action silently falls back to linting everything. A whitespace separator can never
work with this action.

## Decision Drivers

* The check must go red only for findings in files the PR changed.
* Prefer a mechanism the action explicitly supports over one that happens to work.
* Keep the workflow legible; the failure mode was silent and non-obvious once already.

## Considered Options

* Pass the list as a JSON array (`changed-files` with `json: true`, `escape_json: false`).
* Use a non-whitespace separator (e.g. `,`) on both actions.
* Leave the fallback in place and clean up all pre-existing error-severity findings.

## Decision Outcome

Chosen option: "Pass the list as a JSON array", because vale-action's `JSON.parse` branch is its
documented "array of inputs" path — no separator plumbing at all, and it is lossless for any path
characters (spaces, commas), while a `,` separator merely trades one reserved character for
another. Cleaning up pre-existing findings alone would leave scoping broken, keeping whole-repo
noise (and whole-repo runtime) on every docs PR and re-breaking as soon as any file regressed.

### Consequences

* Good, because only the PR's changed docs files are linted; unrelated pre-existing findings no
  longer fail the check.
* Good, because the `--glob` exclusion of generated schema pages remains as belt-and-braces if the
  files input ever fails to parse and the action falls back to 'all'.
* Bad, because `escape_json: false` is load-bearing: re-enabling escaping would backslash-escape
  the quotes and silently reinstate the fallback. The workflow comment documents this.

### Confirmation

[test/vale-workflow.test.js](../test/vale-workflow.test.js) pins the contract: it re-implements
vale-action's `lib/input.js` resolution (including `getInput()` trimming) and asserts that the old
space-separated wiring falls back to whole-repo lint, that a JSON array — spaced paths included —
resolves to per-file args, that escaped JSON re-breaks parsing, and that
[vale.yml](../.github/workflows/vale.yml) keeps `json: true` + `escape_json: false` with no
`separator` input at all (any separator surviving the trim would split the JSON text itself).
The test fails against the pre-fix workflow and passes against this one.
Post-merge, the "Run vale" step log should show per-file arguments and no
`falling back to 'all'` warning.

## Pros and Cons of the Options

### JSON array

* Good, because it is the action's documented list format — parsed by design, not by convention.
* Good, because it is lossless for any path characters.
* Neutral, because it couples to `escape_json: false` (documented in the workflow).

### Non-whitespace separator (`,`)

* Good, because it is a minimal diff.
* Bad, because it relies on the same under-documented `separator` input that just failed silently,
  and breaks for any future path containing the chosen character.

### Clean up pre-existing findings; keep the fallback

* Good, because the docs tree ends up lint-clean.
* Bad, because scoping stays broken: every docs PR lints the whole tree, and any single regression
  anywhere re-poisons unrelated PRs. Worth doing independently, but not a fix.
