---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Checkpoint screenshots for recording spans

## Context and Problem Statement

A recording documents a flow, but nothing tells its author when the flow's *content* has drifted since the video was captured — the steps still pass while the recording quietly goes stale. Screenshots already solve this for single frames: `saveScreenshot` compares a fresh capture against a reference with `maxVariation` and surfaces drift as a WARNING. How do we detect content drift across a whole recording *span* (the steps between `record` and `stopRecord`), with baselines that persist across runs?

## Decision Drivers

- Drift detection must compare against **persistent, committable baselines** — per-run artifacts (like `autoScreenshot`'s) can't anchor a comparison.
- Comparison noise must not fail tests: screenshots' `maxVariation` overage is a WARNING, and checkpoints must mirror that (fixtures stay PASS/SKIPPED-only).
- Baselines and the recording must stay **in sync**: a baseline that self-updates mid-span while the video stays stale would mask drift forever. All baseline writes belong to `stopRecord` (and, later, to the `overwrite: "aboveVariation"` promote decision — ADR 01073).
- Reuse the screenshot pipeline (sharp + pixelmatch + implicit assertions) rather than building a parallel comparator.
- Steps edited by an author should invalidate their own checkpoint naturally.

## Considered Options

1. **Post-step checkpoint screenshots per active recording handle, compared compare-only against baselines stored beside the recording.**
2. Extract frames from the produced video and diff those against baseline frames.
3. Reuse `autoScreenshot` as-is and leave comparison to external tooling.

## Decision Outcome

Chosen option: **1 — post-step checkpoints with compare-only semantics**, because it detects drift in the *scene the recording shows* without video-encoding noise (lossless PNG captures, so the screenshot pipeline's default tolerance applies), works headless (which video capture doesn't — the basis for headless staleness detection in ADR 01074), and reuses `saveScreenshot` end to end.

Mechanics:

- **Opt-in** via a new `checkpoints` field on the `record` object: `true` or `{ maxVariation, directory }` (default `maxVariation` 0.05, matching screenshots).
- **Capture points:** the post-step hook (beside `autoScreenshot`'s, final attempt only) captures once per active checkpoint-enabled recording handle after every step. The `record` step's own post-step capture is the opening bookend; the last capture before `stopRecord` is the closing bookend.
- **Baseline location:** `<recording path including extension>.checkpoints/` beside the recording target (e.g. `demo.mp4.checkpoints/`), so baselines travel with the video they describe and `demo.mp4` / `demo.gif` never share a directory. Overridable via `checkpoints.directory`.
- **Naming:** the same `NN-<action>-<stepRef>.png` scheme as `autoScreenshot` (shared helper). Generated stepIds are content-hash-derived, so an edited step changes its checkpoint filename — a built-in change signal.
- **Compare-only during the span:** checkpoints never write baselines mid-span. `saveScreenshot` gains an internal `compareOnly` option (not a schema field) that suppresses both baseline-write sites; fresh captures persist to a per-handle staging directory. At `stopRecord`, missing baselines are seeded from staging (first run); existing baselines are never modified by this layer.
- **Severity:** `stopRecord` reports `outputs.checkpoints` (per-checkpoint variation) and `outputs.maxCheckpointVariation`, and evaluates one WARNING-severity implicit assertion (`maxCheckpointVariation <= maxVariation`) through the shared engine — drift is a WARNING, never a FAIL, mirroring screenshot semantics.
- **Exclusions:** synthetic `autoRecord` handles are excluded (their targets live in per-run output folders, so baselines could never persist). Contexts without a browser driver skip checkpoint capture with a debug log (app-surface checkpoints are a follow-up).

### Consequences

- Good, because recording staleness becomes observable: per-step variation lands in the results JSON with persistent baselines the author can commit and review.
- Good, because the comparison is screenshot-to-screenshot — no video-codec noise, no timing jitter, works headless.
- Good, because atomic-at-stop baseline handling leaves no window where baselines and recording disagree.
- Neutral, because each step inside a span costs one extra WebDriver screenshot per checkpoint-enabled handle.
- Bad, because dynamic pages (animations, ads, clocks) produce WARNING noise; authors tune `checkpoints.maxVariation` or disable checkpoints for those spans (documented).
- Bad, because a step revisited via `goToStep` overwrites its earlier staged capture (latest visit wins — same accepted behavior as `autoScreenshot`).

### Confirmation

- Unit tests: the extracted naming helper produces byte-identical names to `autoScreenshot`'s previous output; `saveScreenshot` compareOnly leaves an existing baseline untouched above-variation, writes the capture to the staging path, and reports `baselineMissing` without writing when no baseline exists; `stopRecording` seeds missing baselines and reports `outputs.checkpoints`.
- Schema tests: positive and negative `checkpoints` cases in `src/common/test/validate.test.js`.
- Feature fixture `test/core-artifacts/recording/checkpoints.spec.json` (headed Windows/macOS): a checkpointed span against the local test server, first-run seeding asserted via captured outputs; headless legs land SKIPPED.
- Programmatic assertions in `test/core-core.test.js` for the seeding/report shape end-to-end through `runTests`.

## Pros and Cons of the Options

### 1. Post-step checkpoints, compare-only, baselines beside the recording

- Good, because lossless captures make the screenshot tolerance model directly applicable.
- Good, because it works headless and reuses the existing pipeline nearly wholesale.
- Bad, because it validates the scene, not the encoded video file itself (structural guards on the file are ADR 01075's job).

### 2. Frame extraction from the produced video

- Good, because it validates the actual artifact.
- Bad, because lossy encoding (yuv420p, gif palettes) forces looser, flakier tolerances.
- Bad, because run-to-run timing jitter makes "the frame at t=N" unstable for anything animated.
- Bad, because it can't run headless (no video is produced), killing cheap staleness detection.

### 3. autoScreenshot + external comparison

- Good, because zero new runner code.
- Bad, because per-run output folders give no baseline anchor, and "run external tooling" isn't a contract users can rely on in CI.
