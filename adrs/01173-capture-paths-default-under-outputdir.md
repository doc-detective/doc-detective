---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Capture paths default under outputDir

Builds on [ADR 01167](01167-validate-returns-the-effective-step.md). The path rule has its own ADR, "One rule for
resolving relative paths", owned by the V-G change. That ADR cites this one for the rows below.

## Context and Problem Statement

The path rule says a relative path you write resolves against the file you wrote it in. A file the runner names goes
under `outputDir`, or under the run folder when it's per-run. Captures didn't follow it:

- `screenshot: true`, `screenshot: {}`, and `record: true` wrote `<stepId>.png` or `<stepId>.mp4` to the current
  folder. `outputDir` didn't apply.
- A screenshot whose `path` is a URL wrote its capture to `./doc-detective-runs/<timestamp>/`. Every other per-run
  artifact is in the run folder.
- A spec loaded from a URL (`--input https://…`) resolved its relative paths against its temporary download. So a
  sample's `screenshot: "example.png"` went to the system temp folder and was lost.

The handlers also expanded shorthand and filled defaults themselves, which ADR 01167 moves into `validate()`. Where
do these files go, and what does the effective step say?

## Decision Drivers

- One rule for every path, so users can predict where a file lands.
- A named capture must land on the same path on every run, so comparison against the previous capture still works.
- `validate()` has no config, so it can name a file but can't place it.
- The report must say where each file went.

## Considered Options

- **A. The normalizer names the file, and the runner places it under `outputDir`.**
- **B. The normalizer writes the full path.** It can't: `outputDir` is config.
- **C. Each handler places the file.**
- **D. Keep the current folder, and document it.**

## Decision Outcome

Chosen option: **A**.

**Naming.** The normalizers expand `screenshot: true` and `record: true` to `{}`, and a path string to `{ path }`.
When `path` is unset, they set it to `<stepId>.png` or `<stepId>.mp4`. A step without a `stepId` gets its name when
the runner assigns one. `stopRecord` expands a name to `{ name }`, and `null` to `true`.

**Disabled steps.** `false` stays `false`, and disables the step. That includes `screenshot: false`. It captured
anyway, against its schema, and now skips.

**Placing.** The runner places a relative capture path once, with `placeCapturePaths`. It runs right after the runner
builds the effective step, and again after `$VAR` substitution. The path resolves against `directory` if set, else
`outputDir`. A path written in a spec file is already absolute, so only these reach it:

- a file the normalizer named;
- a path with no spec file behind it, such as a step passed to the JavaScript `getRunner()` API.

A URL stays as it is. A `path` or `directory` with a `$VAR` in it, whole or embedded, waits for substitution. Placing
it before then would put the variable's name in an absolute path, which the pass after substitution skips. Handlers
get absolute paths, and the effective step and the report show them.

**Unset variables.** A `$VAR` still in a capture's `path` or `directory` after substitution is a variable that isn't
set. The step fails, instead of writing to a folder named after the variable:
``Couldn't save the screenshot. `directory` (`$SHOTS_DIR`) has a variable that isn't set.`` A recording says
``Couldn't start the recording.``

**Steps without an ID.** A runner-named capture needs a `stepId`. A step without one, such as a `getRunner()` step,
used to write `undefined.png`. It now fails with one of these messages:

- ``Couldn't name the screenshot. Set `path`, or set the step's `stepId`.``
- ``Couldn't name the recording. Set `path`, or set the step's `stepId`.``

**URL references.** A URL reference's capture goes to its context's `screenshots/` folder in the run folder. That's
the tree `autoScreenshot` uses: `<runDir>/specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/`.

**Specs loaded from a URL.** Every relative path in a spec loaded from a URL resolves against `outputDir`. The spec
has no folder of its own, and its download is temporary. That covers every path field the spec loader resolves:

- captures: `screenshot` and `record`, with their `path` and `directory`;
- `loadVariables`, and a test's `before` and `after`;
- `workingDirectory` on `runShell`, `runCode`, and `startSurface`;
- the output `path` and `directory` of `httpRequest`, `runShell`, `runCode`, and `runBrowserScript`;
- `saveCookie` and `loadCookie` `path` and `directory`;
- `openApi` `descriptionPath`.

With `relativePathBase: "cwd"`, these resolve against the current folder, as every relative path does.

**Folders with a dot.** `outputDir` and `directory` are always folders. The path resolver used to treat a folder that
doesn't exist yet, with a dot in its name such as `out.v2`, as a file. It then resolved against the parent. It now
treats both as folders.

**Schema.** `record.overwrite` declares its `"false"` default, which the runtime already used. `record` accepts `.mp4`,
`.webm`, and `.gif` in any case. The runtime reads the extension in any case, and `outputs.format` is lowercase.

**`outputDir`'s own default.** `outputDir` defaults to `.`, which resolves against the config file's folder. With no
config file, that's the current folder. So with `--config sub/x.json` and no `outputDir`, `true` and `{}` captures
move from the current folder to `sub/`.

### Consequences

- Good: captures land where `outputDir` says, and the effective step and the report show the full path.
- Good: every per-run artifact is in the run folder.
- Good: a sample spec served over HTTP keeps its files.
- Bad: when `outputDir` isn't the current folder, `true` and `{}` captures move. A baseline left in the current folder
  is no longer compared. Move it, or set `path`.
- Bad: report consumers that read `screenshot` or `record` as `true` or a string now read an object.

### Confirmation

- `src/common/test/normalize.test.js` covers each authored form's effective step.
- `test/effective-step.test.js` covers `placeCapturePaths`, including a whole-variable capture.
- `test/capture-paths.test.js` covers placement, the URL-reference folders, remote specs, and dotted folders.
- `test/cli-contract.test.js` checks that the `--json` report shows the absolute `<outputDir>/<stepId>.png`.
- `test/core-artifacts/capture/screenshot-paths.spec.json` runs each form through the CLI, plus a spec served over
  HTTP. `recording/recording-permutations.spec.json` covers `record: true`, `.MP4`, and `stopRecord: null`.

## Pros and Cons of the Options

### A. The normalizer names, the runner places

- Good: `validate()` stays config-free, and the effective step still shows the file name.
- Good: one place applies the rule, and the report shows its result.

### B. The normalizer writes the full path

- Bad: it needs config, which `validate()` doesn't have.

### C. Each handler places the file

- Bad: two copies of the rule, and the report keeps the relative name.

### D. Keep the current folder

- Good: not breaking.
- Bad: it contradicts the path rule, and `outputDir` silently doesn't apply.
