---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Full-page screenshots and frozen animations

## Context and Problem Statement

A `screenshot` step captures the browser viewport. Two gaps push authors toward Playwright:

* Long pages, such as a settings page or a pricing table, don't fit in the viewport. Authors stitch
  several captures together or give up.
* Spinners, carousels, CSS transitions, and the blinking text caret change between captures. A
  reference comparison then reports a change that has nothing to do with the product.

Playwright's `screenshot({ fullPage: true })` and `animations: "disabled"` solve both.

How should a `screenshot` step capture a whole page, and a page with its animations stopped?

## Decision Drivers

* The interface should match Playwright's names, so authors who know it can guess ours.
* Each browser should use its own whole-page capture where one exists.
* Existing references must not change. Both options are opt-in.
* Masks and annotations must land on the same page content in a whole-page image.
* A capture that can't be whole must say so, not save part of the page.

## Considered Options

* Two `screenshot` keys, `fullPage` and `animations`, with per-browser capture paths.
* Scroll and stitch viewport captures.
* Default `animations` to `disabled`, as Playwright does.

## Decision Outcome

Chosen option: two opt-in `screenshot` keys, with per-browser capture paths.

| Key | Type | Default | Effect |
|---|---|---|---|
| `fullPage` | boolean | unset, which means `false` | Captures the whole scrollable page. |
| `animations` | `"allow"` \| `"disabled"` | unset, which means `allow` | `disabled` stops animations, transitions, and the caret for the capture. |

Neither key has a schema `default`. A default would appear in every resolved step and in every
report.

### `fullPage`, per browser

* **Firefox:** geckodriver's whole-page command (`GET /moz/screenshot/full`), through wdio's
  `fullPageScreenshot()`.
* **A session with a BiDi socket (`driver.isBidi`):** `browsingContext.captureScreenshot` with
  `origin: "document"`.
* **Anything else, including Chrome today and Safari:** grow the window until the viewport is as
  tall as the page's `scrollHeight` and as wide as its `scrollWidth`. Capture, then put the window
  size and scroll position back when the step ends. Until then, the window stays at the capture
  size while annotation and mask geometry is read. A responsive layout then can't move a target
  away from its blur. The resize uses `realizeViewport`. A page that already fits the
  viewport isn't resized. After the resize the page is measured again, because a `vh` layout grows
  with the viewport.
* **The screen caps the window:** a headed browser can't grow past the display. When the viewport
  ends up shorter or narrower than the page, the window goes back. The step is SKIPPED:
  ``Skipped: `safari` can't capture a page larger than the screen.`` One message covers both
  dimensions. It names whichever browser hit the cap. Headed Safari is the common case, since
  Safari has no headless mode.

Chrome sessions don't have a BiDi socket on this branch. PR #1041 gives every Chrome session one.
Once it merges, Chrome captures the document over BiDi with no resize, and this code needs no
change. The resize stays as the fallback for a session without a socket.

### Combinations

* `crop` with `fullPage: true` is a schema error: ``set `crop` or `fullPage`, not both.`` A crop
  already defines the area. `fullPage: false` with `crop` is valid.
* App surfaces reject `fullPage` and `animations`, through the same `allOf` guard that rejects
  `crop` and `style`. A native window has no document to scroll or animate.
* Masks and annotations resolve against element rects in the viewport. On a whole-page image they
  add the page scroll, and use the pixel density as the scale. A whole-page image is as wide as the
  document, so the viewport width would skew the scale.
* The live `annotate` blurs add the scroll they were drawn at. That's zero when the window grew,
  because a page as tall as its viewport can't scroll.
* A whole-page capture skips the resize to the reference's viewport (ADR 01144). The reference's
  height is the page's height, not a viewport height.

### `animations: "disabled"`

Before the capture, a page script:

* calls `document.getAnimations()`, which covers CSS animations, CSS transitions, and Web
  Animations;
* calls `finish()` on each finite animation and `cancel()` on each infinite one;
* adds CSS that sets `transition: none` and `caret-color: transparent` on every element.

The freeze runs after the fonts load and after any `fullPage` resize, so an animation either one
starts is frozen too. It saves each animation's `currentTime` and whether it was running. The page
stays frozen until annotation and mask geometry is read, so both land where the capture shows each
element. When the step ends, in a `finally`, the CSS goes and each animation gets its time back
and resumes if it was running. A step that fails still puts the page back. JavaScript timers that restyle the page aren't animations, so they keep
running. `stable` covers those.

### Consequences

* Good, because authors capture long pages in one step, in every desktop browser.
* Good, because a page with a spinner or a caret compares cleanly against its reference.
* Good, because existing steps and references don't change.
* Bad, because Chrome grows its window until #1041's socket is on for `fullPage` contexts. A page
  whose layout depends on the viewport height, such as a `100vh` hero, renders taller.
* Bad, because a headed browser on a small screen SKIPs a page larger than the screen.

### Confirmation

* [test/screenshot-fullpage.test.js](../test/screenshot-fullpage.test.js) runs the real pipeline
  against fake drivers. It covers each capture path, the restore, the SKIPPED cap, the mask offset,
  and freezing and thawing animations, including after a failed capture.
* [src/common/test/validate.test.js](../src/common/test/validate.test.js) covers both keys, the
  `crop` conflict, the app-surface guard, and that neither key appears when unset.
* [test/core-artifacts/capture/screenshot-fullpage-animations.spec.json](../test/core-artifacts/capture/screenshot-fullpage-animations.spec.json)
  runs a tall page in Chrome and Firefox and the Safari SKIPPED. It also captures a looping
  animation twice.

## Pros and Cons of the Options

### Two opt-in keys with per-browser capture paths

* Good, because each browser uses its most faithful capture.
* Good, because the names match Playwright's.
* Bad, because three capture paths need three kinds of tests.

### Scroll and stitch viewport captures

* Good, because it works in any browser at any screen size.
* Bad, because sticky headers and lazy content repeat or tear at every seam.
* Bad, because scroll-triggered effects change the page between slices.

### Default `animations` to `disabled`

* Good, because it matches Playwright.
* Bad, because existing references would shift. With the default `overwrite: aboveVariation`, a
  run would then rewrite users' images.
