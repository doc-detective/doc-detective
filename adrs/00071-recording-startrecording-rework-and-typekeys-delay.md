---
status: accepted
date: 2024-01-10
decision-makers: doc-detective maintainers
---

# Rework startRecording options and add per-keystroke typeKeys delay

## Context and Problem Statement

Recording had accumulated a payload-shaped contract: `startRecording` carried an `fps` field, paths
could vary in case, and `find.moveTo`/`find.click` had no settled default. Meanwhile, when a
recording was active, `typeKeys` dumped the whole string at once, so the captured video showed text
appear instantaneously rather than being typed — useless for a "watch the user type" demo. How
should the `startRecording` schema be cleaned up, and how should `typeKeys` behave differently while
a recording is running?

## Decision Drivers

* Recordings should look like a human is operating the UI (visible, paced keystrokes).
* The `startRecording` shape should match the FFmpeg-based engine (FPS is engine-controlled, not a
  per-step knob).
* Output paths must be predictable (lowercase extension only) so the format dispatch is reliable.
* `find.moveTo`/`find.click` need explicit, conservative defaults (off) so `find` stays a pure probe.
* Per-keystroke pacing must not slow down non-recording runs.

## Considered Options

* **A. Drop `fps` from `startRecording`, add `directory`/`overwrite`, and split typeKeys into paced
  single-char input only while recording** (chosen).
* **B. Keep `fps` on the step and add a separate `typeDelay` that always applies.**
* **C. Leave typeKeys instantaneous and accept fast-text recordings.**

## Decision Outcome

Chosen option: **A**, because the FFmpeg engine owns frame rate, and keystroke pacing is only
meaningful when something is capturing it. The contract decided:

1. **`startRecording` schema** (`common`, commits `1560a01`, `b16347b`, `2a6ac4c`, `dcbe568`,
   `91590cb`): `fps` removed; `directory` added; `overwrite` defaults `false`; `path` restricted to a
   lowercase extension only. `find.moveTo` and `find.click` default `false`.
2. **`typeKeys` runtime** (`core`, commit `1ac361`): a `delay` field (default 100ms, **recording-only**)
   is honored — when a recording is active, the string is split into single characters typed with a
   `setTimeout(step.delay)` between each; otherwise the whole string is sent at once.

## Pros and Cons of the Options

### A. Drop fps, paced keystrokes only when recording (chosen)
* Good: schema matches the engine; recordings look human-typed; no perf cost off-recording.
* Bad: typeKeys now has two timing paths to maintain.

### B. Keep fps + always-on typeDelay
* Good: one timing path.
* Bad: pointless slowdown on non-recording runs; fps is not honored by the FFmpeg engine.

### C. Instantaneous typeKeys
* Good: nothing to build.
* Bad: recordings show text materializing instantly — poor demo quality.

### Consequences

* Good: cleaner `startRecording` schema; demo-quality typing in recordings.
* Good: zero overhead for the common (non-recording) path.
* Bad: `delay` semantics are conditional on recording state, which is easy to overlook.
* Neutral: `find.moveTo`/`find.click` defaulting to `false` keeps `find` a non-acting probe.

### Confirmation

`startRecording` schema fields in `doc-detective-common` (`1560a01`…`91590cb`); the per-keystroke
split in `doc-detective-core` `1ac361`. Recording fixtures exercise the paced path under headed
recording-capable contexts.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `1560a01`, `b16347b`,
`2a6ac4c`, `dcbe568`, `91590cb`; doc-detective-core `1ac361`. Inventory ref: BACKFILL-INVENTORY.md
Seq 102, 103. Related: `00069` (FFmpeg recording engine), `00070` (media/download dir derivation).
