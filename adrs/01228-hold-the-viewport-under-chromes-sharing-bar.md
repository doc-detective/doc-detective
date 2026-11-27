---
status: accepted
date: 2026-11-26
decision-makers: doc-detective maintainers
---

# Hold the viewport under Chrome's sharing bar

Amends [ADR 01176](01176-record-headless-chrome-by-tab-capture-and-use-chrome-by-default.md) and
[ADR 01197](01197-size-a-browser-recording-by-its-steady-frames.md).

## Context and Problem Statement

The `browser` recording engine captures a Chrome tab with `getDisplayMedia`. While a tab is captured, Chrome shows its
sharing bar on that tab, headed or headless. The bar shortens the page by about 58 px. ADR 01176 accepted that:
an 800x600 viewport recorded as 800x542, and a 1024x768 viewport as 1024x710. Screenshots taken outside a recording
were 800x600, and ones taken during it were 800x543. So `verify.resolution: { width, height }` couldn't assert the
viewport an author configured, and a page under recording rendered at a size nobody asked for.

How should the browser engine keep a recorded page at its viewport's size?

## Decision Drivers

- The video, and the page while it's recorded, should be the configured viewport's size.
- `verify.resolution` should be able to assert that size.
- Steps after `stopRecord` should see the viewport they saw before `record`.

## Considered Options

- **A. Grow the window by the bar's height while recording.** After the capture starts, wait for the bar to shorten
  the page, then resize the window until the viewport is its pre-capture size. `stopRecord` puts the window back.
- **B. Hide the bar.** Chrome has no command-line switch or capture option that hides the tab-sharing bar.
- **C. Keep the shorter video** (ADR 01176) and document it.

## Decision Outcome

Chosen option: **A**, because it's the only one that gives the configured size with today's Chrome.

| Recording an 800x600 viewport | Before | Now |
|---|---|---|
| Video | 800x542 | 800x600 |
| Screenshot during the recording | 800x543 | 800x600 |
| Screenshot after `stopRecord` | 800x600 | 800x600 |

- `holdViewportUnderSharingBar` in `src/core/utils.ts` polls the viewport for up to 1 second. When it changes, it
  calls `realizeViewport` to grow the window back to the pre-capture viewport, and returns the window size from
  before. When it doesn't change, it does nothing.
- `startRecording` stores that size on the recording handle as `restoreWindow`. `stopRecording` restores it after it
  closes the recorder tab, on every exit path.
- In headed Chrome, the display can be too small for the taller window. Then the video stays about 58 px short, as
  before. The runner warns once per recording, with how many pixels short the video is and the fix.

### Consequences

- Good: a browser recording is the viewport's size, and `verify.resolution` can assert it.
- Good: screenshots during a recording match screenshots outside it.
- Bad: the window is taller than before while a recording runs. A page that reads `outerHeight` sees the change.
- Bad: an exact `verify.resolution` still fails in headed Chrome when the display can't fit the taller window. The
  `record` page says to run headless, use a smaller viewport, or use `verify.resolution: true` there.
- Bad: when no bar appears, starting a recording waits up to 1 second longer.
- Neutral: frames from before the resize are the bar-shortened size. ADR 01197's transcode sizes the video by the
  frames that cover the most time, so they're scaled to the viewport's size.

### Confirmation

- `test/recording-sharing-bar.test.js`: the helper grows the window by the bar's height and returns the size to
  restore. It does nothing when no bar appears or no viewport is known. A window that can't grow enough logs one
  warning, and one that can logs none.
- Fixture `test/core-artifacts/recording/headless-chrome.spec.json`: `headless-chrome-auto-engine` and
  `headless-chrome-browser-engine` assert a 1024x640 video with `verify.resolution`. `headless-chrome-viewport-held`
  asserts an 800x600 video, and 800x600 screenshots during and after the recording.

## Pros and Cons of the Options

### A. Grow the window while recording

- Good: the page and the video are the configured size.
- Bad: the window changes size twice per recording.

### B. Hide the bar

- Bad: Chrome offers no way to.

### C. Keep the shorter video

- Good: no change.
- Bad: `verify.resolution` can't assert the configured viewport, and the page renders at another size while recorded.
