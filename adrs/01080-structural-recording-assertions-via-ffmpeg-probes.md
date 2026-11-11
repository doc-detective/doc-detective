---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Structural recording assertions via ffmpeg probes

## Context and Problem Statement

Checkpoints (ADR 01075) validate the *scene* a recording shows, but nothing validates the produced *file*. A capture bug can ship an all-black video, a wrong-region crop, or a truncated clip while every step passes. The historical failure modes of screen recording are exactly these. They are black gdigrab output, a wrong display index on macOS, and crops landing outside the window. How do authors assert structural properties of the video artifact itself?

## Decision Drivers

- The guards must measure the final file, rather than the capture intent. They reuse the `stopRecord` metadata probe (ADR 01074) and the bundled ffmpeg.
- They are opt-in and author-owned. Checkpoint drift is advice, at WARNING. A violated structural guard is a real failure of something the author explicitly demanded, so it takes FAIL severity through the shared implicit-assertion engine.
- No new dependencies; content analysis (blackness) must come from ffmpeg filters.

## Considered Options

1. **An opt-in `verify` object on `record` (duration range, resolution match, not-black), evaluated at `stopRecord` from probe outputs plus an ffmpeg `blackdetect` pass.**
2. Always-on structural warnings for every recording.
3. Leave structural validation to external tooling over the reported outputs.

## Decision Outcome

Chosen option: **1, opt-in `record.verify` guards**. They upgrade what the recording fixtures assert, and users' own doc tests too. The bar moves from "the steps didn't throw" to "a real, non-black, correctly-sized video of the expected length exists." And they do that without taxing recordings that don't ask for it.

Mechanics:

- `record_v3` gains `verify: { minDuration?, maxDuration?, resolution?: boolean | {width, height}, notBlack? }`. Carried on the recording handle; evaluated at `stopRecord` after the metadata probe, against the file the user keeps (post-promote under `aboveVariation`).
- **Duration**: `$$outputs.duration >= minDuration` and `<= maxDuration`, at FAIL severity. If the probe couldn't produce a duration, the assertion fails. An author who demanded a duration guard shouldn't get a silent pass on an unprobeable file.
- **Resolution**: `resolution: true` compares the probed dimensions against the resolved expectation. That expectation is the crop rectangle when a window or viewport crop applied, and otherwise the capture frame size. It's exposed as `outputs.resolutionMatch`, with a ±2 px tolerance, since encoders round to even dimensions. The object form compares literal `width` and `height`. Sometimes no expectation exists, as with `true` on the device engine, which reports no capture frame size. The check is then skipped with a debug log, rather than guessing.
- **notBlack**: a bounded ffmpeg pass with `blackdetect=d=0.1:pix_th=0.10`. `outputs.allBlack` is true when the detected black intervals cover the clip. Coverage needs two measured allowances. First, blackdetect's final interval ends at the **last black frame's timestamp**, rather than the clip end. So a fully-black clip under-reports by up to one frame interval. Verified: a 0.5 s 10 fps black clip reports `black_duration:0.4`. The probed `fps` sizes that tolerance. Without an fps, the shortfall is indistinguishable from real content, so the check stays undecided rather than guessing. Second, a further 5% slack absorbs encoders that shade the first or last frame. The assertion is `$$outputs.allBlack == false` at FAIL severity.
- Verify specs and checkpoint specs (ADR 01075) evaluate in one `evaluateImplicitAssertions` call. So the FAIL > WARNING roll-up is computed once, and a structural failure outranks checkpoint drift.

### Consequences

- Good, because capture regressions (black output, wrong crop geometry, truncated files) become assertable, both in users' tests and in this repo's recording fixtures.
- Good, because the guards reuse the ADR 01074 probe and the shared assertion engine. The only new machinery is the blackdetect parse.
- Neutral, because `notBlack` costs one bounded ffmpeg decode pass per stop that requests it.
- Bad, because gif duration reporting is imprecise. Duration guards need ~±0.5 s slop, which is documented.

### Confirmation

- Unit tests for `parseBlackdetect` live in `test/recording-verify.test.js`. They cover no intervals, partial coverage, multi-interval summing, garbage input, and unknown or zero duration. They also cover the one-frame under-report of a fully black clip, with and without an fps to size the tolerance. A half-black clip must stay not-black despite the tolerance. `detectAllBlack` runs against real ffmpeg-generated black and red clips.
- `stopRecording` integration tests use device-engine handles and real mp4 samples. They cover passing and violated duration guards, resolution object-form match and mismatch, and `notBlack` passing on colored content while FAILing on an all-black clip.
- A violated guard survives a failed promote (ADR 01078). The promote-failure path downgrades the step to WARNING, saying "the old recording was kept". That must not swallow a FAIL the author explicitly demanded, since FAIL outranks WARNING in every other roll-up. An integration test pins it, forcing a real promote failure and asserting the status stays FAIL. This combination is only reachable with `aboveVariation` and `verify` on the same span, so neither decision alone would have caught it.
- `createMatchingLineCollector` unit tests take a `black_` line torn across chunk boundaries, mid-token and one character at a time. It still reaches `parseBlackdetect` as full coverage. Filtering ffmpeg's stderr per chunk rather than per line silently drops an interval when the pipe flushes mid-line. That's invisible on the short clips the tests generate. It's exactly wrong on the long recordings the guard protects, since the video would pass `notBlack`.
- Feature fixture: the recording-outputs fixture's mp4 test gains a passing `verify` block on real headed recordings. It sets a duration floor *and* ceiling, `resolution: true`, and `notBlack`. So every guard runs end-to-end through the real probe at least once. Two permutations can't be fixtures, and stay in mocha. A violated guard would FAIL, and fixtures never do. And `resolution`'s object form can't be deterministic, because a literal `{width, height}` depends on the runner's display, whose size varies by image. The fixture's ceiling is deliberately loose. The boundary behavior is unit-tested, and the fixture only proves the guard runs and passes against a real file.

## Pros and Cons of the Options

### 1. Opt-in `record.verify`

- Good, because authors choose the strictness; FAIL severity matches an explicitly demanded guard.
- Bad, because coverage depends on authors opting in.

### 2. Always-on structural warnings

- Good, because every recording gets a safety net.
- Bad, because duration and resolution expectations need author input. Always-on checks reduce to not-black only, and an always-on decode pass taxes every recording.

### 3. External tooling over outputs

- Bad, because duration and resolution are already reported (ADR 01074), while blackness isn't derivable from outputs. And "run another tool" isn't a contract doc tests can enforce in CI.
