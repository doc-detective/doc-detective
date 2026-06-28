---
status: accepted
date: 2023-03-17
decision-makers: doc-detective maintainers
---

# FFmpeg recording engine

## Context and Problem Statement

Doc Detective records browser walkthroughs into video. An early attempt drove recording through
OBS via its websocket interface, but that path was scaffolded and then disabled/commented out and
never shipped — OBS is a heavy external GUI dependency that is awkward to install and automate.
Recording still needed to work headlessly-aware and crop to the browser viewport, with cursor
movement visible in the output. What engine should drive recording, and how should capture and cursor
overlay behave?

## Decision Drivers

* Recording must not depend on a heavyweight external GUI app (OBS) the user must install and run.
* Capture should crop to the browser viewport, accounting for device pixel ratio.
* Recording is only meaningful on supported, headed engines; unsupported cases must skip cleanly.
* `moveTo` cursor movement should be visible in the recorded video.

## Considered Options

* **A. Drive recording with FFmpeg (gdigrab desktop capture cropped to the viewport) and an in-page cursor overlay; SKIP on unsupported engines** (chosen).
* **B. Continue the OBS-websocket integration.**
* **C. Use a browser/devtools native screen-capture API.**

## Decision Outcome

Chosen option: **A**, because FFmpeg is a single bundleable binary with no GUI, and desktop capture
plus viewport cropping gives a portable recording path. The OBS-websocket scaffold (`startRecording`/
`stopRecording` wired to OBS, recording actions stubbed out of `driverActions`) is abandoned —
**OBS never shipped**. Recording pivots to **FFmpeg**: `gdigrab` desktop capture cropped to the
browser viewport (using `devicePixelRatio`, with even-number rounding for the crop dimensions).
Firefox and headless contexts hit SKIP guards. `moveTo` draws an in-page cursor overlay that is
visible only in the recording.

### Consequences

* Good: no OBS dependency; FFmpeg is a single binary that can be bundled/installed.
* Good: output is cropped to the actual viewport with correct DPI scaling.
* Good: cursor movement is visible in recordings via the overlay.
* Bad: gdigrab desktop capture is Windows-specific; other platforms need their own capture path
  later.
* Neutral: recording is restricted to supported headed engines (Firefox/headless SKIP), narrowing
  where it runs.

### Confirmation

OBS scaffold in core `71796d2`, `42e9f88`, `648a094`, `16aa1b9` (then disabled). FFmpeg engine shipped
in core `a8ccba`, `911d3f`, `c1b16e`, `e8fb05`, `0b2b78`, `ad15d66` (gdigrab capture, viewport crop,
SKIP guards, cursor overlay). Exercised by recording fixtures gated to headed engines, landing
SKIPPED elsewhere.

## Pros and Cons of the Options

### A. FFmpeg gdigrab + viewport crop + cursor overlay
* Good: no GUI dependency; portable binary; correct cropping; visible cursor.
* Bad: gdigrab is Windows-only; per-platform capture needed later.

### B. OBS websocket
* Good: full-featured recorder.
* Bad: heavyweight GUI install; hard to automate; never shipped.

### C. Browser native capture API
* Good: no external binary.
* Bad: limited/inconsistent; harder to crop and overlay deterministically.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core OBS scaffold `71796d2`,
`42e9f88`, `648a094`, `16aa1b9`; FFmpeg engine `a8ccba`, `911d3f`, `c1b16e`, `e8fb05`, `0b2b78`,
`ad15d66`. Inventory ref: BACKFILL-INVENTORY.md Seq 72, 100. Related: `00018` (recording formats),
`00029` (bundled ffmpeg installer), `00072` (OBS retired; detection rewrite), `00073` (recording
restricted to Chrome), `00174` (ffmpeg any-app recording engine).
