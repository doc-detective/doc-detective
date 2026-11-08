---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Record headless Chrome by tab capture, and use Chrome by default

## Context and Problem Statement

Contexts run headless by default, and a headless browser can't be recorded. The `browser` engine captured a
window chosen by title (`--auto-select-desktop-capture-source`), and a headless browser has no window. The `ffmpeg`
engine captures the screen, where a headless browser draws nothing. So every `record` step in a default context was
SKIPPED, and `coerceRecordContextBrowser` forced a `record` context that named no browser onto headed Chrome to dodge
that. Forcing headed Chrome surprised people on CI hosts with no display, and it made the recording contexts the only
ones that opened a window.

A context that names no browser used Firefox first. Runtime-needs inference already assumed Chrome, so the two
disagreed about which browser to install up front.

Chrome can capture a tab without a window: `--auto-select-tab-capture-source-by-title=<title>` makes
`getDisplayMedia` pick the tab whose title matches, headless included. A spike showed that the capture keeps running
across a navigation of the captured tab.

How should headless contexts record, and which browser should a context get when it names none?

## Decision Drivers

- The default context (headless, no browser named) should be able to record.
- Recording shouldn't need a display, Xvfb, or the run serialized on a display mutex.
- A context should run the browser and mode its author wrote, or the documented default, never a hidden override.
- The default browser and runtime-needs inference should agree.

## Considered Options

- **A. Tab capture in headless Chrome, with the existing `browser` engine; Chrome first by default.**
- **B. Chrome DevTools screencast** (`Page.startScreencast`), assembled into a video by ffmpeg.
- **C. Keep forcing headed Chrome**, and record it on a virtual display on Linux.

## Decision Outcome

Chosen option: **A**.

| Behavior | Before | Now |
|---|---|---|
| Browser for a context that names none | Firefox, then Chrome, then Safari | Chrome, then Firefox, then Safari |
| `record` on headless Chrome | SKIPPED | Records the tab with the browser engine, sized to the viewport, across navigations |
| `record` on headless Firefox or Safari | SKIPPED | SKIPPED, with a message that names both fixes |
| A `record` context with no browser | Forced to headed Chrome | Headless Chrome |
| Headless Chrome recording under concurrency | Takes the display mutex and needs Xvfb | Runs in parallel, with no display |

- `getDriverCapabilities` adds `--auto-select-tab-capture-source-by-title=<capture title>` to headless Chrome. The
  capture title is the per-process, per-context title from ADR 01076, so concurrent contexts and concurrent runs
  each capture their own tab.
- The recorder asks `getDisplayMedia` for the viewport's size in device pixels. Without that, tab capture records at
  800x600.
- A `record` step with no engine resolves to the `browser` engine on any Chrome context, headed or headless.
  `startRecording` no longer SKIPs the browser engine on headless Chrome. It still SKIPs the browser engine on any
  other browser.
- The concurrency planner (`jobIsFfmpegRecording`, `contextHasAnyFfmpegRecordStep`) treats a headless Chrome
  browser-engine recording like a headed one: no display, no Xvfb, no serialization. A second overlapping browser
  recording still falls back to ffmpeg, as before.
- `coerceRecordContextBrowser` is gone. Instead, `prepareContextSlot` gives a context that names no browser the
  default browser before the concurrency calculation, as `runContext` and the warm-up already did later. So the
  planner sees the browser that will run.
- `getDefaultBrowser` and `buildFallbackCandidates` share one order: Chrome, Firefox, Safari. The warm-up phase
  reads it through its injected `getDefaultBrowser`.
- `stopRecording` copies the finished WebM out of the recorder tab through WebDriver, in base64 chunks of 4 MiB
  (`saveBrowserRecording`), instead of having Chrome download it. The recorder keeps the blob on the page. If the
  page doesn't finish the recording within 20 seconds, the step fails with `Couldn't save the recording: the
  browser didn't finish it within 20 seconds.` That replaces `Recording download timed out.`
- An ffmpeg recording of a headless browser is SKIPPED even when the context has a virtual display (Xvfb). A
  headless browser doesn't draw on that display, so the video would be blank. So the old message, `Recording
  isn't supported in headless mode without a virtual display (Xvfb).`, which pointed at Xvfb as the fix, is
  replaced everywhere by one that names the browser and the fixes that work: `Skipped: a headless <browser>
  can't be screen-recorded. Set the context's \`headless\` to \`false\`, or use Chrome, which records headless.`
  `<browser>` is the display name, Chrome or Firefox. A context launches headless unless `headless` is `false`, so
  an omitted `headless` counts as headless here too. Safari has no headless mode, so it's never skipped this way.
- A failed copy of the browser recording closes the recorder tab and restores focus all the same, removes any
  partial file, and says why: the browser didn't finish within 20 seconds, recorded no video, sent too few bytes,
  or the copy itself failed.

### Checks made while deciding

- **Headless Chrome on Windows** (Chrome 150): the auto engine, the explicit browser engine, and a recording across
  a `goTo` all record. The track reports `displaySurface: "browser"` from a `web-contents-media-stream` source.
  Without the size constraints the track is 800x600. With them it's the viewport's size.
- **Chrome's download of the recording.** The recorder used to save its blob with an anchor-click download into the
  per-context download folder. In headless Chrome that download never landed for about a third of recordings, on
  Windows, though the blob was complete in the page (instrumented: the recorder had stopped, and the blob held
  45–87 KB). Keeping the blob URL alive didn't help. A fixture already noted the same timeout headed, for a
  recording that starts before the first navigation. Copying the blob through WebDriver passed 28 of 28 such
  recordings, before and after cross-origin navigations, headless.
- **Chrome's tab-sharing bar.** While a tab is captured, Chrome shows its sharing bar on that tab, headed or headless,
  which shortens the page's viewport by about 58 px. A 1024x640 viewport records as 1024x582. When the first
  encoded frame predates the bar, the transcode scales the shorter frames to the first frame's size, so a video can
  come out at the full viewport height, slightly stretched. Headed recordings already behaved this way. Fixtures
  assert the viewport's width and a height no taller than the viewport, not an exact height.
- **Headed Chrome with both flags (DB4).** Headed Chrome already captures a tab: with
  `--auto-select-desktop-capture-source` alone the source is a `web-contents-media-stream`, not a window. With both
  flags it records the same way on Windows. Whether the tab flag removes the need for macOS Screen Recording
  permission couldn't be checked on Windows. So the tab flag goes only on headless Chrome, the conservative choice,
  and headed recordings keep their current flag and their permission guidance. Passing it always is a follow-up
  once a macOS host without Screen Recording permission confirms it.
- **Headless Firefox on a Linux Xvfb display.** A headless browser doesn't render to any X display, so ffmpeg would
  capture an empty screen. That's why the ffmpeg guard above now SKIPs it. It wasn't checked on a Linux host here.
  The Linux fixture jobs exercise the SKIP.

### Consequences

- Good: the default context records, on every desktop platform, with no display and no extra install.
- Good: headless Chrome recordings run in parallel under `concurrentRunners`.
- Good: the default browser matches the browser runtime-needs inference installs.
- Bad: a context that names no browser now runs Chrome, not Firefox. Its screenshots and timings can change. The
  upgrade guide says to name `firefox` to keep it.
- Bad: a `record` context that named no browser used to run headed. It now runs headless, so a reference video or
  checkpoint taken headed can differ.
- Neutral: Chrome's tab-sharing bar shortens the viewport during a recording, as it already did headed.

### Confirmation

- `test/ffmpeg-recorder.test.js`: `resolveRecordPlan` resolves headless Chrome to `browser`; `jobIsFfmpegRecording`
  is false for a headless Chrome browser-engine recording, and true for a second overlapping one; the routed
  over-approximation counts headless Chrome; `coerceRecordContextBrowser` is no longer exported.
- `test/context-resolution.test.js`: `getDriverCapabilities` adds the tab flag headless and leaves it off headed;
  `getDefaultBrowser` puts Chrome first, then Firefox, then Safari; `prepareContextSlot` gives a `record` context
  with no browser `{ name: "chrome" }`, headless, and leaves non-browser and mobile contexts alone.
- `test/browser-fallback.test.js`: fallbacks follow Chrome, Firefox, Safari.
- `test/recording-screenshot-coverage.test.js`: the browser engine on headless Chrome starts a `MediaRecorder`
  recording and passes the viewport size to the recorder; an ffmpeg recording of a headless browser with a virtual
  display is SKIPPED; `saveBrowserRecording` writes the page's recording chunk by chunk, and a recording the page
  never finishes fails the `stopRecord` step with the 20-second message.
- Fixture `test/core-artifacts/recording/headless-chrome.spec.json`: the auto engine, the explicit browser engine,
  and a recording across a navigation on headless Chrome PASS on Windows, macOS, and Linux; headed Chrome PASSes on
  Windows and macOS; headless Firefox is SKIPPED everywhere. The browser-engine permutations in
  `recording.spec.json` and `recording-permutations.spec.json` also run on Linux headless Chrome now.

## Pros and Cons of the Options

### A. Tab capture with the browser engine

- Good: no new engine, no new dependency. The `MediaRecorder` path, the per-context capture title, and the WebM
  transcode are reused.
- Good: works with no display on every platform, so it parallelizes.
- Bad: Chrome only. Headless Firefox and Safari still can't record.
- Bad: tab capture records the tab's content, not the browser UI.

### B. DevTools screencast

- Good: no `getDisplayMedia` and no sharing bar.
- Bad: frames arrive only when the page repaints, at irregular intervals, so the video needs re-timing.
- Bad: a new capture pipeline to build, with its own encoder handling and tests.

### C. Force headed Chrome on a virtual display

- Good: no change to the capture code.
- Bad: needs Xvfb on Linux and a desktop session on Windows and macOS.
- Bad: serializes recordings on the display, and keeps a hidden override of the author's headless setting.
