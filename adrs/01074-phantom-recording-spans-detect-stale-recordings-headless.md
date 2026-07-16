---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Phantom recording spans detect stale recordings headless

## Context and Problem Statement

Recording requires a headed display, so headless CI runs skip `record` steps entirely — and with them, every drift signal from ADRs 01072/01073. A team whose docs tests run headless never learns their committed recordings have gone stale until a human watches one. Checkpoint screenshots, however, work headless. Can a headless run detect staleness without recording?

## Decision Drivers

- Checkpoint capture and comparison need only a browser driver — the one thing a headless context has.
- The detection must reuse the existing handle/hook/stop plumbing rather than a parallel code path.
- A headless run must never write anything: no video, no baseline seeding or updates (it can't produce the video the baselines must stay in sync with — ADR 01073's atomicity).
- The signal must reach the user actionably: results JSON plus a post-run hint pointing at the fix (re-run headed).

## Considered Options

1. **Phantom handles: a headless-skipped `aboveVariation`/checkpointed record pushes a compare-only `{type: "phantom"}` handle; the unchanged post-step hook captures checkpoints; `stopRecord` computes the verdict read-only and reports staleness.**
2. A separate "audit" command/mode that walks committed baselines and compares them against a headless run.
3. Do nothing headless; document that staleness detection requires headed runs.

## Decision Outcome

Chosen option: **1 — phantom handles**, because the entire span/hook/stop lifecycle already exists; the phantom is one new handle type with a read-only stop branch.

Mechanics:

- At `startRecording`'s headless skip sites (browser engine headless guard; ffmpeg no-display guard), when the step has `overwrite: "aboveVariation"` or `checkpoints` configured: instead of a bare SKIPPED return, return SKIPPED **plus** a `{ type: "phantom", targetPath, targetExisted, checkpoints }` handle. The existing push site tracks it; the existing post-step hook captures checkpoints against the committed baselines (compare-only, as always mid-span).
- `stopRecording` gets a phantom branch before the engine branches: nothing to stop, nothing to transcode, **no writes of any kind** — no seeding, no baseline updates, no orphan deletion. It computes the same span verdict as ADR 01073 read-only:
  - Verdict CHANGED ⇒ status **WARNING**, `outputs.stale = true`, description telling the user the recording appears stale and to re-run headed to refresh it.
  - Verdict UNCHANGED ⇒ status **SKIPPED** (the recording itself was skipped), `outputs.stale = false`, description noting checkpoints matched.
- **Hint**: a new `refreshStaleRecording` hint (priority 20, current-run problems band) fires when any step report carries `outputs.stale === true`, suggesting a headed re-run. `HintContext` gains a `hasStaleRecordings` boolean populated in the existing results walk.
- First-run nuance: with no committed baselines yet, every checkpoint is `baselineMissing` ⇒ CHANGED ⇒ the run reports the recording as stale — correct, since neither the video nor baselines exist until someone runs headed.

### Consequences

- Good, because headless CI now surfaces stale recordings continuously, decoupling *detection* (cheap, headless) from *refresh* (headed).
- Good, because the phantom reuses the hook and stop plumbing — the only new logic is the handle type and the read-only stop branch.
- Good, because WARNING keeps the fixture/CI gates green (staleness is advice, not failure).
- Bad, because phantom checkpoint captures cost one screenshot per step per span in runs that produce no video.
- Bad, because a headless viewport can render differently from the headed capture environment (fonts, scrollbars, viewport size), which can produce false staleness; mitigated by `checkpoints.maxVariation` and documented.

### Confirmation

- Unit tests: a phantom handle with drifted/missing-baseline entries yields WARNING + `outputs.stale = true` and writes nothing (baseline dir mtimes unchanged, no seeding); matching entries yield SKIPPED + `outputs.stale = false`.
- Hint unit test: `hasStaleRecordings` context signal + hint `when` predicate.
- Feature fixture `test/core-artifacts/recording/stale-headless.spec.json` (headless, all platforms): an `aboveVariation` span with no committed baselines ⇒ phantom ⇒ WARNING with `outputs.stale = true`, asserted via captured outputs; the spec stays out of FAIL (verified: the fixture gate fails only on spec `result === "FAIL"`).

## Pros and Cons of the Options

### 1. Phantom handles

- Good, because minimal new surface and the signal lands in the same results/report/hint channels as everything else.
- Bad, because "SKIPPED but with outputs" is a novel step-report shape (documented).

### 2. Separate audit mode

- Bad, because it duplicates step execution/navigation logic outside the runner and adds a command users must learn and schedule.

### 3. Headed-only detection

- Bad, because most CI is headless; staleness would surface only on manual headed runs — the status quo this feature exists to fix.
