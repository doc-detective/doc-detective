---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# App window and device recording (phase A7)

## Context and Problem Statement

Phases A1–A6 made native apps first-class step targets, in ADRs 01021–01031.
But `record` stayed browser-shaped. The `record.surface` schema admitted only
browser references. An app-only context recorded the full host display, with no
way to target a named app surface. And mobile app contexts had no recording
story at all. Two standing threads fold into this phase. First, issue #220,
"recording for all apps". ffmpeg already captures any application, but nothing
exposed that per app surface. Second, the scaling gap found in A2, ADR 01023.
The window-crop scaler probed `devicePixelRatio` through browser-JS `execute`,
which the native drivers, NovaWindows and Mac2, can't answer. So it silently
fell back to 1. That's correct on scale-1 displays. But on a Retina or scaled
display the capture is in physical pixels while `getWindowRect` returns points,
landing the crop half-sized and misplaced.

How should `record` target app surfaces on desktop? How should mobile contexts,
meaning Android emulators and iOS simulators, record at all? And how should the
crop scale be derived without a DOM probe?

## Decision Drivers

- One authoring model: the same `record`/`stopRecord` steps, LIFO stack, named
  stops, and output formats across browser, desktop app, and mobile contexts.
- Every schema change is additive; driver taxonomy must not leak into the
  user schema (the A1 adapter-seam rule).
- Scheduler correctness. The static concurrency planner, `jobIsFfmpegRecording`,
  must stay in lock-step with runtime engine resolution. Work that doesn't touch
  the host display must not serialize on the display mutex.
- Fixtures must land PASS or SKIPPED on every CI leg. Unsupported combinations
  resolve as guided SKIPs, rather than failures.
- Headless-capable: managed Android emulators run headless in CI; a recording
  path that needs a host window would be unusable exactly where CI runs.

## Considered Options

1. **Mobile recording mechanism.** Either (a) host-ffmpeg capture of the
   emulator or simulator window, or (b) the Appium drivers' native
   `startRecordingScreen` and `stopRecordingScreen`. That's adb screenrecord on
   UiAutomator2, and simctl-backed on XCUITest.
2. **Crop scale source.** Three options:
   - (a) Keep the DOM `devicePixelRatio` probe, with fallback 1.
   - (b) Probe OS display APIs at start time.
   - (c) Store the window rect unscaled, and derive the scale at stop time. That
     divides the capture frame size, parsed from the capture ffmpeg's own
     stderr, by the display's size in points.
3. **`viewport` target on an app surface**: schema-reject (`if/then`), FAIL,
   or SKIP with guidance.
4. **Device engine exposure**: a user-selectable `engine: "device"` enum value
   vs. an internal plan that mobile platforms auto-route to.
5. **Schema `target` default**: keep `"default": "display"` vs. remove it and
   document the context-dependent default.

## Decision Outcome

Chosen: **driver-native device recording (1b)**. **Stop-time frame-derived
scale (2c)**. **SKIP with guidance (3)**. **An internal device plan (4)**. And
**the default removed from the schema (5)**.

- `record.surface` gains the existing `app` branch, the same shape as
  `find` and `screenshot`. A record targeting an app surface resolves to the
  ffmpeg engine, with a **`window` target by default**. That's a full-display
  capture, cropped at stop time to that app's window. `target: "display"` opts
  out. Desktop app recordings join the display mutex unchanged, since they are
  ffmpeg captures of the shared display.
- **Mobile contexts, android and ios, record the device screen through the app
  driver.** That's the internal `device` plan. The video arrives base64 on
  `stopRecordingScreen`. `.mp4` targets are written directly, and other formats
  go through the shared transcode. Device recordings hold no host display, so
  they are exempt from the display mutex end-to-end. `jobIsFfmpegRecording`,
  `contextHasAnyFfmpegRecordStep`, and browser coercion all treat mobile
  contexts as never-ffmpeg. autoRecord on mobile drops its ffmpeg pin. A
  record step that runs before any device session exists leaves a pending
  handle that the first `startSurface` late-starts.
- **Crop scale.** App-window rects are stored unscaled, with a pending-scale
  marker. At stop time on macOS the scale is
  `captureFrameSize ÷ displaySizeInPoints`, clamped to [1, 4]. The frame size is
  parsed eagerly from the capture ffmpeg's stderr head, and display points come
  from a JXA `NSScreen` probe. On Windows and Linux the scale is 1 by
  construction. UIA rects and gdigrab both use physical desktop pixels, and X11
  coordinates are pixels. Any missing input degrades to 1, today's behavior.
  Browser-driver crops keep the working DOM probe.
- **Unsupported combinations SKIP with the fix named.** Those are an explicit
  `engine: "ffmpeg"` or `"browser"` on a mobile context, the browser engine on
  an app surface, and `viewport` on an app surface. It's a SKIP rather than a
  schema-reject, because the invalidity depends on a sibling field and the
  runtime context. An `if/then` schema shape would harden a driver detail into
  the user contract. It's a SKIP rather than a FAIL, mirroring the existing
  explicit-browser-engine-on-incapable-context precedent, and keeping fixtures
  green.
- **`engine.target` loses its schema default.** ajv doesn't inject it on the
  step path today. But the generated reference docs would state a now-wrong
  unconditional default, and shared schemas stay default-free by convention,
  given the `useDefaults` injection hazard. The default is documented in the
  description, and applied by `resolveRecordPlan`. That's `window` for app
  surfaces, and `display` otherwise. A validate test pins that no default is
  injected.

Closes #220. Issue #345, hiding non-test windows during desktop capture,
stays open and out of scope. Desktop app-window recordings can still show
overlapping windows inside the crop, documented as a known limitation.

### Consequences

- Good: one `record` vocabulary across all surface kinds. Mobile recordings
  run under full concurrency, with no display mutex, and work on headless
  emulators, where host capture would see nothing.
- Good: Retina/scaled macOS app recordings crop correctly; the scale
  derivation is measurement-based and self-limiting (clamped, fallback 1).
- Trade-off: device recordings cap at 30 minutes, at `timeLimit: 1800`, the
  drivers' maximum. They arrive base64 over HTTP, so long recordings spike
  memory. That's documented.
- Trade-off: only one device recording can run per device at a time, since
  screenrecord is single-instance. Overlap and LIFO permutations are
  desktop-only. A second overlapping device record on the same device SKIPs
  with guidance before touching the driver. A review round added that guard, to
  keep the driver's single-instance limit from restarting or rejecting the
  active recording.
- Trade-off: the macOS point-size probe assumes the capture targets the main
  screen. Multi-display setups with per-display scale factors may still
  mis-scale, a documented limitation.
- The Windows scale=1 assumption, UIA physical px ÷ gdigrab physical px, is
  encoded in `deriveCropScale`. It was verified empirically during
  implementation on a 3840×2160 display at 175 % scale. The window crop bound
  exactly to the app window, at 816×766 physical px on a 4K capture. If a
  mixed-DPI configuration ever disproves it, a Windows display probe slots into
  the same derive seam without reshaping handles.

### Confirmation

- Unit tests span several files. `test/app-recording.test.js` covers surface
  routing, the device engine, the appium stop, pending handles, and stop-time
  scale application through a real ffmpeg transcode.
  `test/ffmpeg-recorder.test.js` covers plan resolution, scheduler exemptions,
  `parseCaptureFrameSize`, and `deriveCropScale`. `test/app-surface.test.js`
  covers the late-bound unscaled crop and mobile late-start.
  `test/run-artifacts.test.js` covers mobile autoRecord unpinning ffmpeg. And
  `src/common/test/validate.test.js` covers the schema branch, plus no default
  injection.
- Fixtures are all runOn-gated, PASS or SKIPPED.
  `test/core-artifacts/apps/app-recording.spec.json` covers Windows: the
  default window crop, explicit display, the viewport SKIP, and named plus LIFO
  overlap. `apps/app-recording-macos.spec.json` covers macOS, including
  autoRecord overlap and the derived-scale path on avfoundation.
  `apps-android/android-recording.spec.json` covers .mp4 direct write, .webm
  and .gif transcode, and autoRecord late-start. And
  `apps-ios/ios-recording.spec.json` covers .mp4 plus autoRecord on simulators.

## Pros and Cons of the Options

### Mobile: host-ffmpeg capture of the emulator window

- Good: one capture engine everywhere.
- Bad: headless emulators (the CI norm) have no host window to capture.
- Bad: captures window chrome and host UI; fragile window tracking.
- Bad: keeps mobile recordings display-mutex-bound, serializing runs that
  have no host-display contention at all.

### Mobile: driver-native startRecordingScreen (chosen)

- Good: captures the device frame exactly, headless-safe, concurrent.
- Good: no new dependencies, since the drivers already ship it.
- Bad: 30-minute cap, base64 transport memory spike, one recording per
  device at a time.

### Scale: keep the DOM probe

- Good: no new code.
- Bad: silently wrong on every Retina or scaled display for app windows. That
  leaves the A2 gap unfixed.

### Scale: OS display APIs at start time

- Good: authoritative per-display values.
- Bad: a platform API surface per OS, and per multi-display arrangement, just
  to learn what the capture itself already reveals. Start-time probing also
  races display changes.

### Scale: capture-frame-derived at stop time (chosen)

- Good: it measures the actual capture, the definitionally correct numerator.
  One small JXA probe is the only OS-specific piece.
- Bad: it depends on parsing ffmpeg stderr, with a bounded head buffer and a
  first-match input stream line. It also assumes the main screen on macOS.

### viewport-on-app: schema-reject / FAIL / SKIP (chosen: SKIP)

- Schema-reject. Good: authors learn at validation time. Bad: it needs an
  `if/then` coupling the `surface` and `engine.target` shapes, hardening a
  runtime detail into the contract.
- FAIL. Good: it's loud. Bad: it breaks the fixtures-never-FAIL policy. The
  unsupported-combination case is one startRecording already SKIPs elsewhere,
  as with a headless browser engine or a non-Chrome browser engine.
- SKIP with guidance (chosen). It's consistent with both precedents, and the
  description names the fix.

### Device engine: schema-exposed vs. internal (chosen: internal)

- Exposed. Good: it's discoverable. Bad: it leaks driver taxonomy into the
  schema, and authors could pin `device` on desktop contexts where it's
  meaningless.
- Internal (chosen). The platform already implies it. `engine` stays a
  desktop-capture knob, and mobile docs say to omit it.
