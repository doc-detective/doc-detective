---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Ship Xvfb in the Linux image

Builds on [ADR 01176](01176-record-headless-chrome-by-tab-capture-and-use-chrome-by-default.md) and
[ADR 01177](01177-capture-screenshots-and-recordings-by-default.md).

## Context and Problem Statement

The `ffmpeg` recording engine captures a screen. On Linux, its preflight passes only when Xvfb is on the `PATH` or
`DISPLAY` points at a screen it can capture. When the preflight fails:

- `autoRecord`, on by default, doesn't run headless Firefox headed, so Firefox contexts aren't recorded.
- Authored `record` steps on headless Firefox are SKIPPED, and headed contexts and native apps have no display.

The official Linux image installs `ffmpeg` and the X11 client libraries, but not Xvfb, and it sets no `DISPLAY`. A
container has no X server of its own. So in the image only headless Chrome, which the `browser` engine records by tab
capture, records by default. The docs tell users to install Xvfb, which the official image's users can only do by
building a derived image.

The runner already starts its own Xvfb displays when the binary exists, one per recording context, so concurrent
`ffmpeg` recordings don't overlap.

Should the Linux image ship Xvfb?

## Decision Drivers

- A run in the official image records what the same run records on a Linux host set up as the docs say.
- Users don't build a derived image to get a default feature.
- The image stays small.

## Considered Options

- **A. Install the `xvfb` package in the Linux image.**
- **B. Install `xvfb` and start a display in the entrypoint, exporting `DISPLAY`.**
- **C. Leave the image as it is and document a derived image.**

## Decision Outcome

Chosen option: **A**.

The Linux Dockerfile adds `xvfb` to its `apt-get install` list. The runner finds it and starts per-context displays
as it does on any Linux host. The entrypoint is unchanged.

| Context in the Linux image | Before | After |
|---|---|---|
| Headless Chrome | Recorded, `browser` engine | Unchanged |
| Headless Firefox, `autoRecord` on (the default) | Not recorded | Runs headed on Xvfb and recorded with `ffmpeg` |
| Headless Firefox, `autoRecord: false`, `record` step | SKIPPED | SKIPPED, unchanged |
| Headed browser or native app, `record` step | No display to run or record on | Recorded with `ffmpeg` on Xvfb |

The Windows image is unchanged. Windows containers have no Xvfb, and the issue there is different.

### Consequences

- Good: headless Firefox and `ffmpeg` recordings work in the official image with no setup.
- Good: concurrent `ffmpeg` recordings get isolated displays, as on any Linux host with Xvfb.
- Bad: the image grows by the Xvfb server and its dependencies.
- Neutral: headless Firefox in the image now runs headed by default, and the run says so once. `autoRecord: false`
  keeps it headless.

### Confirmation

`src/container/test/runTests.test.cjs`, run by `npm run container:test` after the image build:

- `has Xvfb on the PATH` runs `command -v Xvfb` in the Linux image.
- `record_firefox_headless.spec.json` records a headless Firefox context on Linux and asserts that the video exists
  and isn't empty.

## Pros and Cons of the Options

### A. Install `xvfb`

- Good: one package, and the runner's existing Xvfb support does the rest.
- Good: each recording context gets its own display.
- Bad: a larger image.

### B. Install `xvfb` and start a display in the entrypoint

- Good: tools other than Doc Detective also see a display.
- Bad: one shared display makes concurrent `ffmpeg` recordings overlap, which per-context displays avoid.
- Bad: the entrypoint stops being a plain `npx doc-detective`, which platform runners rely on.

### C. Document a derived image

- Good: no image change.
- Bad: a default feature needs every user to maintain their own image.
