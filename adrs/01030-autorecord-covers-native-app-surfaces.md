---
status: accepted
date: 2026-07-09
decision-makers: [hawkeyexl]
---

# autoRecord covers native app surfaces (visual surfaces), not just browser contexts

## Context and Problem Statement

`autoRecord` prepends a synthetic full-context ffmpeg screen recording to a
context's steps. It only does so when the context is judged to need a driver —
`buildAutoRecordStep` gated on `isDriverRequired(context)`, which scans steps for
`BROWSER_STEP_KEYS` (`click`, `find`, `goTo`, `record`, `screenshot`, …).

Native app surface steps (`startSurface` / `closeSurface`, phases A1–A4) are **not**
in that list. So a context whose only driver work is opening a native app or a
**headed Android emulator** was judged "no driver," and `buildAutoRecordStep`
returned `null` — `autoRecord: true` silently recorded nothing. This was observed
directly: a headed-emulator spec with `autoRecord: true` passed (surface opened and
closed) but produced no `.mp4`. A headed emulator window on the host display is
exactly the kind of thing autoRecord's ffmpeg screen grab should capture.

The subtlety: not every surface is visual. The surface model will grow a
process/command branch (multi-surface Phase 6) with nothing on screen to record. A
naive "any `startSurface` records" rule would wrongly capture a headless
command/process surface.

## Decision Drivers

- `autoRecord` should record any context that puts something **visual** on the host
  display — browser windows and native GUI app / emulator windows alike.
- A **non-visual** surface (a future command/process `startSurface`) must not
  trigger a recording — there is nothing to capture.
- Don't disturb the separate "requires a **browser**" decision
  (`isBrowserRequired` / `isDriverRequired`) that governs browser provisioning and
  concurrency — a native app context must not be pushed to spin up a browser.

## Considered Options

1. **Add a visual-surface check to the autoRecord gate only**, keying "visual" on a
   native app surface (`startSurface` with an `app`, or an object-form app-surface
   target), leaving `isDriverRequired`/`isBrowserRequired` untouched.
2. **Add `startSurface`/`closeSurface` to `BROWSER_STEP_KEYS`** — rejected: that list
   means "requires a browser." Native app steps would then force browser
   provisioning and be mis-counted by the concurrency/pool logic.
3. **Record on any `startSurface`** — rejected: it would capture a future
   non-visual command/process surface, which has nothing on screen.

## Decision Outcome

Chosen option: **1**. A new `contextHasVisualSurface(context)` returns true when
`isDriverRequired(context)` (browser/driver step) **or** a step opens/targets a
**visual app surface**: `startSurface` with a string `app`, or a step whose payload
targets an app surface in object form (`stepTargetsAppSurface`, already used by
`isBrowserRequired`). `buildAutoRecordStep` now gates on `contextHasVisualSurface`
instead of `isDriverRequired`.

Keying "visual" on the presence of `app` is what honors the caveat: a future
process/command `startSurface` carries no `app`, so it is not visual and does not
record. `isDriverRequired` and `isBrowserRequired` are unchanged, so browser
provisioning, `isSupportedContext`, and concurrency/display-resource accounting keep
their existing meaning — the change is scoped to whether autoRecord injects.

### Consequences

- Good: `autoRecord: true` now records native app + headed-emulator contexts (the
  ffmpeg capture grabs the emulator/app window on the host display).
- Good: the browser-vs-driver distinction is untouched; no native app context is
  nudged into launching a browser.
- Good/forward-safe: a non-visual command/process surface (Phase 6) is explicitly
  excluded by the `app` check, so it won't spuriously record when it lands.
- Neutral: as with browser autoRecord, the capture is a host-display ffmpeg grab, so
  it's only meaningful when the surface is **headed** (a headless emulator would
  capture an idle display) — the same headed-vs-headless caveat already documented.

### Confirmation

`test/run-artifacts.test.js` (`buildAutoRecordStep`) asserts a synthetic ffmpeg step
is built for a native app surface context (`startSurface` with `app`), and that a
non-visual `startSurface` (a `command` payload, no `app`) still yields `null`. The
existing browser-driver and no-driver cases are retained. The
`android-autorecord-headed` feature fixture exercises it end-to-end on a capable
host (headed emulator boots, autoRecord produces the context `.mp4`).

## Pros and Cons of the Options

### 1. Visual-surface check on the autoRecord gate only (chosen)

- Good, because it records exactly the contexts with something on screen and leaves
  the browser/driver decisions and their downstream accounting alone.
- Good, because the `app` key cleanly separates visual app surfaces from future
  non-visual command/process surfaces.
- Bad, because it adds a second, subtly-different "what counts as a surface"
  predicate next to `isDriverRequired`/`isBrowserRequired` (documented to keep the
  distinction clear).

### 2. Add native app step keys to `BROWSER_STEP_KEYS`

- Good, because it's a one-line list change.
- Bad, because that list means "needs a browser"; it would force browser
  provisioning for native app tests and corrupt pool sizing / support checks.

### 3. Record on any `startSurface`

- Good, because it's the simplest possible gate.
- Bad, because it would record a non-visual command/process surface, violating the
  "nothing to capture" principle.
