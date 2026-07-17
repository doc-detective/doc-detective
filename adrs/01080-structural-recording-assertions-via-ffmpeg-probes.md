---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Structural recording assertions via ffmpeg probes

## Context and Problem Statement

Checkpoints (ADR 01075) validate the *scene* a recording shows, but nothing validates the produced *file*: a capture bug can ship an all-black video, a wrong-region crop, or a truncated clip while every step passes. The historical failure modes of screen recording are exactly these — black gdigrab output, wrong display index on macOS, crops landing outside the window. How do authors assert structural properties of the video artifact itself?

## Decision Drivers

- The guards must measure the final file, not the capture intent — reusing the `stopRecord` metadata probe (ADR 01074) and the bundled ffmpeg.
- Opt-in and author-owned: unlike checkpoint drift (advice, WARNING), a violated structural guard is a real failure of something the author explicitly demanded — FAIL severity through the shared implicit-assertion engine.
- No new dependencies; content analysis (blackness) must come from ffmpeg filters.

## Considered Options

1. **An opt-in `verify` object on `record` (duration range, resolution match, not-black), evaluated at `stopRecord` from probe outputs plus an ffmpeg `blackdetect` pass.**
2. Always-on structural warnings for every recording.
3. Leave structural validation to external tooling over the reported outputs.

## Decision Outcome

Chosen option: **1 — opt-in `record.verify` guards**, because they turn the recording fixtures (and users' own doc tests) from "the steps didn't throw" into "a real, non-black, correctly-sized video of the expected length exists," without taxing recordings that don't ask for it.

Mechanics:

- `record_v3` gains `verify: { minDuration?, maxDuration?, resolution?: boolean | {width, height}, notBlack? }`. Carried on the recording handle; evaluated at `stopRecord` after the metadata probe, against the file the user keeps (post-promote under `aboveVariation`).
- **Duration**: `$$outputs.duration >= minDuration` / `<= maxDuration` (FAIL severity). If the probe couldn't produce a duration, the assertion fails — an author who demanded a duration guard shouldn't get a silent pass on an unprobeable file.
- **Resolution**: `resolution: true` compares the probed dimensions against the resolved expectation — the crop rectangle when a window/viewport crop applied, else the capture frame size — exposed as `outputs.resolutionMatch` with a ±2 px tolerance (encoders round to even dimensions). The object form compares literal `width`/`height`. When no expectation exists (`true` on the device engine, which reports no capture frame size), the check is skipped with a debug log rather than guessing.
- **notBlack**: a bounded ffmpeg pass with `blackdetect=d=0.1:pix_th=0.10`; `outputs.allBlack` is true when the detected black intervals cover the clip. Coverage needs two measured allowances: blackdetect's final interval ends at the **last black frame's timestamp**, not the clip end, so a fully-black clip under-reports by up to one frame interval (verified: a 0.5 s 10 fps black clip reports `black_duration:0.4`) — the probed `fps` sizes that tolerance, and without an fps the shortfall is indistinguishable from real content, so the check stays undecided rather than guessing. A further 5% slack absorbs encoders that shade the first/last frame. `$$outputs.allBlack == false` at FAIL severity.
- Verify specs and checkpoint specs (ADR 01075) evaluate in one `evaluateImplicitAssertions` call, so the FAIL > WARNING roll-up is computed once — a structural failure outranks checkpoint drift.

### Consequences

- Good, because capture regressions (black output, wrong crop geometry, truncated files) become assertable, both in users' tests and in this repo's recording fixtures.
- Good, because the guards reuse the ADR 01074 probe and the shared assertion engine — the only new machinery is the blackdetect parse.
- Neutral, because `notBlack` costs one bounded ffmpeg decode pass per stop that requests it.
- Bad, because gif duration reporting is imprecise — duration guards need ~±0.5 s slop, documented.

### Confirmation

- Unit tests for `parseBlackdetect` in `test/recording-verify.test.js`: no intervals, partial coverage, multi-interval summing, garbage input, unknown/zero duration, the one-frame under-report of a fully black clip (with and without an fps to size the tolerance), and a half-black clip that must stay not-black despite the tolerance. `detectAllBlack` runs against real ffmpeg-generated black and red clips.
- `stopRecording` integration tests (device-engine handles, real mp4 samples): passing and violated duration guards, resolution object-form match/mismatch, `notBlack` passing on colored content and FAILing on an all-black clip.
- A violated guard survives a failed promote (ADR 01078): the promote-failure path downgrades the step to WARNING ("the old recording was kept"), which must not swallow a FAIL the author explicitly demanded — FAIL outranks WARNING in every other roll-up. Pinned by an integration test that forces a real promote failure and asserts the status stays FAIL. This combination is only reachable with `aboveVariation` and `verify` on the same span, so neither decision alone would have caught it.
- `createMatchingLineCollector` unit tests: a `black_` line torn across chunk boundaries (mid-token, and one character at a time) still reaches `parseBlackdetect` as full coverage. Filtering ffmpeg's stderr per chunk rather than per line silently drops an interval when the pipe flushes mid-line — invisible on the short clips the tests generate, and exactly wrong on the long recordings the guard protects, since the video would pass `notBlack`.
- Feature fixture: the recording-outputs fixture's mp4 test gains a passing `verify` block (duration floor *and* ceiling, `resolution: true`, `notBlack`) on real headed recordings, so every guard runs end-to-end through the real probe at least once. Two permutations can't be fixtures and stay in mocha: a violated guard (it would FAIL, and fixtures never do), and `resolution`'s object form (a literal `{width, height}` can't be deterministic when the capture is the runner's display, whose size varies by image). The fixture's ceiling is deliberately loose — the boundary behavior is unit-tested; the fixture only proves the guard runs and passes against a real file.

## Pros and Cons of the Options

### 1. Opt-in `record.verify`

- Good, because authors choose the strictness; FAIL severity matches an explicitly demanded guard.
- Bad, because coverage depends on authors opting in.

### 2. Always-on structural warnings

- Good, because every recording gets a safety net.
- Bad, because duration/resolution expectations aren't knowable without author input — always-on checks reduce to not-black only, and an always-on decode pass taxes every recording.

### 3. External tooling over outputs

- Bad, because duration/resolution are already reported (ADR 01074) but blackness isn't derivable from outputs, and "run another tool" isn't a contract doc tests can enforce in CI.
