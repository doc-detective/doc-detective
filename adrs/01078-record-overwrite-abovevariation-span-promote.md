---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# record overwrite "aboveVariation" with span-level promote

## Context and Problem Statement

Checkpoints (ADR 01072) detect when a recording span's content has drifted, but the recording itself still goes stale. `overwrite: "true"` re-records unconditionally, thrashing the file and its mtime and history on every run. And `overwrite: "false"` never refreshes. Screenshots already solve this dilemma with `overwrite: "aboveVariation"`, which replaces the artifact only when it meaningfully changed. How does that semantic generalize from one image to a recording *span*?

## Decision Drivers

- Reuse the existing `overwrite` vocabulary. Authors already know `"aboveVariation"` from screenshots.
- The recording and its checkpoint baselines must update **together or not at all**. Independent updates would leave baselines describing a video they don't match, masking drift forever.
- Both capture engines already record to a temp file, and only materialize the target during `stopRecord`'s transcode. That's a natural promote-or-discard decision point.
- The verdict must catch every change class. Those are pixel drift, added steps, removed steps, renamed or edited steps, and a missing target file.
- A change is not a failure. Refreshing the recording is the *desired* behavior, so the verdict must not affect pass/fail status.

## Considered Options

1. **Always capture to staging; compute a span verdict from checkpoint results at stopRecord; promote video + baselines atomically on CHANGED, discard staging on UNCHANGED.**
2. Compare the produced video against the previous video (frame diff / SSIM) to decide.
3. Re-record only when a prior run flagged drift (two-run protocol).

## Decision Outcome

Chosen option: **1, span verdict from checkpoints with a best-effort-atomic promote**. The checkpoints are already a per-step change detector with exactly the right sensitivity. The capture-to-staging flow already exists. And a single-run decision keeps the author workflow to "run the test."

Mechanics:

- `record_v3`'s `overwrite` enum gains `"aboveVariation"`. It **requires** checkpoints, so the mode forces them on. That includes overriding an explicit `checkpoints: false`, since a verdict with no evidence could never refresh a drifted recording. An explicit `checkpoints` object still tunes `maxVariation` and `directory`. One shared predicate, `recordingCheckpointsEnabled`, keeps every enablement site in agreement.
- The recording always starts, with no skip-at-start for an existing target, unlike `"false"`. It captures normally, and **transcodes to a staging file in the target's directory**. That's the same volume, so promotion is a rename.
- **Span verdict** is a pure, unit-tested helper. It reports CHANGED if any of five things holds. Any checkpoint has `variation > maxVariation`. Any checkpoint has no baseline, meaning a new or renamed step. Any orphaned baseline exists on disk with no matching checkpoint, meaning a removed or renamed step. Any checkpoint errored, so it's incomparable and can't prove unchanged. Or the target file is missing.
- **CHANGED** promotes in order. First, replace the video, with rm-then-rename, since Windows can't rename over an existing file. Second, write every checkpoint baseline through copy-to-temp-then-rename. Third, delete orphaned baselines. `outputs.changed` is `true`, and `outputs.changeReasons` lists why. Those reasons are phrased so a renamed step's paired missing and orphan entries read as one edit.
- **UNCHANGED** ⇒ delete the staging video, leave target and baselines byte-untouched. `outputs.changed = false`.
- **Indeterminate spans keep the existing recording.** Two cases discard the staged capture and keep everything, with a warning log. One is a *dirty* span, where a step FAILed. The failed and unreached steps have no checkpoint entries, so orphan-based verdicts would misread the gap as "steps removed" and destroy good artifacts. The other is a span that captured *no* checkpoints, as in app-only contexts, where there's no evidence either way. There's one exception. When no committed recording exists at all, the fresh capture promotes anyway, which beats nothing. Plain-checkpoint seeding is likewise skipped for dirty spans, because first-run baselines must come from a clean run.
- The verdict never affects step status. Drift still surfaces as the WARNING from ADR 01072's checkpoint assertions; with `"aboveVariation"` that WARNING reads as "the recording was refreshed."

True multi-file atomicity is impossible without a transactional filesystem. The ordering puts the video first, then baselines. So a mid-sequence crash leaves a fresh video with stale baselines. The *next* run detects that as CHANGED and repairs it, self-healing in the safe direction. The video swap parks the existing target at a backup name, and restores it if the staging rename fails. The committed recording is never destroyed without its replacement in place. Only the swap itself is guarded. Clearing the backup happens *after* the swap commits, because a cleanup failure must not un-report a refresh that really landed. A Windows AV lock is enough to cause one. A stale backup from a crashed run is cleared before the next swap, rather than left to fail it forever. Windows can't rename onto an existing file.

The helper reports what actually landed, through `videoPromoted` and `baselineFailures`. So `outputs.changed` can't claim a refresh that didn't happen. A video that refreshed while a baseline didn't is reported as partial rather than complete. The next run reads that mismatch as drift, and repairs it. A promote that can't commit is never a clean PASS. With no target at all the step FAILs and reports no `recordingPath`. With the previous target retained, it WARNs that the kept recording is stale. The staging filename is deterministic, as `.<name>.staging<ext>`. So a crashed run's leftover is overwritten by the next run rather than accumulating, and failure exits remove it eagerly.

### Consequences

- Good, because recordings refresh themselves exactly when their content changes, and stay byte-stable otherwise (clean diffs, stable mtimes, no re-upload churn).
- Good, because the recording and its baselines can never permanently disagree. Any inconsistency window resolves CHANGED on the next run.
- Good, because the whole feature is one enum value on an existing field.
- Neutral, because the span always records even when the outcome is discard. The capture cost is paid regardless. That's unavoidable, since the verdict needs the run's checkpoints, which need the run.
- Bad, because dynamic pages can flap CHANGED/UNCHANGED across runs; mitigation is `checkpoints.maxVariation` tuning, as with plain checkpoints.

### Confirmation

- Unit tests cover the pure verdict helper, for each CHANGED trigger and for UNCHANGED. They also cover the promote helper against scratch directories, for ordering, orphan deletion, and Windows rename-over-existing. They include its failure honesty. A stale backup from a crashed run is cleared rather than failing the swap forever. And a video that commits while a baseline copy fails reports `videoPromoted: true` with `baselineFailures: 1`, instead of a clean refresh.
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
- Good, because the second run could skip capture when unchanged. But recording capture is not the dominant cost, and the complexity lands on every author.
