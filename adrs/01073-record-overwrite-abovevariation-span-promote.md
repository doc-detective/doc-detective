---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# record overwrite "aboveVariation" with span-level promote

## Context and Problem Statement

Checkpoints (ADR 01072) detect when a recording span's content has drifted, but the recording itself still goes stale: `overwrite: "true"` re-records unconditionally (thrashing the file and its mtime/history on every run), and `overwrite: "false"` never refreshes. Screenshots already solve this dilemma with `overwrite: "aboveVariation"` — replace the artifact only when it meaningfully changed. How does that semantic generalize from one image to a recording *span*?

## Decision Drivers

- Reuse the existing `overwrite` vocabulary — authors already know `"aboveVariation"` from screenshots.
- The recording and its checkpoint baselines must update **together or not at all**; independent updates would leave baselines describing a video they don't match, masking drift forever.
- Both capture engines already record to a temp file and only materialize the target during `stopRecord`'s transcode — a natural promote-or-discard decision point.
- The verdict must catch every change class: pixel drift, added steps, removed steps, renamed/edited steps, and a missing target file.
- A change is not a failure — refreshing the recording is the *desired* behavior, so the verdict must not affect pass/fail status.

## Considered Options

1. **Always capture to staging; compute a span verdict from checkpoint results at stopRecord; promote video + baselines atomically on CHANGED, discard staging on UNCHANGED.**
2. Compare the produced video against the previous video (frame diff / SSIM) to decide.
3. Re-record only when a prior run flagged drift (two-run protocol).

## Decision Outcome

Chosen option: **1 — span verdict from checkpoints with best-effort-atomic promote**, because the checkpoints are already a per-step change detector with exactly the right sensitivity, the capture-to-staging flow already exists, and a single-run decision keeps the author workflow to "run the test."

Mechanics:

- `record_v3`'s `overwrite` enum gains `"aboveVariation"`. It implies checkpoints (resolved with defaults when the `checkpoints` field is unset; the field can still tune `maxVariation`/`directory`).
- The recording always starts (no skip-at-start for an existing target, unlike `"false"`), captures normally, and **transcodes to a staging file in the target's directory** (same volume, so promotion is a rename).
- **Span verdict** (pure helper, unit-tested): CHANGED iff any checkpoint `variation > maxVariation`, any checkpoint has no baseline (new/renamed step), any orphaned baseline exists on disk with no matching checkpoint (removed/renamed step), any checkpoint errored (incomparable ⇒ can't prove unchanged), or the target file is missing.
- **CHANGED** ⇒ promote in order: (1) replace the video (rm-then-rename — Windows can't rename over an existing file), (2) write every checkpoint baseline via copy-to-temp-then-rename, (3) delete orphaned baselines. `outputs.changed = true`, `outputs.changeReasons` lists why (phrased so a renamed step's paired missing+orphan reads as one edit).
- **UNCHANGED** ⇒ delete the staging video, leave target and baselines byte-untouched. `outputs.changed = false`.
- The verdict never affects step status. Drift still surfaces as the WARNING from ADR 01072's checkpoint assertions; with `"aboveVariation"` that WARNING reads as "the recording was refreshed."

True multi-file atomicity is impossible without a transactional filesystem; the ordering (video first, then baselines) means a mid-sequence crash leaves a fresh video with stale baselines, which the *next* run detects as CHANGED and repairs — self-healing in the safe direction. A crash before promote leaves everything untouched.

### Consequences

- Good, because recordings refresh themselves exactly when their content changes, and stay byte-stable otherwise (clean diffs, stable mtimes, no re-upload churn).
- Good, because the recording and its baselines can never permanently disagree — any inconsistency window resolves CHANGED on the next run.
- Good, because the whole feature is one enum value on an existing field.
- Neutral, because the span always records even when the outcome is discard — the capture cost is paid regardless (unavoidable: the verdict needs the run's checkpoints, which need the run).
- Bad, because dynamic pages can flap CHANGED/UNCHANGED across runs; mitigation is `checkpoints.maxVariation` tuning, as with plain checkpoints.

### Confirmation

- Unit tests for the pure verdict helper (each CHANGED trigger + UNCHANGED) and for the promote helper against scratch directories (ordering, orphan deletion, Windows rename-over-existing).
- `stopRecording` integration tests with staged handles: UNCHANGED discards staging and leaves the target/baselines untouched; CHANGED promotes video and baselines and deletes orphans.
- Feature fixture permutation in `test/core-artifacts/recording/` (headed Windows/macOS): an `aboveVariation` span asserting `outputs.changed` and the target's existence via captured outputs, rerun-safe like the checkpoints fixture.

## Pros and Cons of the Options

### 1. Span verdict from checkpoints + atomic promote

- Good, because it reuses the checkpoint machinery end to end and decides in a single run.
- Bad, because the verdict inherits checkpoint blind spots (content between steps, e.g. transient animations, isn't compared).

### 2. Video-to-video comparison

- Bad, because codec noise and run-to-run timing jitter make frame-aligned comparison flaky (see ADR 01072's rejection of frame extraction).
- Bad, because it can't run headless (no video to compare) and doubles decode cost.

### 3. Two-run protocol (flag, then re-record)

- Bad, because refreshing requires two runs and shared state between them; CI would need to persist and interpret the flag.
- Good, because the second run could skip capture when unchanged — but recording capture is not the dominant cost, and the complexity lands on every author.
