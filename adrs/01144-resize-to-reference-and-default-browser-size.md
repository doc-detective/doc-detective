---
status: accepted
date: 2026-10-29
decision-makers: doc-detective maintainers
---

# Resize to the reference's size, and give unsized browsers a default viewport

## Context and Problem Statement

A `screenshot` step compares its fresh capture against a stored reference. When the two differ in
size, the comparison breaks:

* Aspect ratios more than 5% apart FAIL with `Images have different aspect ratios`, and the
  reference is never updated.
* Closer ratios are resampled to a common size, which reports drift even for identical content
  ([#719](https://github.com/doc-detective/doc-detective/issues/719)). The step returns WARNING, and
  with the default `overwrite: "aboveVariation"` the reference gets replaced.

The size a browser renders at depends on the environment, not only on the spec. GitHub is moving
`ubuntu-latest` to Ubuntu 26.04 (October 19 to November 19, 2026), and captures there stopped
matching references captured on 24.04
([#769](https://github.com/doc-detective/doc-detective/issues/769)). The browser versions are
identical across both images. The window frame around the viewport, and the defaults the engines
pick, differ by platform and fonts.

Contexts that set neither `window` nor `viewport` were the most exposed. The runner passed a 1200×800
default, and a `startSurface` descriptor's `size`, into `getDriverCapabilities`, but no engine used
them. Unsized sessions got the engine's own default. Measured locally on Windows 11: headless Chrome
uses a 780×580 window on an 800×600 virtual screen (a 758×426 viewport), and headless Firefox uses
1366×768 (1366×683). `startSurface`'s documented `size` field had no effect at all.

The same measurements answer how far a window can grow. Headless Chrome, headless Firefox, and headed
Firefox all realized a 4000×3000 window, larger than the screen. Headed Chrome clamped to the display
(2578×1458 on a 2560×1440 screen).

## Decision Drivers

* A reference captured in one environment should still compare in another, without the author
  re-capturing it.
* Never undo an intentional config change. If the author changed `viewport`, an out-of-date reference
  must not drag the browser back to the old size.
* The page's layout must stay what the spec asked for, for every other step.
* Unsized sessions should render at the same size everywhere.
* Viewport emulation stays off the table: its BiDi socket crashes recording
  ([ADR 01072](01072-bidi-socket-for-chrome-viewport-emulation.md)).

## Considered Options

1. **Resize to the reference, retake, restore** (chosen).
2. **Compare the overlapping region instead of resampling** (the #719 direction).
3. **Store the authored size in the reference PNG** and resize only when it matches the current
   config.
4. **Do nothing; document pinning the runner image.**

## Decision Outcome

Chosen: **option 1**, plus a default viewport.

**Default size.** Every desktop browser session gets a size when it opens, through one helper,
`applyBrowserSize`:

* an authored `viewport` is realized as before ([ADR 01071](01071-warn-when-a-browser-floors-a-requested-viewport.md));
* otherwise an authored `window` (the context's, or a `startSurface` descriptor's `size`) sets the
  window;
* otherwise the session gets a **1200×800 viewport**. That's the size the runner always meant to
  apply. It's a viewport rather than a window because the window-to-viewport offset is the part that
  drifts between platforms. A host too small to fit it logs at debug level, not as a warning, since
  nobody asked for it.

Sessions opened later by `startSurface` or `goTo` inherit the context's size unless the descriptor
sets its own. The helper records the requested size on the session (`driver.state.sizeTarget`) so a
screenshot can tell what the author asked for.

This ships as a bug fix, not a breaking change. The runner intended 1200×800 all along, and the
resize below keeps existing references comparable.

**Resize to the reference.** After capturing, `saveScreenshot` checks whether the capture and the
reference differ in size. If they do, it resizes the window so the viewport matches the reference
(the reference's pixels divided by `devicePixelRatio`), captures again, and compares that capture
instead. The window goes back to its original size when the step finishes, after annotations, which
resolve against the live page. The output `resizedToReference: { from, to }` reports it.

It applies only when all of these hold:

* a browser capture without `crop` (app windows can't be resized this way, and a crop's size comes
  from the element, not the window);
* a reference that gets compared, so not `overwrite: "true"` on a local path;
* no recording running, and not a recording checkpoint, since the resize would show in the video;
* a session with a recorded size target;
* the two sizes aren't a uniform scale of each other. That's a `devicePixelRatio` difference, which
  the existing resample handles, and resizing would change the layout instead;
* the reference shows what the author asked for:
  * authored `viewport`: the reference's CSS size is within 16px (`VIEWPORT_TOLERANCE_PX`) of it;
  * authored `window`: the window size needed is within 5% of it on each requested axis;
  * default: always. Nothing was authored, so the reference is the only statement of intent.

If the retake still doesn't match (headed Chrome can't grow past the display, and minimum window
sizes still apply), it logs a warning and compares the original capture as before.

### Consequences

* Good: references survive runner-image changes, frame and font differences, and the new default,
  without re-capture.
* Good: unsized sessions render at 1200×800 on every engine and host that can fit it, and
  `startSurface`'s `size` works.
* Good: a reference larger than the screen still works headless and in headed Firefox.
* Neutral: a mismatched step costs a resize, a second capture, and a restore. That repeats each run
  until the reference is refreshed with `overwrite: "true"`.
* Bad: unsized contexts change size. Pages with responsive breakpoints between the old defaults and
  1200px lay out differently, which can change what later steps find. References keep comparing
  through the resize.
* Bad: the 5% window rule is a guess. It can't tell frame drift from an intentional change smaller
  than 5%. Option 3 would make it exact.
* Neutral: the floor warning's wording no longer claims the limit is a minimum, since a window can now
  also be clamped at the display's size.

### Confirmation

* Unit tests for the pure decision (`referenceViewport`), for `applyBrowserSize`, and for
  `saveScreenshot` against a fake driver whose second capture comes back at the reference's size.
  The skip paths are covered: crop, recording checkpoint, `overwrite: "true"`, no size target, an
  out-of-date viewport reference, uniform scale, and a retake that still doesn't match.
* Feature fixtures in `test/core-artifacts/capture/screenshot-resize-to-reference.spec.json` run each
  target kind headless, including a reference larger than the screen. Fixtures in `sessions/` check
  the default viewport and `startSurface`'s `size`.

## Pros and Cons of the Options

### Option 1: resize, retake, restore

* Good: compares like with like, so neither image is resampled.
* Good: works with existing references, no migration.
* Bad: costs extra round trips on each mismatched step.
* Bad: can't exceed the display in headed Chrome.

### Option 2: compare the overlapping region

* Good: cheap, no browser round trips.
* Bad: a viewport with a different height or width shows different content at the edges, so it only
  helps near misses. Still worth doing for #719.

### Option 3: authored size stored in the PNG

* Good: tells drift from an intentional change exactly.
* Bad: no existing reference carries it, so it can't help the references breaking now.

### Option 4: pin the runner image

* Good: no code.
* Bad: delays the problem until the next image change, and does nothing for local and cross-platform
  runs.
