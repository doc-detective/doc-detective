---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Capture paths default under outputDir

Builds on [ADR 01167](01167-validate-returns-the-effective-step.md). Covers the capture rows of the path rule, whose
own ADR is owned by the V-G change ("One rule for resolving relative paths").

## Context and Problem Statement

The path rule says a relative path you write resolves against the file you wrote it in, and a file the runner names
goes under `outputDir`, or under the run folder when it's per-run. Captures didn't follow it:

- `screenshot: true`, `screenshot: {}`, and `record: true` wrote `<stepId>.png` or `<stepId>.mp4` to the current
  folder, whatever `outputDir` said.
- A screenshot whose `path` is a URL wrote its capture to `./doc-detective-runs/<timestamp>/`, outside the run folder
  that holds every other per-run artifact.
- A spec loaded from a URL (`--input https://…`) resolved its relative paths against its temporary download, so a
  sample's `screenshot: "example.png"` was written to the system temp folder and lost.

The handlers also expanded shorthand and filled defaults themselves, which ADR 01167 moves into `validate()`. Where
do these files go, and what does the effective step say?

## Decision Drivers

- One rule for every path, so users can predict where a file lands.
- A named capture must land on the same path on every run, so comparison against the previous capture still works.
- `validate()` has no config, so it can name a file but can't place it.

## Considered Options

- **A. The normalizer names the file, and the runner places it under `outputDir`.**
- **B. The normalizer writes the full path.** It can't: `outputDir` is config.
- **C. Keep the current folder, and document it.**

## Decision Outcome

Chosen option: **A**.

- The normalizers expand `screenshot: true` and `record: true` to `{}`, and a path string to `{ path }`. When `path`
  is unset, they set it to `<stepId>.png` or `<stepId>.mp4`. A step without a `stepId` gets its name when the runner
  assigns one. `false` stays `false`, and disables the step. That includes `screenshot: false`, which captured
  anyway, against its schema. `stopRecord` expands a name to `{ name }`, and `null` to `true`.
- The runner resolves a relative capture path against `directory` if set, else `outputDir`. A path written in a spec
  file was already resolved against that file, so only runner-named paths, and paths with no spec file behind them,
  reach this step.
- A URL reference's capture goes to its context's `screenshots/` folder in the run folder, the same tree
  `autoScreenshot` uses: `<runDir>/specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/`.
- A spec loaded from a URL resolves its relative paths against `outputDir`, because it has no folder of its own.
- `record.overwrite` declares its `"false"` default in the schema. The runtime already used it.
- `record` accepts `.mp4`, `.webm`, and `.gif` in any case, and the runtime reads the extension in any case.
  `outputs.format` is lowercase.

### Consequences

- Good: captures land where `outputDir` says, and the effective step names the file.
- Good: every per-run artifact is in the run folder.
- Bad: with `outputDir` set to anything but the current folder, `true`/`{}` captures move, so an existing baseline
  in the current folder is no longer compared. Move it, or set `path`.
- Bad: report consumers that read `screenshot` or `record` as `true` or a string now read an object.

### Confirmation

- `src/common/test/normalize.test.js` covers each authored form's effective step.
- `test/capture-paths.test.js` covers the `outputDir` placement, the URL-reference folders, and remote specs.
- `test/core-artifacts/capture/screenshot-paths.spec.json` runs each form through the CLI, plus a spec served over
  HTTP. `recording/recording-permutations.spec.json` records a `.MP4`.
- `test/shorthand-ratchet.test.js` drops to 12.

## Pros and Cons of the Options

### A. The normalizer names, the runner places

- Good: `validate()` stays config-free, and the effective step still shows the file name.
- Bad: the effective step's path is relative until the runner places it.

### B. The normalizer writes the full path

- Bad: it needs config, which `validate()` doesn't have.

### C. Keep the current folder

- Good: not breaking.
- Bad: it contradicts the path rule, and `outputDir` silently doesn't apply.
