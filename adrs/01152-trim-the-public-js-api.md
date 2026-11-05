---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Trim the public JS API to runTests and getRunner

## Context and Problem Statement

The `doc-detective` package exports `runTests`, `getRunner`, `detectTests`, `detectAndResolveTests`,
`resolveTests`, `readFile`, and `resolvePaths`, plus a `./cli` subpath. Only `getRunner` has a decision behind
it ([ADR 00138](00138-public-getrunner-api.md)). The rest are public because they were re-exported, and removing
any of them later is a breaking change. What should 5.0 commit to?

## Decision Drivers

- Every export is a promise we have to keep across majors.
- Nothing in the docs, this repository's runtime, the Action, Online, or agent-tools imports the package root's
  other exports.
- Code search found no real external consumers, though it can't prove there are none.
- `detectTests` here takes `{config}`, while `doc-detective-common`'s takes `{content, filePath, fileType, config}`.
  Two functions with one name invite mistakes.

## Considered Options

- **A. Export only `runTests` and `getRunner`, and remove `./cli`.**
- **B. Keep all seven, and document them.**
- **C. Deprecate the extras, and remove them in a later major.**

## Decision Outcome

Chosen option: **A**.

- `runTests` runs tests, and it's what the CLI itself is a wrapper around.
- `getRunner` stays, per ADR 00138.
- `./cli` goes. Importing it starts a CLI run, because the module runs `main()` on load, so it was never usable as
  an API. The `doc-detective` bin doesn't depend on it.
- `doc-detective-common` is unchanged. It's the package for validating and parsing, and Online depends on it.

`dist/core/index.js` keeps its exports for internal use. The `exports` map blocks deep imports, so they aren't
public.

### Consequences

- Good: a small API we can keep stable, and the next major has less to break.
- Bad: anyone using the removed exports must move. `--dry-run` covers resolving tests, and `doc-detective-common`
  covers detecting them in a string.
- Neutral: adding an export later doesn't need a major, so this is easy to relax on demand.

### Confirmation

`test/exports.test.js` asserts the exact export list from ESM and CommonJS, and the `exports` map.

## Pros and Cons of the Options

### A. Export only `runTests` and `getRunner`

- Good: cheapest now, with one migration for anyone affected.
- Bad: can break a consumer we couldn't see.

### B. Keep and document all seven

- Good: nothing breaks.
- Bad: commits us to internals, such as `readFile` and `resolvePaths`, for no known user.

### C. Deprecate, then remove later

- Good: gives notice.
- Bad: schedules a breaking change in a future major, which is what this release is trying to avoid.
