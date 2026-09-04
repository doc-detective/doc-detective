---
status: superseded by ADR 01096
date: 2026-07-27
decision-makers: [hawkeyexl]
---

# Pass Vale's changed-file list as a JSON array, not a space-separated string

> **Superseded by [ADR 01096](01096-vale-gates-the-whole-repo-and-fails-on-errors.md).** The Vale
> check now lints the whole repository and fails on any error. There is no changed-file list to
> marshal, and the `tj-actions/changed-files` step this decision wired up has been removed. The
> analysis below is kept because it records why a whitespace `separator` can never work with
> vale-action. That's worth knowing if changed-file scoping is ever revisited.

## Context and Problem Statement

The Vale style check ([.github/workflows/vale.yml](../.github/workflows/vale.yml)) is meant to
lint only the docs files a PR touches ([PR #325](https://github.com/doc-detective/doc-detective/pull/325)).
It collected changed paths with `tj-actions/changed-files` (space-separated by default) and handed
them to `errata-ai/vale-action` with `separator: " "`. In practice the scoping never engaged. Runs
logged `##[warning]User-specified path (...) is invalid; falling back to 'all'` and linted the
entire docs tree. Pre-existing ERROR-severity findings in untouched files then turned the check red
on unrelated PRs, such as `Google.Exclamation` in `docs/fern/pages/contribute/index.mdx`. That was
observed on [PR #691](https://github.com/doc-detective/doc-detective/pull/691).

Root cause: vale-action reads its `separator` input via `@actions/core`'s `getInput()`, which
**trims whitespace by default**. A `" "` separator, or any all-whitespace one, arrives as `""`. The
split branch is skipped, the space-separated list falls through to `JSON.parse()`, and the parse
throws. The action then silently falls back to linting everything. A whitespace separator can never
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

Chosen option: "Pass the list as a JSON array". vale-action's `JSON.parse` branch is its
documented "array of inputs" path, with no separator plumbing at all. It is lossless for any path
characters, spaces and commas included, while a `,` separator merely trades one reserved character
for another. Cleaning up pre-existing findings alone would leave scoping broken. That keeps
whole-repo noise and runtime on every docs PR, and re-breaks as soon as any file regresses.

### Consequences

* Good, because only the PR's changed docs files are linted; unrelated pre-existing findings no
  longer fail the check.
* Good, because the `--glob` exclusion of generated schema pages remains as belt-and-braces. That
  covers the case where the files input fails to parse and the action falls back to 'all'.
* Bad, because `escape_json: false` is load-bearing: re-enabling escaping would backslash-escape
  the quotes and silently reinstate the fallback. The workflow comment documents this.

### Confirmation

[test/vale-workflow.test.js](../test/vale-workflow.test.js) pins the contract. It re-implements
vale-action's `lib/input.js` resolution, including `getInput()` trimming. It asserts that the old
space-separated wiring falls back to whole-repo lint. A JSON array, spaced paths included,
resolves to per-file args. Escaped JSON re-breaks parsing. And
[vale.yml](../.github/workflows/vale.yml) keeps `json: true` plus `escape_json: false`, with no
`separator` input at all. Any separator surviving the trim would split the JSON text itself.
The test fails against the pre-fix workflow and passes against this one.
Post-merge, the "Run vale" step log should show per-file arguments and no
`falling back to 'all'` warning.

## Pros and Cons of the Options

### JSON array

* Good, because it is the action's documented list format, parsed by design rather than by convention.
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
