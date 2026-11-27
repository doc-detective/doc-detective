---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Load `matrix` values from a JSON file or a sitemap

Builds on [ADR 01240](01240-matrix-on-runon-contexts.md), which added `runOn[].matrix` with inline values.

## Context and Problem Statement

A matrix over pages often has dozens of values, and the list already exists: a JSON file the site builds from, or the
site's `sitemap.xml`. Copying it into every spec drifts the moment a page is added. How can a `matrix` key take its
values from a file?

## Decision Drivers

- The list stays in one place, the file the site already has.
- A relative path reads the same way as every other path in a spec or config.
- Loading can't add a network failure mode to test detection.
- A run that expands into hundreds of contexts says so.

## Considered Options

- **A. `matrix.<key>: { "file": "<path>" }`, a local `.json` or `.xml` sitemap, read while tests resolve.**
- **B. A `url` that fetches the list.**
- **C. Read the list in a `before` step and export it.**

## Decision Outcome

Chosen option: **A**.

- A `matrix` key takes `{ "file": "<path>" }` in place of a list.
- The path resolves like every other path: against the spec or config file that declares the `runOn`, or the working
  directory with `relativePathBase: "cwd"`.
- A `.json` file holds an array under the same rules as inline values. An `.xml` file is a sitemap, and each `<loc>`
  is one string value. Any other extension is an error.
- Doc Detective reads each file once per run, while tests resolve, before anything runs.
- No remote URLs.
- A URL in `goTo`, and in `checkLink` and `httpRequest`, which share its pattern, may start with a `$$matrix.<key>`
  reference, so a sitemap's full URLs drive a step directly. The pattern otherwise requires `http(s)://`, `/`, or
  `$VAR`.
- When a test expands into contexts from a matrix, the run log says how many, at `info`:
  `<testId>: <n> contexts from matrix.`

A file that can't load makes its spec invalid, so the CLI exits `2`:

- ``tests[<i>]: Couldn't read `matrix` file `<absolute path>`.``
- ``tests[<i>]: Couldn't load `matrix` key `page`: `<absolute path>` isn't a JSON array.``
- ``tests[<i>]: Couldn't load `matrix` key `page`: `<absolute path>` has no values.``
- ``tests[<i>]: Couldn't load `matrix` key `page`: `<absolute path>` has values `matrix` doesn't accept.``
- ``tests[<i>]: Couldn't load `matrix` key `url`: `<absolute path>` has no `<loc>` entries.``
- ``tests[<i>]: Couldn't load `matrix` key `page`: `<absolute path>` must be `.json` or `.xml`.``

### Consequences

- Good, because a sitemap or page list drives the matrix with no copy to drift.
- Good, because detection stays offline.
- Bad, because a list that lives behind a URL has to be downloaded first, for example in a CI step.

### Confirmation

[test/matrix.test.js](../test/matrix.test.js) covers a JSON file, a sitemap, relative path resolution, and each error.
[test/core-artifacts/matrix/files.spec.json](../test/core-artifacts/matrix/files.spec.json) runs a key from
`pages.json` and one from `sitemap.xml` through the real runner.

## Pros and Cons of the Options

### A. A local file, read while tests resolve

- Good, because it reuses path resolution and needs no new dependency: a sitemap's `<loc>` entries parse with a
  regular expression.
- Bad, because a remote list needs a download step first.

### B. A `url` that fetches the list

- Good, because a live sitemap works directly.
- Bad, because detection then needs the network, and a flaky fetch fails the whole spec.

### C. Read the list in a `before` step

- Good, because no new key.
- Bad, because contexts resolve before any step runs, so a step can't add contexts.
