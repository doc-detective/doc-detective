---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Size a browser recording by its steady frames

Amends [ADR 01176](01176-record-headless-chrome-by-tab-capture-and-use-chrome-by-default.md).

## Context and Problem Statement

The `browser` engine records a tab with `getDisplayMedia` and `MediaRecorder` in a separate recorder tab (ADR 01176).
To start the capture, the runner switches to the recorder tab, so the captured tab is in the background while the
capture starts. It switches back once the recorder runs. To stop, it switches to the recorder tab again. So the
recording's first and last frames can come from the captured tab while it's hidden.

Chrome doesn't size a hidden tab the same way on every platform. On Windows (Chrome 150), a hidden captured tab
renders at the visible size, sharing bar included: 1024x582 for a 1024x640 viewport. On the macOS 26 runner image
(Chrome 157), the same recording came out 940x640 in some runs and 1024x582 in others, on the same commit and
image: frames at a taller aspect ratio than the visible tab's. The capture can't start until the recorder tab is in
front, so whether the first frame comes from the hidden tab is a race.

The `MediaRecorder` WebM carries frames of more than one size. ffmpeg sizes its output by the first decoded frame
and scales every later frame to it. So when the race went one way, a 1024x582 recording came out 940x640, with
every visible frame squeezed to that aspect ratio. The `headless-chrome-auto-engine` fixture failed on macOS three
runs in a row. Its sibling `headless-chrome-browser-engine` produced 940x640 too, unnoticed, because it asserted no
size. ADR 01176 noted the milder form of the same flaw: a first frame from before the sharing bar appears gives a
full-height, slightly stretched video.

What size should a browser recording be, when its frames don't all have the same size?

## Decision Drivers

- The video should show what the page looked like, at the size it rendered, on every platform.
- The output size mustn't depend on which frame Chrome happened to deliver first.
- No change to how the capture starts, since a timing change can't be checked on macOS from a Windows host.

## Considered Options

- **A. Transcode to the frame size that covers the most time.** Before the transcode, decode the WebM once with
  ffmpeg's `showinfo` filter. When the frames have more than one size, scale every frame to the size that covers
  the most of the recording's time.
- **B. Open the recorder in its own window** in headless Chrome, so the captured tab never goes to the background.
- **C. Start `MediaRecorder` only once the recorder tab is hidden**, meaning the captured tab is in front again,
  and pause it when the recorder tab comes back to the front.
- **D. Ask `getDisplayMedia` for an exact size**, so every frame is letterboxed to the viewport's size.

## Decision Outcome

Chosen option: **A**, because it's the only one that makes the size independent of frame timing, on every platform,
headed or headless.

| Recording | Before | Now |
|---|---|---|
| Frames all one size | That size | That size, with no scaling |
| Frames of more than one size | The first frame's size | The size that covers the most time |
| A 1024x640 headless Chrome viewport on macOS | 1024x582, or 940x640 when the first frame came from the hidden tab | 1024x582 |
| A first frame from before the sharing bar appeared | The full viewport height, stretched | The height with the sharing bar, unstretched |

- `probeDominantFrameSize` runs `ffmpeg -i <webm> -an -vf showinfo -f null -` and passes the log to
  `dominantFrameSize`. Each frame counts for the time until the next frame, since a captured tab sends frames only
  when it repaints. It returns `null` when every frame has the same size.
- `stopRecording` passes that size to `transcode`, which puts `scale=<width>:<height>` first in the filter chain.
  Frames already at that size pass through unchanged. Frames from the hidden tab are scaled to it.
- The probe is bounded like `detectAllBlack`: no just-in-time install, and a 30-second kill timer. Both now run
  through one helper, `collectFfmpegLines`. A probe that can't run, or times out on a long recording, sizes the
  video by its first frame, as before.
- The ffmpeg engine doesn't run the probe. It captures a display, whose frames are all one size.

### Consequences

- Good: a browser recording's size is the size the page rendered at for most of the recording, and it no longer
  changes from run to run.
- Good: it also fixes the full-height, stretched video ADR 01176 described.
- Bad: the WebM is decoded one extra time before the transcode. That's quick for short doc recordings, and at most
  30 seconds for a long one.
- Neutral: the few frames from the hidden tab are still in the video, scaled to the recording's size. They only
  last until the runner switches tabs.

### Confirmation

- `test/recording-screenshot-coverage.test.js`: `dominantFrameSize` picks the size that covers the most time, weighs
  by time rather than frame count, and returns `null` for one size or no frames. With real ffmpeg, `stopRecording`
  turns a WebM of 0.3 s at 940x640, 3 s at 1024x582, and 0.2 s at 940x640 into a 1024x582 MP4. Before this change it
  came out 940x640.
- Fixture `test/core-artifacts/recording/headless-chrome.spec.json`: `headless-chrome-auto-engine` and now
  `headless-chrome-browser-engine` assert the viewport's width, and a height no taller than the viewport, on Windows,
  macOS, and Linux.

## Pros and Cons of the Options

### A. Transcode to the frame size that covers the most time

- Good: independent of frame timing, platform, and headed or headless mode.
- Good: testable without a browser, with a WebM ffmpeg builds.
- Bad: an extra decode pass.

### B. Open the recorder in its own window

- Good: the captured tab never goes to the background in headless Chrome, at start or stop.
- Bad: the first frame can still predate the sharing bar. In headless Chrome 150 on Windows, it did in three of
  three tries, so videos would come out stretched more often than today.
- Bad: no help for headed Chrome, where a window on top of the captured one hides it.

### C. Start `MediaRecorder` once the recorder tab is hidden

- Good: no extra decode.
- Bad: a frame captured just before the switch can still arrive after the start, so it narrows the race but doesn't
  close it.
- Bad: if the recorder tab never goes to the background, nothing is recorded.

### D. Ask for an exact size

- Good: every frame is one size.
- Bad: the sharing bar leaves black bars in every recording.
