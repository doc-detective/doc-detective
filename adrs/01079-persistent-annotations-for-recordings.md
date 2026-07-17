---
status: accepted
date: 2026-07-17
decision-makers: hawkeyexl
---

# Persistent annotations: an `annotate` step backed by driver-session state

## Context and Problem Statement

[ADR 01078](01078-screenshot-annotations-unified-svg-rendering.md) added annotations to `screenshot`. Those are ephemeral: composited into one image, gone afterward. They deliberately never touch the page, which is what makes them safe on app surfaces and around concurrent recordings.

That design cannot serve recordings. For an annotation to appear in a video it has to exist *while frames are captured* — which means it must exist in the page. And an annotation that lives across frames needs things a single capture never needed: a way to refer to it later (`id`), a way to keep it on its element while the page moves (`track`), and a way to appear and disappear over time (`transition`, `duration`).

So the question isn't "how do we draw on a video" — all three recording engines capture real rendered pixels ([ADR 01078](01078-screenshot-annotations-unified-svg-rendering.md)), so anything in the DOM is already in the video. The question is what owns annotation *state*, and how a live renderer stays consistent with the buffer renderer instead of drifting into a second dialect of the same feature.

## Decision Drivers

* One rendering implementation for stills and video — divergence between media is the risk this whole feature is organized around.
* The page under test must behave identically whether or not annotations are up.
* Never silently under-redact.
* Persistence has to survive navigation, which wipes injected DOM.

## Considered Options

* **A — DOM overlay with Node-owned state.** Node holds the annotation list; the page renders what it's told.
* **B — DOM overlay with page-owned state.** Inject a runtime into the page that owns the annotations.
* **C — Post-composite onto recorded frames.** Leave the page alone; annotate the video afterward with ffmpeg.

## Decision Outcome

Chosen option: **A**, a new `annotate` step rendering through a **second adapter over the same SVG generator**.

**`annotate` is its own step, not a `record` option.** Annotations aren't a property of a recording — they're a property of the page over time. Making them a step is what lets them be choreographed (add, interact, update, clear) and lets a mid-recording screenshot capture the same annotations the video shows.

**The renderer is shared; only the adapter is new.** `annotationsToSvg` is unchanged in what it decides — geometry, style, layout. `domAdapter.ts` mounts its output into a `dd-annotation-layer` custom element; `composite.ts` burns the same output into a PNG. The generator gained per-annotation `<g>` wrappers and `pathLength="1"` on stroked shapes: both are inert for static rasterizers and are what let the live overlay address and animate individual annotations. A shape drawn in a still and in a video therefore comes from one implementation.

**Units are the seam, not a fork.** The buffer adapter passes rects in image pixels with an image-sized canvas; the DOM adapter passes CSS pixels with a viewport-sized canvas. The generator is unit-agnostic — it only requires rects and canvas in the same space — so the live path needs no scaling at all (the browser applies devicePixelRatio itself) while the buffer path derives scale from the capture.

**Node owns the state.** `driver.state.annotations` mirrors how recordings live in `driver.state.recordings`. Every change re-renders the full set. This keeps element-finding semantics (regex, normalized text, `all`) on the Node side, where `findElement` already lives, instead of shipping a second find implementation into the page. It also makes navigation recoverable: the runner re-mounts from state rather than hoping the page kept something.

**The page script is deliberately dumb**: mount markup, animate newly-added ids, and translate tracked groups on rAF. Tracking is the one thing it must do itself — asking Node to re-resolve geometry every frame would be far too chatty — and it does it by reading the live rect of an element Node tagged with `data-dd-annotate-target`.

**Navigation re-injection broadens an existing hook.** The post-step hook in `runStep` that re-instantiates the synthetic cursor was gated on `isRecordingActive`. Annotations must survive navigation whether or not a recording is running, because a screenshot taken after a `goTo` should still show them — so the condition now also fires when `driver.state.annotations` is non-empty. Re-mounted annotations don't replay their enter transition; a fade-in on every navigation would read as a glitch.

**`update` fails on a missing id, `clear` doesn't.** An `update` naming an absent id means the author expected something to be there — a typo, or an annotation already cleared. Silently promoting it to an add would hide that. Clearing something already gone, by contrast, is the desired end state, so it's a no-op.

**App surfaces SKIP.** There's no page to draw into. The message points at `screenshot.annotations`, which *does* work on app captures. SKIP rather than FAIL: the test never asked for a browser.

### Consequences

* Good: one authoring surface and one renderer across stills and video; `id`/`track`/`transition`/`duration` are inert in stills rather than errors, so the same object means the same thing in both media.
* Good: the overlay is `pointer-events: none` in a shadow root, so it can't take a click from a later step or be restyled by the page.
* Good: a mid-recording screenshot captures the persistent annotations, because the capture's cursor-hiding only ever touched `dd-mouse-pointer`.
* Bad: annotations now mutate the page under test. That's inherent to appearing in a recording, and it's exactly why `screenshot.annotations` stayed composited.
* Bad: `annotate_v3` inlines `annotation_v3` twice (`add` and `update`), making it the largest step schema; see the schema-size note below.
* Neutral: `duration` is enforced by pruning on the next step rather than by a timer, so an annotation's last frame may outlive its duration slightly. Frame-exact expiry would need a page-side timer racing Node's state, which is a worse trade.

### Confirmation

* `test/annotate-step.test.js` — the whole state machine against an injected clock: add, id-replace, update, the update-missing-id failure, clear all/by-id/false, clear-before-add ordering, duration stamping and pruning, the no-browser SKIP.
* `src/common/test/validate.test.js` — the schema contract: add/update/clear shapes, `update` requiring `id`, the empty-step rejection, and `clear`'s boolean surviving coercion.
* `test/core-artifacts/recording/annotate.spec.json` — the lifecycle inside a real recording, persistence into a screenshot, survival across navigation, every transition, `duration`, tracking through scroll, and `all` redaction.

## Pros and Cons of the Options

### A — DOM overlay, Node-owned state

* Good: reuses `findElement` semantics; state survives page reloads; the page script stays small.
* Bad: a driver round-trip per change (irrelevant at step granularity).

### B — DOM overlay, page-owned state

* Good: no re-mount needed after navigation if state lived in `sessionStorage`.
* Bad: needs a find implementation in the page, which would drift from `findStrategies`; state dies with the document anyway; much larger injected surface.

### C — Post-composite onto recorded frames with ffmpeg

* Good: never touches the page; would work on app recordings.
* Bad: needs per-frame element geometry that nothing captures; can't track a moving element; only works for ffmpeg recordings, not the browser or device engines; a second renderer to keep in step with the first.
