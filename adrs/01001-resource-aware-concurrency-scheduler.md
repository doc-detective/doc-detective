---
status: accepted
date: 2026-06-22
decision-makers: doc-detective maintainers
---

# Resource-aware concurrency scheduler (serialize only shared-display recordings)

## Context and Problem Statement

ffmpeg screen capture records the whole physical display, so two ffmpeg recordings on the same
display clobber each other. To stay safe, the runner detected any shared-display ffmpeg recording
in a run, through `jobIsFfmpegRecording` and `computeEffectiveConcurrency`. It then **collapsed the
global worker-pool `limit` to 1** (`forcedSerial`), running the *entire* run serially. So one
recording spec forces every unrelated job to run one at a time, even at `concurrentRunners: 4`.
That covers HTTP checks, shell steps, and non-recording browser tests. It also forced the project's
own core test suite into a separate serial pass (PR #379), just to exercise concurrency cross-OS.

How do we keep recordings safe on a shared display without giving up parallelism for everything
else? That includes when dynamic routing makes a job's executed steps non-static.

## Decision Drivers

* Only the jobs that actually need an exclusive resource should serialize; the rest stay parallel.
* `concurrentRunners: 1` (default) and any no-recording run must be byte-identical to before.
* Detection must be safe under dynamic routing (`goToStep` / `goToTest` / guard `if` / step
  handlers): a recording reachable on *some* path must never be under-serialized.
* No breaking changes to public schemas; minimal change to the existing recording/Xvfb wiring.

## Considered Options

* **A. Named-resource mutex + per-job exclusivity tag** (chosen).
* **B. Status quo.** Keep collapsing the whole run to serial when any recording is present.
* **C. Per-context Xvfb everywhere.** Give every recording its own virtual display on all OSes.

## Decision Outcome

Chosen option: **A**. It serializes exactly the conflicting work, shared-display
recordings, while everything else runs up to `limit`. It keeps the default path unchanged, and is a
small, composable mechanism. B wastes the user's requested parallelism. C is infeasible off Linux
(no Xvfb on Windows/macOS runners) and far heavier than the problem needs.

Mechanism:

1. **Resource registry and resource-aware pool** (`src/core/utils.ts`). `createResourceRegistry`
   tracks held, named resources. `runResourceAware` runs up to `limit` items at once, but never
   runs two items sharing a resource concurrently. Acquire is all-or-nothing, so there's no
   hold-and-wait and no deadlock. A parked worker is always woken by an in-flight item's release, so
   there's no starvation. Items with no resources never block, so an all-empty run equals
   `runConcurrent`.
2. **Exclusivity tag** (`src/core/tests/ffmpegRecorder.ts` plus `jobDisplayResources` in
   `src/core/tests.ts`). `jobExclusiveResources` returns `["display"]` for a shared-display ffmpeg
   recording. It returns `[]` when there is no recording, on Linux with Xvfb isolated displays, or
   under the autoRecord overlap opt-in. Crucially, a recording can't run alongside ANY other driver
   or browser context either. ffmpeg captures the whole display, so other windows pollute the
   capture. Concurrent recording and driver contexts also clobber each other's driver sessions
   (`invalid session id`), even on Linux with per-context Xvfb displays. So recordings serialize on
   EVERY platform. Once a run contains a recording, `jobDisplayResources` also tags every other
   **driver** context `["display"]`. Non-driver jobs, meaning HTTP and shell, take nothing and stay
   parallel. The Xvfb displays are still provisioned so headless Linux contexts can record at all;
   they just no longer imply parallel recordings.
3. **Routing over-approximation** (`isFfmpegRecordingForScheduling`). For a context with step-level
   routing, detection ignores the `stopRecord` LIFO that routing might skip. It flags the context
   display-exclusive if *any* record could run as ffmpeg. Non-routed contexts keep the precise
   `jobIsFfmpegRecording`. Over-serializing a routed-might-record context is slower, but never
   unsafe.
4. **Wiring** (`src/core/tests.ts`). At `limit > 1`, tag each flat and routed-sequencer job. Run
   both pools through `runResourceAware` against ONE per-run registry, so a flat-pool recording and
   a routed recording never overlap. The `limit` is no longer collapsed for recordings;
   `computeEffectiveConcurrency` still drives Xvfb isolation and the overlap warning. At
   `limit === 1` the pools stay on the byte-identical `runConcurrent` path.

## Consequences

* **Good:** a run with NO recordings, the common case, runs fully parallel on every platform. A
  run WITH recordings still parallelizes all non-driver work: HTTP, shell, and assertions. The PR
  #379 manual serial split collapses back into a single concurrent core-core pass.
* **Trade-off, and future work.** While a recording is present, every driver context serializes on
  `"display"`, on all platforms. That includes two non-recording browser contexts that could safely
  overlap in a gap between recordings. A reader/writer lock, where recording is the writer and
  browser the reader, would recover that browser-vs-browser parallelism. It's deferred to keep the
  first cut simple and starvation-free. Concurrent recordings crash driver sessions on the CI
  runner, even on isolated Xvfb displays, so that path is not pursued.
* **Good, and a call-out.** Appium-pool sizing and the warm-up pre-pass now use the un-collapsed
  `limit` for recording runs. They were skipped when recording forced `limit = 1`. Warm-up is
  serial and idempotent, so this is safe, and it is the intended parallelism.
* **Report and hints.** The runner now sets `report.recordingSerialized`. That replaces the
  `recordingForcedSerial` flag, which no longer fires, since recordings don't force whole-run
  serial. The `recordConcurrently` hint fires on the new signal, with updated copy.
* **Neutral:** a routed context that *could but won't* record is serialized on the display. That's a
  coarse over-approximation, and tighter reachability analysis is deferred.
* **Out of scope:** author-declarable resources and intra-spec setup ordering, such as a spec that
  starts a shared server its later steps depend on. Those stay a test-authoring concern.

## Confirmation

* Unit: `test/concurrency.test.js` covers registry mutual-exclusion. `runResourceAware` serializes
  same-resource jobs, while disjoint and empty jobs stay parallel. It's deadlock-free and
  order-independent, and a rejecting job frees its resource. `test/ffmpeg-recorder.test.js` covers
  `jobExclusiveResources`, which tags only shared-display ffmpeg. Over-approximation flags a routed
  context whose separating `stopRecord` could be skipped, and it agrees with
  `computeEffectiveConcurrency`.
* End-to-end: the existing `recording`, `recording-permutations`, and `autorecord` fixtures now run
  inside the single `concurrentRunners: 2` core-core pass (`test/core-core.test.js`). That asserts
  the run was not forced whole-run serial. It also asserts no spec FAILs across the 6-job CI matrix
  (macOS / Linux / Windows × node 22/24).
