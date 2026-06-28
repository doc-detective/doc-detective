---
status: accepted
date: 2022-05-17
decision-makers: doc-detective maintainers
---

# Recording action types

## Context and Problem Statement

Beyond still screenshots, documentation often needs short screen recordings of a procedure. The runner
had no way to start and stop a recording around a sequence of steps. How should recording be expressed
as actions, and how should the recorder lifecycle be managed within a test run?

## Decision Drivers

* Animated procedures (GIF/video walkthroughs) are a core documentation output.
* Start/stop need to be explicit step boundaries authors control.
* A recorder left open across tests would leak resources and corrupt output.
* Headless browser launches need a stable sandbox configuration.

## Considered Options

* **A. `startRecording`/`stopRecording` actions wired into dispatch, recorder auto-closed per test**
  (chosen).
* **B. Always record the whole run implicitly.**

## Decision Outcome

Chosen option: **A**. `startRecording` and `stopRecording` are wired into the action switch, letting
authors bracket exactly the steps they want captured. The recorder is auto-closed at the end of each
test so it cannot leak across tests, and `--no-sandbox` is made always-on for the browser launch to
keep recording reliable in restricted/headless environments. This establishes the recording-action
contract that the format (GIF/WebM/MP4), overwrite/failed-test, and engine ADRs build on.

### Consequences

* Good: authors control the exact recorded span via explicit start/stop steps.
* Good: per-test auto-close prevents recorder leakage.
* Neutral: `--no-sandbox` always-on trades some isolation for recording reliability.
* Neutral: action naming and lifecycle later evolve (`stopRecording_v2`, `startRecording` reworks,
  ffmpeg engine, `stopRecord_v3`).

### Confirmation

Shipped 2022-05-17 (`5884206`, `4dbdb1b`): `src/lib/tests.js` wires `startRecording`/`stopRecording`
into the switch, auto-closes the recorder per test, and forces `--no-sandbox`.

## Pros and Cons of the Options

### A. Explicit start/stop actions
* Good: precise control; clean lifecycle; foundation for later recording features.
* Bad: requires authors to bracket steps deliberately.

### B. Always record the whole run
* Good: zero authoring effort.
* Bad: no control over scope; wasteful; can't target specific procedures.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 5884206, 4dbdb1b. Inventory
ref: BACKFILL-INVENTORY.md Seq 20. Related: ADR 00018 (recording formats), ADR 00031 (recording
overwrite and failed-test capture), ADR 00069 (ffmpeg recording engine), ADR 00175 (autoRecord and
overlapping recordings).
