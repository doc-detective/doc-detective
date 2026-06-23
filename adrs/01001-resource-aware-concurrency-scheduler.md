---
status: accepted
date: 2026-06-22
decision-makers: doc-detective maintainers
---

# Resource-aware concurrency scheduler (serialize only shared-display recordings)

## Context and Problem Statement

ffmpeg screen capture records the whole physical display, so two ffmpeg recordings on the same
display clobber each other. To stay safe, the runner detected any shared-display ffmpeg recording
in a run (`jobIsFfmpegRecording` + `computeEffectiveConcurrency`) and **collapsed the global
worker-pool `limit` to 1** (`forcedSerial`) — running the *entire* run serially. That means one
recording spec forces every unrelated job (HTTP checks, shell steps, non-recording browser tests)
to run one at a time, even at `concurrentRunners: 4`. It also forced the project's own core test
suite to be split into a separate serial pass (PR #379) just to exercise concurrency cross-OS.

How do we keep recordings safe on a shared display without giving up parallelism for everything
else, including when dynamic routing makes a job's executed steps non-static?

## Decision Drivers

* Only the jobs that actually need an exclusive resource should serialize; the rest stay parallel.
* `concurrentRunners: 1` (default) and any no-recording run must be byte-identical to before.
* Detection must be safe under dynamic routing (`goToStep` / `goToTest` / guard `if` / step
  handlers): a recording reachable on *some* path must never be under-serialized.
* No breaking changes to public schemas; minimal change to the existing recording/Xvfb wiring.

## Considered Options

* **A. Named-resource mutex + per-job exclusivity tag** (chosen).
* **B. Status quo** — keep collapsing the whole run to serial when any recording is present.
* **C. Per-context Xvfb everywhere** — give every recording its own virtual display on all OSes.

## Decision Outcome

Chosen option: **A**, because it serializes exactly the conflicting work (shared-display
recordings) while everything else runs up to `limit`, keeps the default path unchanged, and is a
small, composable mechanism. B wastes the user's requested parallelism. C is infeasible off Linux
(no Xvfb on Windows/macOS runners) and far heavier than the problem needs.

Mechanism:

1. **Resource registry + resource-aware pool** (`src/core/utils.ts`): `createResourceRegistry`
   tracks held, named resources; `runResourceAware` runs up to `limit` items at once but never
   runs two items sharing a resource concurrently (all-or-nothing acquire → no hold-and-wait → no
   deadlock; a parked worker is always woken by an in-flight item's release → no starvation). Items
   with no resources never block, so an all-empty run equals `runConcurrent`.
2. **Exclusivity tag** (`src/core/tests/ffmpegRecorder.ts` + `jobDisplayResources` in
   `src/core/tests.ts`): `jobExclusiveResources` returns `["display"]` for a shared-display ffmpeg
   recording — `[]` when there is no recording, on Linux+Xvfb (isolated displays), or under the
   autoRecord overlap opt-in (mirroring the three `computeEffectiveConcurrency` "keep the limit"
   branches). Crucially, a recording can't run alongside ANY other driver/browser context either —
   ffmpeg captures the whole display (so other windows pollute the capture) and starves concurrent
   browsers on a shared display. So once the run contains a shared-display recording,
   `jobDisplayResources` also tags every other **driver** context `["display"]`; non-driver jobs
   (HTTP/shell) take nothing and stay parallel. On Linux+Xvfb no recording is display-tagged, so
   nothing is promoted and driver work runs fully parallel.
3. **Routing over-approximation** (`isFfmpegRecordingForScheduling`): for a context with step-level
   routing, detection ignores the `stopRecord` LIFO that routing might skip and flags the context
   display-exclusive if *any* record could run as ffmpeg. Non-routed contexts keep the precise
   `jobIsFfmpegRecording`. Over-serializing a routed-might-record context is slower but never
   unsafe.
4. **Wiring** (`src/core/tests.ts`): at `limit > 1`, tag each flat and routed-sequencer job and run
   both pools through `runResourceAware` against ONE per-run registry (so a flat-pool recording and
   a routed recording never overlap). The `limit` is no longer collapsed for recordings;
   `computeEffectiveConcurrency` still drives Xvfb isolation and the overlap warning. At
   `limit === 1` the pools stay on the byte-identical `runConcurrent` path.

## Consequences

* **Good** — a run with recordings now parallelizes all non-driver work (HTTP/shell/assertions);
  on Linux+Xvfb driver work is fully parallel too. The PR #379 manual serial split collapses back
  into a single concurrent core-core pass.
* **Trade-off / future work** — on a shared display (Windows/macOS) every driver context serializes
  on `"display"` while a recording is present, even two non-recording browser contexts that could
  safely overlap in a gap between recordings. A reader/writer lock (recording = writer, browser =
  reader) would recover that browser-vs-browser parallelism; deferred to keep the first cut simple
  and starvation-free.
* **Good / call-out** — Appium-pool sizing and the warm-up pre-pass now use the un-collapsed
  `limit` for recording runs (they were skipped when recording forced `limit = 1`). Warm-up is
  serial and idempotent, so this is safe; it is the intended parallelism.
* **Report/hints** — the runner now sets `report.recordingSerialized` (replacing the
  `recordingForcedSerial` flag, which no longer fires since recordings don't force whole-run
  serial). The `recordConcurrently` hint fires on the new signal with updated copy.
* **Neutral** — a routed context that *could but won't* record is serialized on the display
  (coarse over-approximation; tighter reachability analysis is deferred).
* **Out of scope** — author-declarable resources and intra-spec setup ordering (e.g. a spec that
  starts a shared server its later steps depend on); those stay a test-authoring concern.

## Confirmation

* Unit: `test/concurrency.test.js` (registry mutual-exclusion, `runResourceAware` serializes
  same-resource jobs while disjoint/empty jobs stay parallel, deadlock-free, order-independent,
  rejecting job frees its resource) and `test/ffmpeg-recorder.test.js` (`jobExclusiveResources`
  tags only shared-display ffmpeg; over-approximation flags a routed context whose separating
  `stopRecord` could be skipped; agrees with `computeEffectiveConcurrency`).
* End-to-end: the existing `recording` / `recording-permutations` / `autorecord` fixtures now run
  inside the single `concurrentRunners: 2` core-core pass (`test/core-core.test.js`), which asserts
  the run was not forced whole-run serial and that no spec FAILs across the 6-job CI matrix
  (macOS / Linux / Windows × node 22/24).
