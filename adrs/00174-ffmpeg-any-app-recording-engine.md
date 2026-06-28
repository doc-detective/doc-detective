---
status: accepted
date: 2026-06-16
decision-makers: doc-detective maintainers
---

# ffmpeg recording engine for any-app recording

## Context and Problem Statement

Doc Detective's recording was tied to a single browser-capture path (`00069`'s FFmpeg gdigrab
desktop capture cropped to the Chrome viewport), restricted to headed Chrome. That left two gaps:
recordings could not capture non-browser surfaces, and with `concurrentRunners > 1` (`00172`) several
Chrome sessions could record at once and collide over the shared display/capture region. How should
recording be generalized to capture any application, made safe under concurrency, and made
selectable per recording?

## Decision Drivers

* Recording should capture any application surface, not only a browser viewport.
* Concurrent runners must not corrupt each other's Chrome recordings.
* The recording engine should be selectable through the schema, not hard-wired.
* Existing browser-recording behavior and PASS/SKIPPED fixture coverage must be preserved.

## Considered Options

* **A. A dedicated `ffmpegRecorder` engine for any-app recording, concurrency-safe Chrome capture,
  and schema-level engine selection** (chosen).
* **B. Keep the single browser-only recorder and forbid recording under concurrency.**
* **C. Per-browser bespoke recorders (one capture implementation per engine).**

## Decision Outcome

Chosen option: **A**, because an ffmpeg-based recorder generalizes capture to arbitrary application
surfaces while a single, concurrency-aware implementation keeps Chrome recordings from colliding, and
exposing engine selection in the schema lets authors choose the recording engine explicitly.

Contract decided:

* A new `ffmpegRecorder` (`src/core/.../ffmpegRecorder.ts`) drives ffmpeg-based recording for any-app
  capture and makes concurrent Chrome capture safe.
* Engine selection is added to the schema: `record_v3` plus the `step` and `test` shapes gain
  engine-selection fields.
* Recording fixtures and their permutations are added/updated to cover the engine across the
  platforms where each permutation can succeed (PASS/SKIPPED only).

Implementation in `ffmpegRecorder.ts`; schema `record_v3` (engine selection on record/step/test).

### Consequences

* Good: any application surface can be recorded, not just a browser viewport.
* Good: recordings are safe with `concurrentRunners > 1`.
* Good: engine is an explicit, schema-visible choice.
* Neutral: ffmpeg remains the capture dependency (already bundled, `00029`/`00122`).
* Bad: a broader capture surface plus concurrency-safety adds recorder complexity and more
  permutation fixtures to maintain.

### Confirmation

Shipped in `36a83ba1` (PR #343); `ffmpegRecorder.ts`, `record_v3` engine-selection schema, and
recording fixtures + permutations gated by `runOn` (PASS/SKIPPED only) per the feature-fixture
convention.

## Pros and Cons of the Options

### A. ffmpeg any-app engine + schema selection
* Good: general capture; concurrency-safe; explicit engine choice.
* Bad: more recorder surface and more fixtures.

### B. Browser-only, no recording under concurrency
* Good: minimal change.
* Bad: can't record non-browser apps; loses recording exactly when parallelism is most useful.

### C. Per-engine bespoke recorders
* Good: each engine optimally tuned.
* Bad: duplicated capture logic; high maintenance for marginal gain.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `36a83ba1` (PR #343). Inventory
ref: BACKFILL-INVENTORY.md Seq 246. Related: `00069` (OBS→FFmpeg browser recording), `00018`
(recording formats), `00172` (concurrent runners), `00175` (autoRecord + overlapping recordings).
