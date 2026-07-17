---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Phantom recording spans detect stale recordings when capture is skipped

## Context and Problem Statement

Recording requires a headed display, so headless CI runs skip `record` steps entirely — and with them, every drift signal from ADRs 01072/01073. A team whose docs tests run headless never learns their committed recordings have gone stale until a human watches one. Checkpoint screenshots, however, work headless. Can a headless run detect staleness without recording?

The same question applies to *any* skipped capture. `overwrite: "false"` — the default — skips the recording when the target already exists, and that skip is the normal steady state for a committed recording: the file is in the repo, so every subsequent run skips it. Plain `checkpoints: true` therefore seeded baselines on the first run and never compared again, headed or headless, silently retiring the drift detection ADR 01075 promises ("Baselines seed on the first run; on later runs, per-checkpoint variation is reported"). Whatever answers the headless question should answer this one, since both are the same shape: the video is skipped, but the checkpoints still have something to say.

## Decision Drivers

- Checkpoint capture and comparison need only a browser driver — the one thing a headless context has.
- The detection must reuse the existing handle/hook/stop plumbing rather than a parallel code path.
- A run that skipped the capture must never write anything: no video, no baseline seeding or updates (it can't produce the video the baselines must stay in sync with — ADR 01078's atomicity).
- The signal must reach the user actionably: results JSON plus a post-run hint pointing at the fix — and the fix differs by skip, so the report must name the right one rather than always blaming headless.
- A skip is a decision about the *video*, not about the checkpoints. Every site that skips capture should reach the same conclusion, or the drift detection quietly stops working wherever a new skip is added.

## Considered Options

1. **Phantom handles: a record whose capture is skipped, with `aboveVariation`/checkpoints configured, pushes a compare-only `{type: "phantom"}` handle; the unchanged post-step hook captures checkpoints; `stopRecord` computes the verdict read-only and reports staleness.**
2. A separate "audit" command/mode that walks committed baselines and compares them against a headless run.
3. Do nothing headless; document that staleness detection requires headed runs.

## Decision Outcome

Chosen option: **1 — phantom handles**, because the entire span/hook/stop lifecycle already exists; the phantom is one new handle type with a read-only stop branch.

Mechanics:

- At **every** `startRecording` skip site — the browser-engine headless guard, the ffmpeg no-display guard, and the existing-target guard (`overwrite: "false"`, the default) — when the step has `overwrite: "aboveVariation"` or `checkpoints` configured: instead of a bare SKIPPED return, return SKIPPED **plus** a `{ type: "phantom", targetPath, targetExisted, checkpoints, skipReason }` handle. The existing push site tracks it; the existing post-step hook captures checkpoints against the committed baselines (compare-only, as always mid-span). One `phantomRecordingResult` helper serves all three sites, so a fourth skip added later inherits the behavior rather than silently dropping the drift signal — this is why the helper is defined above the first guard rather than beside the engine branches.
- The existing-target guard is what makes plain `checkpoints: true` work at all beyond its first run: the committed video exists, so the capture skips, and the phantom is the only thing that compares. `aboveVariation` never reaches this guard (it always records, then decides at stopRecord — ADR 01078), so it's unaffected.
- `stopRecording` gets a phantom branch before the engine branches: nothing to stop, nothing to transcode, **no writes of any kind** — no seeding, no baseline updates, no orphan deletion. It computes the same span verdict as ADR 01078 read-only:
  - Verdict CHANGED ⇒ status **WARNING**, `outputs.stale = true`, description telling the user the recording appears stale and naming the remedy for *its* skip: re-run headed for a headless skip; set `overwrite` (or remove the file) for an existing target. Blaming headless on a headed run would send the author chasing the wrong thing, which is what `skipReason` exists to prevent.
  - Verdict UNCHANGED ⇒ status **SKIPPED** (the recording itself was skipped), `outputs.stale = false`, description noting checkpoints matched.
- **Hint**: a new `refreshStaleRecording` hint (priority 20, current-run problems band) fires when any step report carries `outputs.stale === true`. `HintContext` gains a `hasStaleRecordings` boolean populated in the existing results walk. The hint covers both remedies and points at the `stopRecord` description for which one applies, since a single run can contain both kinds of skip.
- First-run nuance: with no committed baselines yet, every checkpoint is `baselineMissing` ⇒ CHANGED ⇒ the run reports the recording as stale — correct, since neither the video nor baselines exist until someone runs headed. The hint wording accommodates this (baselines that "couldn't be verified" as well as ones that "no longer match").

### Consequences

- Good, because headless CI now surfaces stale recordings continuously, decoupling *detection* (cheap, headless) from *refresh* (headed).
- Good, because plain `checkpoints: true` keeps detecting drift past its first run. Before this, the default `overwrite: "false"` skipped the capture as soon as the recording was committed, and the checkpoints went with it — the feature appeared to work (green runs, seeded baselines) while comparing nothing.
- Good, because the phantom reuses the hook and stop plumbing — the only new logic is the handle type and the read-only stop branch.
- Good, because WARNING keeps the fixture/CI gates green (staleness is advice, not failure).
- Bad, because phantom checkpoint captures cost one screenshot per step per span in runs that produce no video.
- Bad, because a headless viewport can render differently from the headed capture environment (fonts, scrollbars, viewport size), which can produce false staleness; mitigated by `checkpoints.maxVariation` and documented.

### Confirmation

- Unit tests: a phantom handle with drifted/missing-baseline entries yields WARNING + `outputs.stale = true` and writes nothing (baseline dir mtimes unchanged, no seeding); matching entries yield SKIPPED + `outputs.stale = false`. A `targetExists` phantom names `overwrite` as the remedy and never mentions headless; a `headless` one still says headed.
- `startRecording` guard tests: an existing target with `checkpoints` returns SKIPPED **with** a phantom handle; without checkpoints it stays a bare SKIPPED (no phantom); `aboveVariation` never hits the existing-target guard at all.
- End-to-end (headed Windows, real CLI): a spec with plain `checkpoints: true` and no `overwrite`, run twice against the same target. Before this decision, run 2 reported `record` SKIPPED "File already exists" and `stopRecord` SKIPPED "Recording isn't started" — zero checkpoints compared. After, run 2 reports `stopRecord` SKIPPED with `stale: false`, `maxCheckpointVariation: 0`, and the baselines byte-untouched.
- Hint unit test: `hasStaleRecordings` context signal + hint `when` predicate.
- Feature fixture `test/core-artifacts/recording/stale-headless.spec.json` (headless **Windows/macOS only** — on Linux fixture jobs an Xvfb display can make headless ffmpeg recording real instead of skipped, so the phantom path never engages there): an `aboveVariation` span with no committed baselines ⇒ phantom ⇒ WARNING with `outputs.stale = true`, asserted via captured outputs; the spec stays out of FAIL (verified: the fixture gate fails only on spec `result === "FAIL"`).
- A dirty span (a step FAILed mid-span) or a span that captured no checkpoints reports SKIPPED with **no** `stale` output — indeterminate evidence must claim neither staleness nor freshness. Unit-tested in `test/recording-above-variation.test.js`.

## Pros and Cons of the Options

### 1. Phantom handles

- Good, because minimal new surface and the signal lands in the same results/report/hint channels as everything else.
- Bad, because "SKIPPED but with outputs" is a novel step-report shape (documented).

### 2. Separate audit mode

- Bad, because it duplicates step execution/navigation logic outside the runner and adds a command users must learn and schedule.

### 3. Headed-only detection

- Bad, because most CI is headless; staleness would surface only on manual headed runs — the status quo this feature exists to fix.
