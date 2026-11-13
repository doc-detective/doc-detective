---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Find the bundled schemas from the package root

## Context and Problem Statement

The config and spec error formatter loads the bundled `schemas.json` to name the nearest real key. It found the
file with a path relative to its own module, `dist/core/utils.js`. The CommonJS build runs every module from
`dist/index.cjs`, one folder shallower, so the same relative path pointed outside `dist/`.

A CommonJS caller that passed a bad config or spec to `runTests()` got this rejection instead of the validation
message:

```text
Cannot find module '../common/src/schemas/schemas.json'
```

How should the formatter find the file from both builds?

## Decision Drivers

- `require("doc-detective")` and `import "doc-detective"` report the same errors.
- One lookup rule for every file the package ships beside its code. The PTY probe worker already uses one.

## Considered Options

- **A. Resolve from `packageRoot()`.** It walks up to the folder whose `package.json` is named `doc-detective`.
- **B. Copy `schemas.json` next to `dist/index.cjs` at build time.**
- **C. Import the schemas statically.**

## Decision Outcome

Chosen option: **A**. The formatter reads `<packageRoot>/dist/common/src/schemas/schemas.json`, as
`ptyWatchdog.ts` does for its worker. The file still loads only on the way to an error.

### Consequences

- Good: a CommonJS caller gets the validation message, such as an unknown key and the nearest real one.
- Good: no build step changes, and no second copy of a 40 MB file.
- Neutral: the formatter depends on the package's own `package.json` name, like the other lookups that use
  `packageRoot()`.

### Confirmation

`test/cjs-schema-path.test.js` calls `require("doc-detective").runTests()` with an unknown config key. It rejects
with a message that names the key, not `Cannot find module`.

## Pros and Cons of the Options

### A. Resolve from `packageRoot()`

- Good: one rule for both builds, already in use.
- Bad: run outside the package, the lookup has no root and falls back to the working directory.

### B. Copy the file next to the bundle

- Good: the relative path works from the bundle.
- Bad: a second 40 MB file in every install, and the ESM build still needs its own path.

### C. Import the schemas statically

- Good: the bundler resolves the path.
- Bad: every run pays to load 40 MB, where today only a run with an error does.
