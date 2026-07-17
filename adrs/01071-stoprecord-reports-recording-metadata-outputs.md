---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# stopRecord reports recording metadata outputs

## Context and Problem Statement

A `stopRecord` step currently returns only `{ status, description }`. The produced video's path, duration, resolution, frame rate, and format are invisible in the results JSON, so nothing downstream — reporters, integrations, assertions, or the planned recording visual-regression layers — can reason about what was actually produced. Screenshots set rich `outputs` (`screenshotPath`, `variation`, …); recordings set none. How should `stopRecord` report what it produced, and where should the metadata come from given that ffprobe is not bundled?

## Decision Drivers

- All three engines (browser/MediaRecorder, ffmpeg capture, Appium device) must report the same output shape.
- The metadata must describe the **final artifact** — post-crop, post-transcode, post-gif-scale — not the raw capture.
- No new heavy dependency: `@ffmpeg-installer/ffmpeg` ships only the `ffmpeg` binary, not `ffprobe`.
- A metadata failure must never change the step's PASS/FAIL status; reporting is best-effort.
- Later layers (checkpoint comparison, structural `verify` guards) will consume these outputs via the shared implicit-assertion engine.

## Considered Options

1. **Probe the final file with `ffmpeg -i <target>` and parse stderr.**
2. **Parse the transcode invocation's stderr** (already captured with a bounded tail).
3. **Derive metadata analytically** from capture info + crop rect + requested fps.
4. **Bundle ffprobe** (e.g. `@ffprobe-installer/ffprobe`) and parse its JSON output.

## Decision Outcome

Chosen option: **1 — probe the final artifact with `ffmpeg -i` and parse stderr**, because it is the only option that measures the file users actually get, works identically for all three engines (including the device engine's native-mp4 path that never transcodes), and needs no new dependency. `ffmpeg -i` with no output file exits non-zero by design; the probe captures stderr with the same bounded-tail pattern the transcode step uses and parses it regardless of exit code.

`stopRecord` gains `outputs`:

| Field | Type | Source |
|---|---|---|
| `recordingPath` | string | absolute target path |
| `duration` | number (seconds) | `Duration: HH:MM:SS.ss` stderr line |
| `width`, `height` | integers | `Video: … WxH` stderr line |
| `fps` | number | `N fps`, falling back to `N tbr` (gif often reports only tbr) |
| `format` | string | target extension |

On probe failure (missing binary, unreadable file, unparsable stderr) the affected fields are omitted, a debug log records why, and the step status is untouched. `recordingPath` and `format` are always set when a file was produced. Skipped recordings (`overwrite: "false"`, headless guard, stop-without-start) report no outputs.

### Consequences

- Good, because results JSON finally records what recording a run produced, enabling downstream assertions and the later visual-regression layers.
- Good, because one probe path serves all engines and formats, and reflects crops/scales applied during transcode.
- Neutral, because one extra short-lived ffmpeg process runs per `stopRecord` (milliseconds; the binary is already resolved/cached by `getFfmpegPath`).
- Bad, because stderr parsing is a contract with ffmpeg's human-readable output; regexes are kept deliberately loose and unit-tested against canned stderr for mp4/webm/gif.

### Confirmation

- Unit tests for the pure stderr parser (`parseMediaProbeStderr`) in `test/ffmpeg-recorder.test.js` cover mp4, webm, and gif (tbr-only) stderr blobs, `N/A` durations, and garbage input yielding `{}`.
- `stopRecording` integration tests in `test/app-recording.test.js` run the real probe against a real generated mp4 (asserting the full outputs shape) and against a non-video payload (asserting the step stays PASS with probe-derived fields omitted).
- `test/core-core.test.js` asserts the skip-path contract end-to-end through `runTests`: a skipped `stopRecord` reports no `outputs`.
- The feature fixture `test/core-artifacts/recording/recording-outputs.spec.json` exercises the outputs end-to-end through the real runner on headed Windows/macOS: it captures `$$recordingPath`/`$$format`/`$$duration`/`$$width`/`$$height`/`$$fps` via step `variables` and fails the spec if any is missing or non-positive, for both mp4 (fps token) and gif (tbr fallback).

## Pros and Cons of the Options

### 1. Probe final file with `ffmpeg -i`

- Good, because it measures the true artifact for every engine and format.
- Good, because zero new dependencies and an established stderr-parsing precedent (`parseCaptureFrameSize`).
- Bad, because it parses human-readable output rather than a stable machine format.

### 2. Parse transcode stderr

- Good, because zero extra processes.
- Bad, because transcode stderr describes the *input* stream (pre-crop, pre-scale), not the output.
- Bad, because the device engine's native-mp4 path never transcodes, so there is no stderr to parse.

### 3. Derive analytically

- Good, because no process at all.
- Bad, because it reports intent, not reality — a truncated or corrupt output file would still "report" full metadata, defeating the point.
- Bad, because duration is not reliably derivable (graceful-stop timing varies).

### 4. Bundle ffprobe

- Good, because `ffprobe -print_format json` is a stable machine-readable contract.
- Bad, because it adds a second ~70 MB heavy dependency and installer surface for metadata we can already extract.
