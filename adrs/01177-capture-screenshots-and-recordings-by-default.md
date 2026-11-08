---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Capture screenshots and recordings by default

Amends [ADR 00173](00173-autoscreenshot-and-runfolder-reporter.md) and
[ADR 00175](00175-autorecord-and-overlapping-recordings.md).

## Context and Problem Statement

`autoScreenshot` and `autoRecord` were off unless set. They produce a screenshot after every step and a video of
every context. That evidence is what people reach for after a failure, and by then the run is over. Most users
never found the keys.

Turning them on by default raises its own questions:

- **What "unset" means.** The schema filled `false`, so the runner couldn't tell unset from off.
- **Where the files go.** They land in the run folder, but the `runFolder` reporter ran only when `reporters`
  listed it.
- **Which hosts can record.** autoRecord was pinned to the `ffmpeg` engine, which needs a display. Headless
  contexts, the default, SKIPPED. A macOS host without Screen Recording permission FAILed the step.
- **Which steps get screenshots.** Only browser steps did. Native app and device steps got none.

When should Doc Detective capture on its own, and how does a host that can't record behave?

## Decision Drivers

- A default run leaves the evidence behind, with nothing to configure.
- A host that can't record never fails a test because of a recording nobody asked for.
- An explicit `true` keeps meaning "I want this", and says so when it can't happen.
- One key, at the config, spec, and test levels, turns each off.

## Considered Options

- **A. On unless `false`, with a recording preflight, and the run folder whenever either is on.**
- **B. On by default only in CI.**
- **C. Keep them off, and add a hint.**

## Decision Outcome

Chosen option: **A**.

| Value | Before | Now |
|---|---|---|
| `autoScreenshot` unset | off | a screenshot after every step that drives a browser, native app, or device, headless included |
| `autoRecord` unset | off | the context table below |
| `true` | on | on. `autoRecord: true` stays strict: see the preflight table |
| `false` | off | off |

| Context, with `autoRecord` unset or `true` | Automatic recording |
|---|---|
| Headed browser (Windows, macOS, Linux) | ffmpeg screen capture, as before |
| Native app (Windows, macOS) | ffmpeg screen capture, as before |
| iOS or Android app, or mobile web | The device recording, as before |
| Headless Chrome, no authored `record` | Browser engine (tab capture, ADR 01176) |
| Headless Chrome with an authored `record` | None: the author's recording wins, since the browser engine allows one recording per context |
| Headless Firefox, when the preflight passes | Runs headed (on Xvfb on Linux when it's installed), then ffmpeg screen capture |
| Headless Firefox, when the preflight fails | Stays headless. Unset: none. `true`: SKIPPED with the preflight's reason |
| No driver steps | None |

- **Where the defaults live.** At the consumption site, not in `config_v3`, so unset is detectable (the
  `exitOnFail` pattern). `resolveAutoScreenshot` and `resolveAutoRecord` return `undefined` when unset, and every
  caller treats it as on. The schema descriptions lead with "Defaults to `true`."
- **The run folder.** The `runFolder` reporter runs whenever `runArchivesArtifacts` is true: `runFolder` is listed,
  or either key is on (unset or `true`) at any level. `runSpecs` reserves the folder then, and `outputResults` adds
  the reporter when that folder exists, logging `Added the runFolder reporter because autoScreenshot or autoRecord
  is on.` at debug.
- **The recording preflight** (`recordingPreflight` and `planRecordingPreflight` in `ffmpegRecorder.ts`). Once per
  run, before any test, and only for the engines the run will record with:

  | Engine | Checks | On failure |
  |---|---|---|
  | Every engine | The managed ffmpeg resolves and runs `-version` | `ffmpeg isn't available (<cause>)`; fix: ``run `doc-detective install runtime @ffmpeg-installer/ffmpeg` `` |
  | ffmpeg on Windows | A one-frame `gdigrab` capture with the recorder's own input arguments | `ffmpeg can't capture the desktop (<cause>)`; fix: `run Doc Detective in a signed-in desktop session, not as a service` |
  | ffmpeg on macOS | Screen Recording permission (`CGPreflightScreenCaptureAccess`; an inconclusive probe never fails), then a screen device (fails only when a completed device listing shows no screen) | the permission, or `ffmpeg can't see a screen to capture` |
  | ffmpeg on Linux | A one-frame `x11grab` capture of `DISPLAY`, or Xvfb on `PATH` | `there's no display to capture`; fix: `install Xvfb or set DISPLAY` |

  The Linux result also carries whether Xvfb is available, which replaces the separate Xvfb probe. Android
  device recordings get no check: the device records itself, and the existing context preflight already checks
  `adb`. iOS needs only the ffmpeg row.
- **Failed checks.** With `autoRecord` unset, no automatic recording is added where the check applies, and the
  run prints one warning per cause: `Not recording automatically: <reason>. To record, <fix>, or set
  \`autoRecord: false\` to stop checking.` With `true`, or for an authored `record`, the step is SKIPPED:
  `Skipped: <reason>. To record, <fix>, and rerun.`
- **A start that fails after the checks pass.** An automatic recording added while unset is tagged
  `__autoRecordDefaulted`, and its failure becomes SKIPPED: `Skipped: couldn't start the automatic recording:
  <cause>. Set \`autoRecord: false\` to turn it off.` The handle keeps the tag, so a defaulted recording that
  can't be saved at the end is SKIPPED the same way: `Skipped: couldn't save the automatic recording: <cause>. …`.
  Explicit recordings still FAIL.
- **Headless Firefox runs headed** when autoRecord is on and the ffmpeg check passed. `prepareContextSlot` sets
  `headless: false` before the browser launches, and the report shows it. One info line per run:
  `Running 2 headless Firefox contexts headed so autoRecord can record them. Set \`autoRecord: false\` to keep them
  headless.` (With one context, the line is singular.) On Linux with Xvfb installed, the context's Appium server owns an
  Xvfb display, so the window is invisible. With only `DISPLAY`, the window opens on that display.
- **Concurrency.** Only an explicit `autoRecord: true` opts the run into overlapping ffmpeg captures on a shared
  display (ADR 00175). A defaulted recording keeps the safe serial display.
- **UI auto screenshots.** After each step, the runner resolves the surface the step drove, the same way the
  handler did (`autoScreenshotSurface`), and captures it through `saveScreenshot`. Only a step whose handler
  resolves surfaces, or that names a `surface`, follows the active surface. Any other step captures the browser
  when the context has one. App and device steps are captured through their app driver, since Appium sessions
  answer `takeScreenshot` like browsers. A step that resolves no browser or app (`runShell`, `httpRequest`,
  `wait`, a background process) gets no shot. The synthetic recording steps get no shot and aren't counted, in
  the image numbering or in `summary.steps`, so the first authored step's image is `01-…`.
- **Runtime packages.** When a UI step runs, `inferRuntimeNeeds` adds ffmpeg unless `autoRecord` is `false`. It
  also adds sharp, pngjs, and pixelmatch unless `autoScreenshot` is `false`. They then install before the first
  test. When only automatic screenshots need the image packages, they install separately. A failure turns
  automatic screenshots off for the run, through a flag on the run's resolved config, which the runner reads. It
  warns: `Not taking automatic screenshots: couldn't install sharp (<cause>). Run \`doc-detective install runtime
  sharp pngjs pixelmatch\`, or set \`autoScreenshot: false\`.`
- **Flags.** `--[no-]auto-screenshot` and `--[no-]auto-record` stay. Their help text is "Capture a screenshot
  after each UI step [on]" and "Record a video of each context that drives a UI [on]". They set only the config
  level, so a spec's or test's `true` wins.
- **Hints.** `enableAutoScreenshot` and `enableAutoRecord` are gone. `gitignoreOutputDir` now checks
  `.doc-detective/` when `outputDir` is `.`.
- **Fixture configs.** `config.groups.json` and `config.json` set `autoRecord: false`, because they pin headless
  Firefox: the default would make every Firefox fixture a headed, serialized recording. They keep the
  `autoScreenshot` default. Dedicated fixtures cover the recording default.

### Consequences

- Good: every default run leaves screenshots, a video per context, and the run folder.
- Good: a host that can't record runs its tests anyway, and says why once.
- Bad: default runs are slower and write more. Headless Firefox opens a window on Windows and macOS when it can
  be recorded. `autoRecord: false` restores the previous behavior; both `false` restores version 4's.
- Bad: `-r junit` now also writes the run folder. The upgrade guide shows how to turn it off.
- Neutral: nothing prunes old run folders. The docs and the `gitignoreOutputDir` hint cover `.doc-detective/`.

### Confirmation

- `src/common/test/validate.test.js`: `config_v3` leaves both keys unset.
- `test/utils.test.js`: `setConfig` leaves both keys unset when no flag is given.
- `test/run-artifacts.test.js`: `runArchivesArtifacts` treats unset as on. `outputResults` adds the `runFolder`
  reporter when the run reserved its folder. The resolvers return `undefined`. `buildAutoRecordStep`'s engine
  table, the defaulted tag, and the preflight skip. Android device recordings need no check. Synthetic steps stay
  out of `summary.steps`.
- `test/recording-preflight.test.js`: each failing check, and an inconclusive macOS probe or device listing. The
  browser and device engines need only ffmpeg, the probes run once, and none run when nothing records.
- `test/context-resolution.test.js`: headless Firefox runs headed only when the preflight passed and autoRecord
  isn't `false`; Chrome stays headless; the info line.
- `test/recording-screenshot-coverage.test.js`: a failed preflight SKIPs a recording; a defaulted start or save
  failure is SKIPPED, and a strict one still FAILs.
- `test/auto-screenshot-surface.test.js`: an app step captures the app, and an app-only context gets shots. A
  browser-only step captures the browser whatever surface is active, and `runShell` gets none. A failed
  image-package install warns once and takes no automatic screenshots.
- `test/runtime-infer-needs.test.js` and `test/hints.test.js`.
- Fixtures: `cli/auto-capture-defaults.spec.json`, `recording/autorecord-defaults.spec.json`, and
  `recording/record-preflight.spec.json`.

## Pros and Cons of the Options

### A. On unless `false`, with a preflight

- Good: the evidence is there when it's needed, with no setup.
- Good: an unset default degrades quietly, and an explicit `true` stays strict.
- Bad: more disk, more time, and a window for recorded headless Firefox.

### B. On only in CI

- Good: local runs stay fast.
- Bad: CI detection is a guess, and the same spec behaves differently in two places.

### C. Off, with a hint

- Good: nothing changes for anyone.
- Bad: the hint already existed, and the evidence still wasn't there when a run failed.
