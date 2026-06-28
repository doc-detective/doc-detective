---
status: accepted
date: 2022-10-04
decision-makers: doc-detective maintainers
---

# Recording overwrite guard and failed-test capture

## Context and Problem Statement

`startRecording` writes video to a fixed path, so re-running a test silently clobbered prior
output and offered no way to express "keep what is already there." Separately, when a test failed
there was no artifact to inspect after the fact — the only recordings were the explicit
`startRecording`/`stopRecording` ones authored in the test. How should the recorder handle a target
file that already exists, and how do we automatically capture a video when a test fails so authors
can debug it?

## Decision Drivers

* Re-running a spec must not destroy an existing recording unless the author opts in.
* Failing tests need a debuggable artifact without the author wiring recording steps by hand.
* Failed-test capture must be configurable (global default, env, and per-test override) and tidy —
  it should not leave videos behind for tests that passed.
* Encode quality must be predictable enough to be useful for debugging.

## Considered Options

* **A. `overwrite` option on `startRecording` plus a `saveFailedTestRecordings` capture pipeline** (chosen).
* **B. Always overwrite; never auto-capture (status quo).**
* **C. Auto-capture every test (pass or fail), pruning nothing.**

## Decision Outcome

Chosen option: **A**, because it gives the author explicit control over destructive writes while
making failure debugging the default, and it cleans up after itself so passing runs stay quiet.

Behavior decided:

1. **`overwrite` on `startRecording`** — when the target file exists, the step resolves PASS and
   skips re-recording instead of clobbering; an in-progress recording is guarded against a second
   start.
2. **Failed-test capture** — defaults `saveFailedTestRecordings` (true) and `failedTestDirectory`,
   with matching env vars and test-level overrides. The runner auto-records a baseline for every
   test, gates the save on the flag, names the artifact `<id>-<ts>.mp4`, and deletes it when the
   test passes.
3. **Encode floor** — recordings are re-encoded with an FPS floor of 30 for a usable playback rate.

### Consequences

* Good: safe re-runs; automatic failure artifacts; passing runs leave no clutter.
* Good: capture is tunable at global / env / per-test precedence.
* Bad: auto-recording every test adds runtime cost even when most pass.
* Neutral: the FPS floor re-encodes, trading a little time for consistent output.

### Confirmation

Shipped behavior in `record.js` (overwrite/in-progress guard) and `tests.js` (gating
`startRecording` on the save flag, baseline auto-record, `targetFps` re-encode). Later recording
ADRs supersede the format and naming details.

## Pros and Cons of the Options

### A. overwrite + failed-test capture
* Good: explicit destructive-write control; default failure debuggability; self-cleaning.
* Bad: per-test auto-record overhead.

### B. Always overwrite, no capture
* Good: simplest.
* Bad: data loss on re-run; no failure artifacts.

### C. Capture everything
* Good: maximal artifacts.
* Bad: large disk/time cost; noise from passing tests.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `0d0e282f`, `d3ee9eda`
(overwrite/guard) and `5dbe360d`, `d422ae14`, `c7aed407`, `5d62d84d`, `344474ad` (failed-test
capture). Inventory ref: BACKFILL-INVENTORY.md Seq 40, 42. Related: recording-format ADRs
(`00018`, `00071`) and the recording engine line (`00069`, `00174`, `00175`).
