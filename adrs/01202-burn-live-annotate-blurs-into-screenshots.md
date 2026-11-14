---
status: accepted
date: 2026-11-14
decision-makers: doc-detective maintainers
---

# Burn live annotate blurs into screenshots

## Context and Problem Statement

The `annotate` step ([ADR 01079](01079-persistent-annotations-for-recordings.md)) draws annotations into the page,
in a `dd-annotation-layer` element. An SVG can only blur what's inside it, so the layer draws each `blur` as a
positioned div with CSS `backdrop-filter`. A `screenshot` taken while that blur is up is supposed to show it. That's
how a test keeps a redaction up across a whole flow.

Firefox leaves `backdrop-filter` out of WebDriver screenshots. It was measured on Windows against a box of 2px
black-and-white stripes, blurred with `annotate` at the default intensity. The measure is the mean contrast between
horizontal neighbors inside the box: 0 is flat, and about 127 is the stripes. Headless Firefox read 127.14 before and
after the blur, and headed Firefox read 84.84 before and after. Chrome read 0.50 headless and 0.00 headed. A probe in
the same Firefox session found `CSS.supports('backdrop-filter', …)` true and a `.dd-blur` with `blur(14px)` mounted
at the right rect. The same layer's SVG outline did appear in the capture. Only the blur was missing. A Firefox
screenshot therefore showed what the blur should hide, so the redaction leaked.

How does a screenshot taken under a live blur come out blurred in every browser?

## Decision Drivers

- No browser saves a screenshot with a live blur missing from it.
- A running recording never shows the page unblurred, even for one frame.
- One code path for every browser, not a Firefox branch that leaves other browsers to their screenshot
  implementations.
- No change to screenshots taken with no live blur up, so existing references don't shift.
- Fail closed, as the secret blur does ([ADR 01178](01178-mask-environment-variable-values-in-every-output-by-default.md)):
  no screenshot beats an unredacted one.

## Considered Options

- **A. Burn the layer's blur regions into every browser capture** (chosen).
- **B. Burn them in on Firefox only.**
- **C. Hide the layer's blurs during the capture and burn them in**, so every browser blurs once.
- **D. Draw the live blur another way**, one that Firefox screenshots include.

## Decision Outcome

Chosen option: **A**.

Every browser capture goes through `takeBrowserScreenshot` in `src/core/tests/saveScreenshot.ts`: the first
capture, the retake at a reference's size ([ADR 01144](01144-resize-to-reference-and-default-browser-size.md)), and
recording checkpoints. After it takes the screenshot, and only when `driver.state.annotations` isn't empty, it
asks the page where the layer's blurs sit (`readBlurRegions` in `src/core/annotations/domAdapter.ts`). The page
reports each `.dd-blur` element's bounding rect in CSS pixels and its intensity, which the layer now stores in a
`data-dd-intensity` attribute. Reading the page, rather than rebuilding rects from state, gets a tracked blur where it
has moved to and costs no element lookups.

The rects and intensities scale by the capture's width over the viewport's, as `screenshot.annotations` rects do.
They go through the same generator and compositor the screenshot's own annotations use (`annotationsToSvg`,
`compositeAnnotations`), so they're clipped to the image and blurred with `sharp`. The blur lands on the full
capture, before any `crop` and before the screenshot's own `annotations`.

If the page won't report its blurs, the capture throws, and the step fails with
``Couldn't save screenshot. Error: Couldn't read where the live `blur` annotations are on the page. <cause>``.

### Consequences

- Good: a screenshot under a live blur is blurred in Firefox. Headless Firefox read 0.50 after the fix, headed
  Firefox 0.67, against 127.14 and 84.84 before.
- Good: the guarantee doesn't depend on any browser's screenshot implementation, so Safari or a future Chrome
  change can't reopen it.
- Good: with no live annotation up, the step does no extra work and its output stays byte-identical.
- Bad: Chrome's capture already shows the blur, so Chrome blurs those regions twice. Measured, that moves each pixel
  in the region by at most 2 of 255 grey levels. The mean shift was 0.53 headless and 0.21 headed. Nobody can see
  it, but `maxVariation` comparisons use a zero pixel threshold. So a Chrome reference taken under a live blur
  before this change differs across the blurred region once. Retake it, or let `overwrite: "aboveVariation"` replace it.
- Bad: a screenshot under a live blur costs one more page round trip and a `sharp` composite.
- Neutral: this doesn't catch an annotate state that names a blur the page isn't showing. That can happen after a
  failed re-mount on navigation. The page is the record of what's displayed, in every browser alike.

### Confirmation

- `test/annotations-screenshot.test.js` ("live annotate blurs in a screenshot") feeds the real `saveScreenshot` a
  striped capture and a page reporting two blurs at 2x. It asserts both regions read below 5 and the stripes beside
  them stay above 120. A second case asserts the step fails, and saves nothing, when the page won't report its
  blurs. Both failed before the fix: the region read 126.70, and the step passed.
- `test/core-artifacts/capture/annotate-blur-capture.spec.json` runs headless Chrome and Firefox on every platform
  against `test/server/public/annotate-blur.html`. Each test compares a capture under the blur with its own
  unblurred reference. The full viewport must differ in more than 10% of pixels (the box is 16%), and a crop of the
  box in more than 90%. After `clear`, the capture must match the reference exactly. Before the fix, Firefox
  differed in 0.00% and failed; after it, 15.82% and 98.75%. Chrome read 16.00% and 100% on both sides of the fix.

## Pros and Cons of the Options

### A. Burn the layer's blur regions into every browser capture

- Good: one path; correct wherever a browser's screenshot drops the blur, and harmless where it keeps it.
- Good: reuses the screenshot-annotation compositor, so no new image code.
- Bad: Chrome's regions are blurred twice, which is invisible but shifts zero-threshold comparisons once.

### B. Burn them in on Firefox only

- Good: Chrome's output doesn't change at all.
- Bad: keys a redaction on a browser name. A browser whose screenshots drop the blur and isn't on the list, or
  a Chrome change, leaks again with nothing to catch it.

### C. Hide the layer's blurs during the capture and burn them in

- Good: every browser blurs once, so Chrome and Firefox match.
- Bad: while the blurs are hidden, the page shows the content unblurred, and an ffmpeg recording running at the
  same time captures those frames. That's the leak the blur exists to prevent.

### D. Draw the live blur another way

- Good: fixes the page itself, so anything that reads the screen gets it.
- Bad: CSS has no other way to blur what's behind an element. `filter: blur()` on the target only works for
  element targets, not for `position` targets, and changes the element the test is driving. Firefox's
  `-moz-element()` is Firefox-only and deprecated.

## More Information

- Recordings: the browser recording engine records Chrome tabs only, so a Firefox recording uses ffmpeg, which
  records the screen as Firefox draws it. Whether the blur shows there wasn't measured as part of this decision.
- [ADR 01078](01078-screenshot-annotations-unified-svg-rendering.md) defines the shared generator and the buffer
  compositor this reuses.
