---
status: accepted
date: 2026-11-26
decision-makers: [hawkeyexl]
---

# `cucumber` reporter: Cucumber JSON as a pure transform of the results object

## Context and Problem Statement

Teams that track tests in a test-management tool, such as Xray for Jira or Allure, import runs as
Cucumber JSON. Doc Detective's `junit` reporter covers CI test-summary widgets. Xray's
Cucumber import and Allure's Cucumber adapter, though, don't read JUnit with step-level detail. Those teams
had to hand-roll a converter from the `json` reporter's output.

How should Doc Detective emit Cucumber JSON, and how should its results map onto Cucumber's model?

## Decision Drivers

* The results object the `json` reporter serializes already carries every field the format needs,
  as it did for `junit` and `markdown` (ADR 01092).
* A CI artifact declaration names a path, so the file name has to be fixed.
* Cucumber has four outcome states Doc Detective uses: `passed`, `failed`, `skipped`, and
  `undefined`. It has no warning state.
* A warning must not fail a run in the importing tool, as with `junit`.
* No new dependency for a JSON transform.

## Considered Options

* A. A pure builder over the results object, written by `writeReport`, like `junit`.
* B. Depend on a Cucumber formatter package and feed it messages.
* C. Leave it to users to convert the `json` reporter's output.

## Decision Outcome

Chosen option: **A**, because it reuses the `junit` reporter's plumbing (`reportOutputDir`,
`existingFile`, `writeReport`) and adds no dependency.

`buildCucumberJson(results)` returns an array of features. `cucumberReporter` writes it as
`cucumber.json`.

### Mapping

| Doc Detective | Cucumber JSON |
|---|---|
| spec | feature. `uri` is the spec's `contentPath`, or its `specId` when there's none. `id` is the `specId`. `name` is the description, or the `specId`. `keyword` is `"Feature"`. |
| test × context | element. `type` is `"scenario"`, `keyword` is `"Scenario"`. `name` is `"<test description or testId> (<browser>/<platform>)"`, with a missing part left out. `id` is `"<testId>;<contextId>"`. |
| step | step. `keyword` is `"* "`. `name` is the step's description, or else its action and main value (`goTo: https://example.com`), or else its `stepId`. |

IDs and names fall back to position labels (`spec 2`, `context 1`) when absent, as in the other
reporters. Holes in the report's lists are skipped.

### Status mapping

| Doc Detective | Cucumber |
|---|---|
| `PASS` | `passed` |
| `FAIL` | `failed` |
| `SKIPPED` | `skipped` |
| `WARNING` | `passed`, with the warning text in the step's `output` array |

WARNING maps to `passed` for the reason JUnit's does: Cucumber has no warning state, and the
nearest other states are wrong. `failed` would turn an Xray test execution red for a screenshot
that varied by 3%. `undefined` and `pending` mean "not implemented" to every Cucumber consumer.
`output` is the field Cucumber reserves for text a step logs, and Allure and Xray show it.

On `FAIL` or `WARNING`, `result.error_message` is the step's `resultDescription`, then its
`resultHint` on a new line when present.

### Durations

`result.duration` is in **nanoseconds**, as the Cucumber JSON format defines it, converted from the
step's `durationMs`. A missing or negative duration is `0`.

### Embeddings

* A step's screenshot, `autoScreenshotPath` or `outputs.screenshotPath`, found as `nonPassItems`
  finds it, is `{ "mime_type": "image/png", "data": "<base64>" }` in that step's `embeddings`. A
  file that isn't on disk is skipped silently. The image is inlined because importers don't
  resolve paths beside the report.
* The context's `autoRecording.recordingPath`, when the file exists, is a `text/plain` embedding
  holding the absolute path, on the scenario's last step. Videos are too large to inline.

### File and failures

The file is `cucumber.json` in `outputDir`, or beside `output` when it names a file, resolved by
`reportOutputDir` as for `junit.xml`. It's overwritten on each run. A write failure logs
``Couldn't write the Cucumber report to <absolute path>: <cause in words>.`` through `writeReport`,
and the exit code doesn't change, as for `junit`.

### Consequences

* Good, because Xray, Allure, and other Cucumber JSON consumers can import a Doc Detective run.
* Good, because no dependency, and the code is one small builder.
* Bad, because inlined screenshots make a large file on a screenshot-heavy run. An opt-out waits
  until someone hits that.
* Neutral, because steps carry no Gherkin keywords. `* ` is Cucumber's own keyword for a step with
  no Given/When/Then role.

### Confirmation

* `test/cucumberReporter.test.js` covers each status, nanosecond durations, warning output, and
  error messages. It also covers the screenshot embedding and a missing file, the recording
  embedding, both output-path forms, and the write-failure message.
* `test/core-artifacts/reporters/reporters.spec.json` runs the CLI with `--reporters cucumber` and
  checks that `cucumber.json` exists, parses, and carries the expected statuses.

## Pros and Cons of the Options

### A. Pure builder over the results object

* Good, because it shares path resolution, the write path, and the never-throw contract with `junit`.
* Good, because it's unit-testable without the runner.
* Bad, because the format's shape is checked by hand in tests rather than by a reference library.

### B. A Cucumber formatter package

* Good, because a reference implementation owns the format.
* Bad, because those packages consume Cucumber messages from a Cucumber runtime. Doc Detective
  would have to synthesize a message stream to get a JSON file.
* Bad, because it adds a dependency to the CLI install.

### C. Leave it to users

* Good, because no code.
* Bad, because every team writes the same converter, and each gets the status and duration units
  subtly wrong.
