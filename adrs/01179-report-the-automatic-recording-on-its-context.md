---
status: accepted
date: 2026-11-08
decision-makers: doc-detective maintainers
---

# Report the automatic recording on its context

Amends [ADR 00175](00175-autorecord-and-overlapping-recordings.md),
[ADR 01149](01149-declare-the-report-contract.md), and
[ADR 01177](01177-capture-screenshots-and-recordings-by-default.md).

## Context and Problem Statement

`autoRecord` runs as two synthetic steps: `<testId>~autorecord` starts the recording, and
`<testId>~autorecord~stop` ends it. Both land in the context's `steps`, with the runner's own markers
(`__autoRecord`, `__autoRecordDefaulted`, `__autoRecordStop`) in the report, which `report_v3` doesn't declare.

Since recordings became the default (ADR 01177), every report carries those two steps:

- **The steps don't match the spec.** A context lists steps nobody wrote. `summary.steps` already leaves them out,
  so anything that recounts from `context.steps` disagrees with it.
- **A passing recording changes the verdict.** A context whose authored steps were all SKIPPED rolls up to PASS,
  because the recording passed.
- **Every consumer has to know the markers.** The HTML report hides the two steps by reading them, and keeps them
  listed only when the recording didn't save, so the reason shows.
- **The stored path is absolute.** The start's `record.path` and the stop's `outputs.recordingPath` hold a
  timestamped absolute path, where `autoScreenshot` holds a path relative to `runDir`.

The recording is a fact about the context, not something the test did. Where should the report say so?

## Decision Drivers

- `steps` holds what the author wrote, plus teardown stops of recordings the author started.
- A recording nobody asked for never changes a test's outcome, and one that was asked for still does (ADR 01177).
- The result reads the same for every reporter and script, with no markers to know about.
- Report paths for automatic media share one form.

## Considered Options

- **A. An `autoRecording` field on the context, built from the two synthetic steps.**
- **B. Declare the synthetic steps and their markers in the schema.**
- **C. Drop the recording from the report, and have consumers find the file on disk.**

## Decision Outcome

Chosen option: **A**. The synthetic steps still run through the step loop, so starting, stopping, and routing
behave as before. Neither reaches the report, and none of their markers do.

### The field

`contexts[].autoRecording`, `readOnly`, with `additionalProperties: false` and `required: ["result"]`:

| Field | Type | When | Notes |
|---|---|---|---|
| `result` | `PASS`, `FAIL`, `WARNING`, or `SKIPPED` | always | The start's result, merged with the stop's |
| `resultDescription` | string | when not `PASS` | The description of the result that won the merge |
| `recordingPath` | string | when a file was written | Relative to `runDir`, with forward slashes, the same way as `autoScreenshot` |
| `startedAt` | date-time | when it started | |
| `format`, `duration` (seconds), `width`, `height`, `fps` | the `stopRecord` outputs (ADR 01074) | when the probe read them | |

Once the structured failure fields (`resultCode`, `resultHint`, and `failureClass`) land on steps, they land here
too, on a non-`PASS` recording. This ADR doesn't add them.

```json
{
  "contextId": "linux-chrome",
  "result": "PASS",
  "autoRecording": {
    "result": "PASS",
    "recordingPath": "specs/install-guide/tests/install/contexts/linux-chrome/recordings/linux-chrome.mp4",
    "startedAt": "2026-11-06T02:33:29.010Z",
    "format": "mp4",
    "duration": 8.1,
    "width": 1280,
    "height": 720,
    "fps": 30
  },
  "steps": [{ "stepId": "open-docs", "goTo": "http://localhost:8092", "result": "PASS" }]
}
```

`summary.steps` counts only what's in `steps`. Its numbers don't change, since ADR 01177 already left the recording
out. `autoRecording.result` and `autoRecording.recordingPath` join the stable report contract (ADR 01149).

### DR1: where the recording's result counts

A `FAIL` or `WARNING` on `autoRecording` sets the context's result, like a step's. `PASS` and `SKIPPED` don't. So a
context whose steps are all SKIPPED stays SKIPPED, where a passing recording used to make it PASS.

The same rule decides whether the runner probes for a dead session at the end of a context. A failed automatic stop
on a dead session is still a retryable failure (`classifyContextRetry`).

### DR2: `autoRecord: true` and a start that fails

Unchanged: the start is the context's first step, so a failure stops the context. The authored steps are SKIPPED,
`autoRecording.result` is `FAIL`, and the context is `FAIL`.

### DR3: when `autoRecording` is absent

The field is absent when no automatic recording was attempted:

| Case | `autoRecording` |
|---|---|
| `autoRecord: false`, or a context with no driver steps | Absent |
| Headless Chrome with an authored `record` | Absent: the author's recording wins |
| `autoRecord` unset, and the preflight failed | Absent: no step was built, and the run's one warning covers it (ADR 01177) |
| `autoRecord: true`, and the preflight failed | `{ "result": "SKIPPED", "resultDescription": "Skipped: <reason>. To record, <fix>, and rerun." }` |
| `autoRecord` unset, and a start failed after the preflight passed | `{ "result": "SKIPPED", "resultDescription": "Skipped: couldn't start the automatic recording: <cause>. Set `autoRecord: false` to turn it off." }` |

### Merging the stop

The stop merges into the field the start wrote:

- The worse result wins, with its description: `FAIL`, then `WARNING`, then `SKIPPED`, then `PASS`. `SKIPPED` ranks
  above `PASS` because a start that passed and a stop that skipped saved no video. That's a defaulted recording
  that couldn't be saved, or a device recording that never started.
- `recordingPath` and the metadata come from the stop's outputs, when it has them. The path is made relative to
  `runDir`.
- A SKIPPED or failed start has no handle, so no stop runs. It has no `startedAt`, `recordingPath`, or metadata.
- A defaulted recording's stop never FAILs, including one that throws. It's SKIPPED:
  ``Skipped: couldn't save the automatic recording: <cause>. Set `autoRecord: false` to turn it off.``
- Teardown stops of recordings the author started stay steps, with their random step IDs.

The whole field is masked like a step report (ADR 01178), on the start and on every merge. The relative path is
computed from the real path first.

### Who reads it

- **The HTML report.** A panel at the top of the context plays `recordingPath` whenever it's set, so a WARNING
  recording plays too. When the result isn't `PASS`, the panel also shows the result's badge and description. The
  step list has no filter, since there's nothing to hide.
- **Hints.** `producedRecordings` is also true when `autoRecording.recordingPath` is set.

### Consequences

- Good: `steps` and `summary.steps` agree, for every reader that recounts.
- Good: the report validates against `report_v3` with no undeclared keys for the recording.
- Good: one form for automatic media paths. A consumer resolves them against `runDir`.
- Bad: a breaking change for anything that found the recording through `~autorecord`, `__autoRecord`, or a step's
  `record.path`. The upgrade guide lists it.
- Bad: an all-SKIPPED context that passed its recording now counts as SKIPPED in `summary.contexts`. Its test and
  spec roll up the same way, so a run can reach exit code 2 where it used to pass.
- Neutral: terminal, JUnit, and Markdown don't name `autoRecording` yet. A failed recording still fails their
  context, but they don't print its description.

### Confirmation

- `test/run-artifacts.test.js`:
  - The roll-up rules and the dead-session probe's input.
  - The stop's merge on the success and throw paths, for strict and defaulted handles. That covers the worse result
    and its description, the relative path, and masking.
  - An authored recording's stop stays a step.
  - The start through `runContext`. A strict start that fails stops the context with authored steps SKIPPED. A failed
    preflight is SKIPPED with its fix. The description is masked.
- `test/core-core.test.js`: a real headless Chrome run has `autoRecording` with its MP4 under `runDir`, no synthetic
  step or marker anywhere in the report, and `summary.steps` equal to the authored steps. An all-SKIPPED context
  stays SKIPPED.
- `test/htmlReporter.test.js`: the panel for a saved, a warned, and an unsaved recording.
- `test/hints.test.js`: `producedRecordings` from `autoRecording`.
- `src/common/test/validate.test.js`: a context with `autoRecording` validates, and an unknown key inside it fails.
- Fixtures: `cli/auto-capture-defaults.spec.json`, including `autoRecord: true` with a failed start and with a failed
  preflight.

## Pros and Cons of the Options

### A. An `autoRecording` field on the context

- Good: the recording sits at the level it describes, and consumers read one field.
- Good: the synthetic steps stay an implementation detail, so the runner's start, stop, and routing don't change.
- Bad: one more place to look for a context's verdict.

### B. Declare the synthetic steps and their markers

- Good: no change for consumers that already read the steps.
- Bad: every consumer keeps filtering, and each one that forgets misreads the run. `steps` still doesn't match the
  spec.

### C. Drop the recording from the report

- Good: the smallest report.
- Bad: a failed recording has nowhere to say why, and a `true` that couldn't record looks like a run that never
  tried.
