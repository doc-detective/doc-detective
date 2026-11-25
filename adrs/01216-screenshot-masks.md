---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Screenshot masks ignore changing areas during comparison

## Context and Problem Statement

A `screenshot` step compares its capture with the reference at `path` and warns when more than
`maxVariation` of the pixels differ. A page that shows something that changes every run, such as
"Next invoice: 3 December" or "Last login 2 minutes ago", differs every time. The only options
today are a looser `maxVariation`, which also hides real regressions, or a crop that leaves the
changing part out of the docs.

Playwright's `toHaveScreenshot` has `mask`, a list of locators whose boxes are painted a solid
color before comparison. Users cite it as a reason to pick Playwright for screenshots. The closest
Doc Detective feature, the `blur` annotation, doesn't help: blurred text that changes still differs
pixel by pixel.

How should a `screenshot` step ignore parts of the page that change?

## Decision Drivers

* The saved image is documentation. A reader should see the real date, not a colored box.
* A mask must not hide more than the author asked for, and must not silently mask nothing.
* Reuse the element finding and geometry that crops and annotations already use, so a mask lands
  exactly where an annotation on the same element would.

## Considered Options

* **A. `mask` affects the comparison only.** Paint the same solid color over each mask area on
  both the reference and the new capture, just before `pixelmatch`. The saved PNG is untouched.
* **B. Paint the mask into the saved image**, as Playwright does.
* **C. No new key.** Document a `blur` annotation plus a higher `maxVariation`.

## Decision Outcome

Chosen option: **A**, because it removes the changing pixels from the comparison without changing
what the docs show.

* `screenshot.mask` is an array. Each item is a string: a selector or display text, the same
  shorthand `crop` takes. Or it's an element object with the annotation target's element-finding
  fields (`selector`, `elementText`, `elementId`, `elementTestId`, `elementClass`,
  `elementAttribute`, `elementAria`, `elementImage`, `timeout`).
* An element object masks **every** match, as Playwright's locator masks do. Masking an extra copy
  of a changing value can't hide a regression the author cares about. Missing one makes the check
  flaky. A string masks the first match, because a string could be a selector or display text.
  Matching every element for an ambiguous string could cover far more than intended. On
  app surfaces, where the native finder resolves one element, an object also masks its first match.
* Position targets aren't accepted. An annotation position is a point or a named anchor, not an
  area, so there's nothing to mask. A region form can follow when someone needs one.
* Masks are resolved only when a comparison runs: there's a reference, `overwrite` isn't `"true"`,
  and `maxVariation` is set. Without a comparison, a mask has no effect and isn't looked up.
* A mask target that can't be found FAILs the step, like a missing crop or annotation target. The
  message reads ``Couldn't find every mask target. Couldn't find the element to mask: `.date`.``
  A comparison that quietly ignores nothing is worse than one that stops.
* A targeted mask (a string) that lands entirely outside the capture or crop is a WARNING, through
  the `masksInBounds` check. Object masks are exempt, the same carve-out annotations with `all`
  have: matches below the fold are expected.
* Mask rects use the annotation geometry (`resolveAnnotationRects`, `toCanvasRect`), so they follow
  the crop origin and the capture's pixel ratio. When the comparison resamples the images to a
  common size, the rects scale with them.

### Consequences

* Good: pages with dates, counters, and relative times can keep a tight `maxVariation`.
* Good: the saved image, and so the docs, still show the real content.
* Neutral: new outputs `maskTargetsFound`, `masksInBounds`, and `maskedRegions` (the number of
  mask areas applied inside the image).
* Bad: a masked area can hide a real regression inside it. That's the author's explicit trade.

### Confirmation

* `test/screenshot-mask.test.js` covers a masked change passing where the unmasked one warns. It
  also covers a missing target failing, an out-of-frame mask warning, and every-match objects.
  Last, it covers resampled comparisons and masks being ignored without a reference.
* `test/core-artifacts/capture/screenshot-mask.spec.json` runs masks end to end in Chrome and
  Firefox against a page whose clock text changes every run.

## Pros and Cons of the Options

### A. Comparison-only mask

* Good: docs show real content; the comparison ignores only what the author named.
* Bad: none beyond the trade every mask makes.

### B. Paint into the saved image

* Good: matches Playwright exactly.
* Bad: a colored box in published docs, which is why docs teams wouldn't use it.

### C. Blur plus a looser threshold

* Good: nothing to build.
* Bad: blur doesn't stop changing pixels from counting, and a looser threshold hides real changes.
