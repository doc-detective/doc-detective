---
status: accepted
date: 2026-06-17
decision-makers: doc-detective maintainers
---

# autoRecord and overlapping (LIFO) recordings

## Context and Problem Statement

Recording a documented procedure required bracketing it with explicit `startRecording`/`stopRecording`
steps, and the runner assumed a single active recording at a time — there was no `stopRecording`
form that could close the *innermost* of several recordings. With the ffmpeg any-app engine
(`00174`) able to capture multiple surfaces, authors wanted recording to start automatically and to
support nested/overlapping captures (e.g. a whole-run recording with a finer recording inside it).
How should automatic recording and overlapping recordings be modeled?

## Decision Drivers

* Recording should be capturable automatically, opt-in at config/spec/test/step level.
* Multiple recordings may overlap; stopping must close the most recently started one.
* The stop contract must distinguish "stop the innermost recording" from the existing stop shapes.
* Existing single-recording behavior and PASS/SKIPPED fixtures must keep working.

## Considered Options

* **A. An `autoRecord` setting plus LIFO overlapping recordings governed by a new `stopRecord_v3`
  schema** (chosen).
* **B. Keep one active recording; reject overlapping starts.**
* **C. Allow overlap but require each stop to name its recording explicitly (no implicit LIFO).**

## Decision Outcome

Chosen option: **A**, because `autoRecord` removes start/stop boilerplate and LIFO (last-in,
first-out) is the natural, unambiguous rule for nested captures: stopping always closes the most
recently started recording, matching how authors nest a fine-grained recording inside a coarser one.

Contract decided:

* `autoRecord` config field (with spec/test/step-level overrides) starts recording automatically.
* Multiple recordings may be active simultaneously; they are tracked as a stack and closed LIFO.
* A new `stopRecord_v3` schema defines the stop step that closes the innermost active recording;
  config/record/spec/test/step schemas gain the corresponding additions.

Implementation in `ffmpegRecorder.ts` (recording stack); schema `stopRecord_v3`.

### Consequences

* Good: zero-boilerplate recording via `autoRecord`; nested/overlapping captures are expressible.
* Good: LIFO makes stop semantics deterministic without naming each recording.
* Neutral: builds directly on the ffmpeg any-app engine (`00174`).
* Bad: an active recording stack adds lifecycle state the single-recording model didn't have.

### Confirmation

Shipped in `189d1979` (PR #349); `stopRecord_v3` schema, recording-stack handling in `ffmpegRecorder.ts`,
and config/record/spec/test/step schema additions, with recording fixtures (PASS/SKIPPED only).

## Pros and Cons of the Options

### A. autoRecord + LIFO overlapping recordings
* Good: automatic recording; deterministic nested-stop semantics.
* Bad: introduces recording-stack lifecycle state.

### B. Single recording, reject overlap
* Good: simplest model.
* Bad: can't express nested captures; no automatic recording.

### C. Overlap with explicit named stops
* Good: fully explicit.
* Bad: more verbose; reintroduces the boilerplate `autoRecord` set out to remove.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `189d1979` (PR #349). Inventory
ref: BACKFILL-INVENTORY.md Seq 248. Related: `00174` (ffmpeg any-app recording engine), `00016`
(recording action types), `00068` (standalone stopRecording), `00173` (autoScreenshot, the screenshot
analogue).
