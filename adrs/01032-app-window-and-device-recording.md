---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# App window and device recording (phase A7)

## Context and Problem Statement

Phases A1–A6 made native apps first-class step targets (ADRs 01021–01031), but
`record` stayed browser-shaped: the `record.surface` schema admitted only
browser references, an app-only context recorded the full host display with no
way to target a named app surface, and mobile app contexts had no recording
story at all. Two standing threads fold into this phase: issue #220 ("recording
for all apps" — ffmpeg already captures any application, but nothing exposed
that per app surface) and the scaling gap found in A2 (ADR 01023): the
window-crop scaler probed `devicePixelRatio` via browser-JS `execute`, which
the native drivers (NovaWindows, Mac2) can't answer, so it silently fell back
to 1 — correct on scale-1 displays, but on a Retina/scaled display the capture
is in physical pixels while `getWindowRect` returns points, landing the crop
half-sized and misplaced.

How should `record` target app surfaces on desktop, how should mobile contexts
(Android emulators, iOS simulators) record at all, and how should the crop
scale be derived without a DOM probe?

## Decision Drivers

- One authoring model: the same `record`/`stopRecord` steps, LIFO stack, named
  stops, and output formats across browser, desktop app, and mobile contexts.
- Every schema change is additive; driver taxonomy must not leak into the
  user schema (the A1 adapter-seam rule).
- Scheduler correctness: the static concurrency planner
  (`jobIsFfmpegRecording`) must stay in lock-step with runtime engine
  resolution, and work that doesn't touch the host display must not serialize
  on the display mutex.
- Fixtures must land PASS or SKIPPED on every CI leg — unsupported
  combinations resolve as guided SKIPs, not failures.
- Headless-capable: managed Android emulators run headless in CI; a recording
  path that needs a host window would be unusable exactly where CI runs.

## Considered Options

1. **Mobile recording mechanism**: (a) host-ffmpeg capture of the
   emulator/simulator window, vs. (b) the Appium drivers' native
   `startRecordingScreen`/`stopRecordingScreen` (adb screenrecord on
   UiAutomator2, simctl-backed on XCUITest).
2. **Crop scale source**: (a) keep the DOM `devicePixelRatio` probe with
   fallback 1, (b) probe OS display APIs at start time, vs. (c) store the
   window rect unscaled and derive the scale at stop time from the capture
   frame size (parsed from the capture ffmpeg's own stderr) over the display's
   size in points.
3. **`viewport` target on an app surface**: schema-reject (`if/then`), FAIL,
   or SKIP with guidance.
4. **Device engine exposure**: a user-selectable `engine: "device"` enum value
   vs. an internal plan that mobile platforms auto-route to.
5. **Schema `target` default**: keep `"default": "display"` vs. remove it and
   document the context-dependent default.

## Decision Outcome

Chosen: **driver-native device recording (1b)**, **stop-time frame-derived
scale (2c)**, **SKIP with guidance (3)**, **internal device plan (4)**, and
**default removed from the schema (5)**.

- `record.surface` gains the existing `app` branch (same shape as
  `find`/`screenshot`). A record targeting an app surface resolves to the
  ffmpeg engine with a **`window` target by default** — full-display capture,
  cropped at stop time to that app's window; `target: "display"` opts out.
  Desktop app recordings join the display mutex unchanged (they are ffmpeg
  captures of the shared display).
- **Mobile contexts (android/ios) record the device screen through the app
  driver** — the internal `device` plan. The video arrives base64 on
  `stopRecordingScreen`; `.mp4` targets are written directly, other formats
  go through the shared transcode. Device recordings hold no host display, so
  they are exempt from the display mutex end-to-end (`jobIsFfmpegRecording`,
  `contextHasAnyFfmpegRecordStep`, and browser coercion all treat mobile
  contexts as never-ffmpeg). autoRecord on mobile drops its ffmpeg pin; a
  record step that runs before any device session exists leaves a pending
  handle that the first `startSurface` late-starts.
- **Crop scale**: app-window rects are stored unscaled with a pending-scale
  marker. At stop time the scale is `captureFrameSize ÷ displaySizeInPoints`
  on macOS (frame size parsed eagerly from the capture ffmpeg's stderr head;
  display points via a JXA `NSScreen` probe), clamped to [1, 4]; on Windows
  and Linux the scale is 1 by construction (UIA rects and gdigrab both use
  physical desktop pixels; X11 coordinates are pixels). Any missing input
  degrades to 1 — today's behavior. Browser-driver crops keep the working DOM
  probe.
- **Unsupported combinations SKIP with the fix named**: explicit
  `engine: "ffmpeg"|"browser"` on a mobile context, the browser engine on an
  app surface, and `viewport` on an app surface. SKIP (not schema-reject)
  because the invalidity depends on a sibling field and the runtime context —
  an `if/then` schema shape would harden a driver detail into the user
  contract; SKIP (not FAIL) mirrors the existing explicit-browser-engine-on-
  incapable-context precedent and keeps fixtures green.
- **`engine.target` loses its schema default**. ajv doesn't inject it on the
  step path today, but the generated reference docs would state a now-wrong
  unconditional default, and shared schemas stay default-free by convention
  (`useDefaults` injection hazard). The default is documented in the
  description and applied by `resolveRecordPlan` (`window` for app surfaces,
  `display` otherwise); a validate test pins that no default is injected.

Closes #220. Issue #345 (hiding non-test windows during desktop capture)
stays open and out of scope — desktop app-window recordings can still show
overlapping windows inside the crop; documented as a known limitation.

### Consequences

- Good: one `record` vocabulary across all surface kinds; mobile recordings
  run under full concurrency (no display mutex) and work on headless
  emulators, where host capture would see nothing.
- Good: Retina/scaled macOS app recordings crop correctly; the scale
  derivation is measurement-based and self-limiting (clamped, fallback 1).
- Trade-off: device recordings cap at 30 minutes (`timeLimit: 1800`, the
  drivers' maximum) and arrive base64 over HTTP — long recordings spike
  memory; documented.
- Trade-off: only one device recording can run per device at a time
  (screenrecord is single-instance) — overlap/LIFO permutations are
  desktop-only; a second overlapping device record on the same device SKIPs
  with guidance before touching the driver (review round: the guard keeps
  the driver's single-instance limit from restarting or rejecting the
  active recording).
- Trade-off: the macOS point-size probe assumes the capture targets the main
  screen; multi-display setups with per-display scale factors may still
  mis-scale (documented limitation).
- The Windows scale=1 assumption (UIA physical px ÷ gdigrab physical px) is
  encoded in `deriveCropScale` — verified empirically during implementation on
  a 3840×2160 display at 175 % scale, where the window crop bound exactly to
  the app window (816×766 physical px on a 4K capture). If a mixed-DPI
  configuration ever disproves it, a Windows display probe slots into the
  same derive seam without reshaping handles.

### Confirmation

- Unit: `test/app-recording.test.js` (surface routing, device engine, appium
  stop, pending handles, stop-time scale application through a real ffmpeg
  transcode), `test/ffmpeg-recorder.test.js` (plan resolution, scheduler
  exemptions, `parseCaptureFrameSize`, `deriveCropScale`),
  `test/app-surface.test.js` (late-bound unscaled crop, mobile late-start),
  `test/run-artifacts.test.js` (mobile autoRecord unpins ffmpeg),
  `src/common/test/validate.test.js` (schema branch + no default injection).
- Fixtures: `test/core-artifacts/apps/app-recording.spec.json` (Windows:
  default window crop, explicit display, viewport SKIP, named+LIFO overlap),
  `apps/app-recording-macos.spec.json` (macOS incl. autoRecord overlap and
  the derived-scale path on avfoundation),
  `apps-android/android-recording.spec.json` (.mp4 direct write, .webm/.gif
  transcode, autoRecord late-start), `apps-ios/ios-recording.spec.json`
  (.mp4 + autoRecord on simulators) — all runOn-gated PASS/SKIPPED.

## Pros and Cons of the Options

### Mobile: host-ffmpeg capture of the emulator window

- Good: one capture engine everywhere.
- Bad: headless emulators (the CI norm) have no host window to capture.
- Bad: captures window chrome and host UI; fragile window tracking.
- Bad: keeps mobile recordings display-mutex-bound, serializing runs that
  have no host-display contention at all.

### Mobile: driver-native startRecordingScreen (chosen)

- Good: captures the device frame exactly, headless-safe, concurrent.
- Good: no new dependencies — the drivers already ship it.
- Bad: 30-minute cap, base64 transport memory spike, one recording per
  device at a time.

### Scale: keep the DOM probe

- Good: no new code.
- Bad: silently wrong on every Retina/scaled display for app windows — the
  A2 gap unfixed.

### Scale: OS display APIs at start time

- Good: authoritative per-display values.
- Bad: platform API surface per OS (and per multi-display arrangement) just
  to learn what the capture itself already reveals; start-time probing races
  display changes.

### Scale: capture-frame-derived at stop time (chosen)

- Good: measures the actual capture — the definitionally correct numerator;
  one small JXA probe is the only OS-specific piece.
- Bad: depends on parsing ffmpeg stderr (bounded head buffer, first-match
  input stream line); main-screen assumption on macOS.

### viewport-on-app: schema-reject / FAIL / SKIP (chosen: SKIP)

- Schema-reject — Good: authors learn at validation time. Bad: needs an
  `if/then` coupling `surface` and `engine.target` shapes, hardening a
  runtime detail into the contract.
- FAIL — Good: loud. Bad: breaks the fixtures-never-FAIL policy for an
  unsupported-combination case that startRecording already SKIPs elsewhere
  (headless browser engine, non-Chrome browser engine).
- SKIP with guidance (chosen) — consistent with both precedents; the
  description names the fix.

### Device engine: schema-exposed vs. internal (chosen: internal)

- Exposed — Good: discoverable. Bad: leaks driver taxonomy into the schema;
  authors could pin `device` on desktop contexts where it's meaningless.
- Internal (chosen) — the platform already implies it; `engine` stays a
  desktop-capture knob and mobile docs say to omit it.
