---
status: accepted
date: 2026-11-19
decision-makers: hawkeyexl
---

# Compare each run with the previous one

## Context and Problem Statement

A failing run tells a reader what's broken, but not what broke *now*. On a docs repository with a
handful of long-standing failures, a pull request that adds one more failure looks the same as one
that adds none. Users have asked for this from both ends. The GitHub Action wants to tell a new
failure from an inherited one (github-action#98), and doc-detective#960 asks for the same in the
CLI. The v5 rollout plan names it as item 5.4, "compare runs through the existing run folder", and
the Action's v2.3 plan builds on it.

Every run already archives its results as `<outputDir>/.doc-detective/runs/<runId>/testResults.json`
(the `runFolder` reporter), and the IDs in those results are stable: spec and test IDs are authored
or derived from content, and context IDs derive from platform and browser (`deriveContextId`). So
the history needed for a comparison is already on disk. How should a run use it?

## Decision Drivers

* A reader should see "new" vs. "already failing" without configuring anything.
* The comparison must never change the run's exit code. A later decision can add a gate.
* Matching must be predictable. A wrong "fixed" or "existing" is worse than none.
* No new storage, service, or history format to maintain.
* An explicit request that can't be met should say so. The silent default shouldn't nag.

## Considered Options

* **Opt-in vs. on by default.**
* **Match on exact IDs vs. on location or fuzzy similarity.**
* **A separate `compare` subcommand vs. comparing at run time.**
* **Store a history file vs. read the existing run folders.**

## Decision Outcome

Chosen: **compare at run time, on by default, against the existing run folders, matching exact
IDs.**

### Configuration

A new config key, `compareTo`, and two run flags:

| Value | Effect |
| --- | --- |
| unset | Same as `previous`, but a missing or unusable earlier run is logged at `debug` only. |
| `"previous"` | The newest other run folder under `<outputDir>/.doc-detective/runs/` that holds `testResults.json`. Folder names are sortable run IDs; the current run is excluded. |
| a path | A results JSON file, or a folder holding `testResults.json`. Relative paths resolve per the source that set them (ADR 01192); `--compare-to` resolves from the working directory. |
| `false` | No comparison. |

The schema has no `default` keyword for `compareTo`, because Ajv runs with `useDefaults` and
the runtime has to tell an explicit setting from the default. `true` and blank strings are invalid.

`--compare-to <path>` and `--no-compare-to` set it from the command line. They're run flags only.
Usage errors, exit 2:

* `--compare-to ""` → ``Error: `--compare-to` needs a path or `previous`.``
* both flags → ``Error: set `--compare-to` or `--no-compare-to`, not both.``
* `--dry-run --compare-to x` → ``Error: set `--dry-run` or `--compare-to`, not both.`` A dry run
  has no results to compare. The implicit default doesn't conflict.

### Identity

The unit is one test in one context, keyed by spec ID › test ID › context ID, matched exactly.

* A context counts as failed when its result is `FAIL`. A test that a `goToTest` route ran more
  than once has several entries with one test ID; the key failed if any visit's context failed.
* `FAIL` contexts get `failureStatus: "new"` or `"existing"`. A `PASS` context whose key failed in
  the earlier run, and didn't fail in any visit this run, gets `"fixed"`. `WARNING` and `SKIPPED`
  contexts get nothing.
* An earlier failure whose key is absent from this run is neither fixed nor counted.
* Consequence: a test without an authored `testId` gets an ID derived from its content, so editing
  it makes its failure read as new. Set `testId` (and `specId`) on tests whose history matters.

### Earlier results that can't be used

Checked in order. Each is a warning on stderr when `compareTo` was set explicitly (flag,
`DOC_DETECTIVE_CONFIG`, or a config file) and a `debug` line when it's the implicit default. None
changes the exit code, and the report gets no `comparison`.

* ``Couldn't compare with an earlier run: `<path>` doesn't exist.``
* ``Couldn't compare with an earlier run: no earlier run in `<outputDir>/.doc-detective/runs`.``
* ``Couldn't compare with an earlier run: `<path>` has no `testResults.json`.``
* ``Couldn't compare with an earlier run: `<path>` isn't valid JSON.``
* ``Couldn't compare with an earlier run: `<path>` has no `specs` list, so it isn't Doc Detective results.``
* ``Couldn't compare with an earlier run: `<path>` is from Doc Detective <version | an unknown version>, and test IDs match only within version <major>.``

The same-major gate exists because ID derivation may change across majors. A results file from an
older major, or one without `environment.docDetectiveVersion`, isn't compared rather than compared
wrongly. On success, an `info` line on stderr: ``Compared with run `<runId>`: <n> new, <n> already
failing, <n> fixed.`` stdout keeps carrying results only (ADR 01146).

### Output

Only when a comparison happened, declared in `report_v3` (ADR 01186):

```json
{
  "comparison": {
    "previous": { "runId": "…", "startedAt": "…", "docDetectiveVersion": "5.x.y", "path": "/abs/testResults.json" },
    "summary": { "new": 1, "existing": 2, "fixed": 0 }
  },
  "specs": [{ "tests": [{ "contexts": [{ "result": "FAIL", "failureStatus": "new" }] }] }]
}
```

The comparison runs in the core, after the report is final and before any reporter reads it, so
the JSON results, the run folder, and the JavaScript API's `runTests()` all carry it. It reads
`config.compareTo` only. A run whose filters matched nothing has no run ID and isn't compared.

A later ADR adds `failOn`, which can gate the exit code on new failures. This one deliberately
doesn't.

### Consequences

* Good: a reader sees new vs. inherited failures with no setup, locally and in CI with a cached
  output folder.
* Good: no new storage. The run folder is the history.
* Bad: a test without a stable `testId` reads as new after an edit.
* Bad: on by default, so every run reads the newest earlier run folder. That's one directory
  listing and one JSON parse.

### Confirmation

* `test/compareRuns.test.js` covers the identity rules, visits, sparse contexts, the folder pick,
  every warning, and the explicit-vs-implicit log level.
* `src/common/test/validate.test.js` covers `compareTo`, `comparison`, and `failureStatus`.
* `test/utils.test.js`, `test/config-precedence.test.js`, and `test/cli-contract.test.js` cover the
  flags, the path rule, and the usage errors.
* `test/core-artifacts/cli/compare-runs.spec.json` runs every permutation through the real CLI.

## Pros and Cons of the Options

### Opt-in vs. on by default

* Opt-in: no surprise output. But the users who'd benefit most never find it, and the Action would
  have to turn it on for everyone anyway.
* On by default (chosen): useful at once. The implicit default stays quiet when there's nothing to
  compare, so a first run looks exactly as before.

### Exact IDs vs. location or fuzzy matching

* Location (file and line): breaks on any edit above the test.
* Fuzzy similarity: guesses, and a wrong guess hides a new failure as "existing".
* Exact IDs (chosen): predictable, and authors can make it robust with `testId`.

### A `compare` subcommand vs. run time

* Subcommand: flexible, but a second step every CI pipeline has to add, and the results a reader
  sees first carry no comparison.
* Run time (chosen): every output carries it. Comparing two arbitrary files stays possible by
  pointing `compareTo` at one.

### A history store vs. the run folders

* History store: a new format, retention policy, and corruption cases.
* Run folders (chosen): already written, already cached by CI setups that keep `outputDir`.
