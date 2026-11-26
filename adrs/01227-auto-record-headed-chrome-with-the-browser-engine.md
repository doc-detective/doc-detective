---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Auto-record headed Chrome with the browser engine

Amends DA2 of [ADR 01177](01177-capture-screenshots-and-recordings-by-default.md).

## Context and Problem Statement

`autoRecord` picks an engine per context (`autoRecordEngine` in `src/core/tests.ts`). ADR 01177 gave headless
Chrome the `browser` engine, which records its tab ([ADR 01176](01176-record-headless-chrome-by-tab-capture-and-use-chrome-by-default.md)),
and every other desktop context `ffmpeg`, which records the screen. Headed Chrome landed in "every other".

An authored `record` step with no `engine` resolves differently: any Chrome context, headed or headless, gets the
`browser` engine (`resolveRecordPlan`). So the same headed Chrome context recorded its automatic video one way and
its authored video another. The `ffmpeg` path also brought costs the `browser` engine doesn't have in Chrome: the
host screen-capture check (a signed-in desktop on Windows, Screen Recording permission on macOS, a display or Xvfb
on Linux), a video of the whole screen rather than the browser, and display serialization under
`concurrentRunners`.

Which engine should `autoRecord` use for headed Chrome?

## Decision Drivers

- One default engine per browser, whether the recording is automatic or authored.
- Chrome recordings shouldn't depend on the host's screen-capture setup.
- Recordings in parallel contexts shouldn't wait on the shared display.
- The browser engine allows one recording per context, so automatic and authored recordings can't both use it.

## Considered Options

- **A. The `browser` engine for headed Chrome, as for headless Chrome; a Chrome context with an authored `record`
  gets no automatic recording.**
- **B. Keep `ffmpeg` for headed Chrome.**
- **C. The `browser` engine for headed Chrome, plus an `ffmpeg` automatic recording when the context has an
  authored `record`.**

## Decision Outcome

Chosen option: **A**.

`autoRecordEngine` returns `browser` for any context whose browser is Chrome, before the `headless` check. The rule
that a context with an authored `record` gets no automatic recording now covers headed Chrome too.

| Context, with `autoRecord` unset or `true` | Before | Now |
|---|---|---|
| Headed Chrome, no authored `record` | `ffmpeg` screen capture | `browser` engine, which records the Chrome window |
| Headed Chrome with an authored `record` | `ffmpeg` screen capture, alongside the author's | None: the author's recording wins |
| Headed Chrome on a Linux host with no display | With Xvfb installed, runs headed on the run's Xvfb display, `ffmpeg` capture | The headed start fails over to headless, as it does with `autoRecord: false`, and the `browser` engine records the tab |
| Headless Chrome, headless or headed Firefox, Safari, native apps, devices | Unchanged | Unchanged |

What follows from the engine, with no code change of its own:

- **Preflight.** The run's recording preflight plans the `browser` key for headed Chrome, which checks only that
  the managed ffmpeg runs (it transcodes the WebM). The Windows, macOS, and Linux screen-capture checks no longer
  apply to it, so `Not recording automatically: …` no longer names a headed Chrome context's host.
- **Concurrency.** `jobIsFfmpegRecording` is false for a headed Chrome context's automatic recording, so it no longer
  takes the `display` resource, forces the run serial, or asks for Xvfb displays. `autoRecordFlag.injected` still
  opts a run into overlapping `ffmpeg` captures, which now come only from other contexts.
- **Screenshots against a reference.** `saveScreenshot` still lets a defaulted automatic recording through the
  resize-to-reference retake, whatever its engine.

The schema description of `autoRecord` in `config_v3` and the `--auto-record` CLI reference say Chrome, headed or
headless, records with the `browser` engine.

### Consequences

- Good: a headed Chrome context records the same way whether the recording is automatic or authored.
- Good: headed Chrome records on hosts that can't capture the screen, such as a Windows service session or a macOS
  terminal without Screen Recording permission.
- Good: parallel headed Chrome contexts record without waiting on the display.
- Bad: the automatic video of a headed Chrome context shows the browser window, not the whole screen. A dialog or
  another app outside the window isn't in it. Set `engine: "ffmpeg"` on an authored `record` step to capture the
  screen.
- Bad: a headed Chrome context with an authored `record` has no automatic recording, so its context reports no
  `autoRecording`.
- Neutral: on a Linux host with no display, a headed Chrome context no longer runs headed on an Xvfb display that
  only `ffmpeg` asked for. It starts headless instead, with the existing `Retrying as headless.` warning, and is
  recorded.

### Confirmation

- `test/run-artifacts.test.js`, `buildAutoRecordStep` engine table: Chrome with `headless` `true`, omitted, and
  `false` gets the `browser` engine. Chrome with an authored `record`, headless or headed, gets no step. Firefox and
  Safari get `ffmpeg`.
- Fixtures, through `test/core-artifacts/cli/auto-capture.cjs`:
  - `recording/autorecord-defaults.spec.json` `headed-chrome`: unset in headed Chrome, a passing automatic MP4 on
    every host and no host-check warning.
  - `recording/autorecord-defaults.spec.json` `headed-chrome-authored-record`: only the author's recording.
  - `recording/autorecord.spec.json` `autorecord-full-context`: `autoRecord: true` in headed Chrome on every host.
    Its overlap test, `autorecord-overlap-named`, moves to headed Firefox, where an automatic recording still runs
    alongside an authored one.

## Pros and Cons of the Options

### A. The `browser` engine, and the author's recording wins

- Good: matches the authored default, so one rule explains both.
- Good: no host screen-capture requirement and no display serialization for Chrome.
- Bad: window capture, not the whole screen.
- Bad: no automatic recording beside an authored one in Chrome.

### B. Keep `ffmpeg` for headed Chrome

- Good: the automatic video shows the whole screen.
- Bad: two default engines for one context, depending on who added the recording.
- Bad: headed Chrome keeps the host checks and the serialized display.

### C. The `browser` engine, plus `ffmpeg` beside an authored `record`

- Good: a context with an authored recording still gets an automatic one.
- Bad: which engine records automatically depends on the context's other steps, which is harder to predict.
- Bad: brings back the host checks and display serialization for exactly the contexts that already record.
