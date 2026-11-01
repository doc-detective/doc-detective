---
status: accepted
date: 2026-11-01
decision-makers: doc-detective maintainers
---

# Find elements by image with `elementImage`

## Context and Problem Statement

Every `find` criterion reads the DOM or the accessibility tree, so anything drawn rather than structured
is out of reach: an icon with no text or label, a canvas, a chart, or a custom-drawn widget. Authors fall
back to hard-coded coordinates, which break when the layout moves.

How should `find`, and the steps that delegate to it, locate an element by how it looks, in a way that
works in every browser? The main use is "find this icon."

The measurements behind this decision are in
[docs/design/visual-element-matching.md](../docs/design/visual-element-matching.md).

## Decision Drivers

* A reference should work in every browser, and an author should be able to use an icon's own file.
* A match on the wrong element is worse than no match. It makes a test pass, or click something, for the
  wrong reason.
* The new criterion should work everywhere the existing criteria do, without a branch in every caller.
* Heavy dependencies install just in time, and must not change process-wide state.
* A failed match has to tell the author what to do next.

## Considered Options

* **A. `elementImage` with a matching method chosen by the reference, and a default threshold of 0.9**
  (chosen).
* **B. The same, with a default threshold of 0.8.**
* **C. The same, with the library's default threshold of 0.5.**
* **D. Compare every reference as an opaque image.**
* **E. Silhouettes for every transparent file.**
* **F. Preprocess both images with grayscale or blur before matching.**
* **G. Appium's images plugin and its `-image` locator strategy.**
* **H. Resolve a match to the DOM element under it with `elementFromPoint`.**
* **I. The same as A, with a default threshold of 0.95.**
* **J. The same as A, with a one-color file matching on shape alone.**

## Decision Outcome

Chosen option: **A**, because icons and graphics then match in both browsers measured, solid or thin outline, on any
background when the reference is an icon file, color always counts, and the real icon outranks a lookalike when it's on
screen.

1. `elementImage` is a new criterion, taking a path, or an object with either `path` or `base64` and an
   optional `threshold` and `color`. It's accepted wherever the other criteria are: `find`, `click`, `dragAndDrop`,
   `type`, `goTo.waitUntil.find`, `waitUntil.find`, `screenshot.crop`, and annotation targets.
2. A location's score is the lower of its shape score and its color score. An opaque reference is compared as it is, and a
   transparent multi-color file through an OpenCV mask, each with color from a per-channel gain and offset. A transparent
   one-color file finds its shape by silhouette, and its color by fitting the capture against its alpha, where hue counts
   in full and lightness past a tolerance. `color` sets a one-color file's color, for files drawn in `currentColor`.
3. A transparent one-color file is tried at every whole size from 12 to 64 CSS pixels, and a multi-color file at 13
   common sizes. The best score wins, at device resolution. An SVG is rendered at each size, and a raster is resized. An
   opaque reference that misses at its own size is retried at 1× and 2× sizes.
4. The default threshold is 0.9.
5. A match stands in for an element, and its center is where every pointer action lands.
6. Other criteria scope the search to their elements.
7. A single-color reference and a reference larger than the surface fail with their own message, because
   OpenCV scores both as a false 1.0.
8. Matching restores the process listeners that `@appium/opencv` and `opencv-bindings` change.
9. App surfaces and mobile browsers fail with a message saying so.

### Consequences

* Good, because an author can name an icon's own file, and it matches on any background, at any whole size from 12 to
  64 pixels, in Chrome and Firefox.
* Good, because a red icon doesn't match a blue one with the same shape, whichever kind of reference finds it.
* Good, because canvases and custom-drawn interfaces become testable without coordinates.
* Good, because the dependencies are WebAssembly, so they add no native binary to install: 8 MB on top of
  `sharp`, which is already a heavy dep.
* Bad, because a file drawn in `currentColor`, which most icon sets ship, renders black, so an icon in another color needs
  `color` on the step.
* Bad, because shades about 32 levels apart or closer still match, and thin strokes tolerate more lightness drift, since
  browsers draw them up to 28% lighter than a file predicts.
* Bad, because content with text falls below the default threshold across browsers, so it needs `elementText`,
  a lower step-level `threshold`, or a reference per browser.
* Bad, because a near-identical element can pass when the real target is gone, such as a chart with one bar
  changed at 0.94. Authors who care raise `threshold` to 0.99.
* Bad, because an icon that's gone can pass on a lookalike in the same color: `square` for `square-check` up to 0.96, or a
  `+` in text for `plus`. Authors checking a state raise `threshold` on that step, and authors matching a simple glyph scope the search.
* Bad, because thin icons at fractional sizes or under a sub-pixel `transform` can fall below the default, with 33–98%
  of outlines reaching it depending on the set. Those steps need a lower `threshold`.
* Bad, because trying many sizes costs up to 1.6 s per attempt at 1× and 4.5 s at 2× for a one-color file, and 3 s at 1× for a
  multi-color one, when nothing matches.
* Bad, because matching sees only what's on screen, unlike the DOM criteria.
* Bad, because the mask path calls `opencv-bindings` directly, as `@appium/opencv` doesn't expose a mask.
* Neutral, because a sharp upgrade that diverges from `@appium/opencv`'s exact pin installs a second copy
  of sharp in the runtime cache.

### Confirmation

The claims in [the design doc](../docs/design/visual-element-matching.md#plan) and
[the user-facing page](../docs/fern/pages/docs/test-docs/find-elements-by-image.mdx) are pinned to their
implementation and proofs with `manni cite`, and CI runs `manni cite check`. The fixture is
[find-image.spec.json](../test/core-artifacts/interactions/find-image.spec.json).

## Pros and Cons of the Options

### B. Threshold 0.8

* Good, because headings at 0.88, most icon buttons, and thin icons at fractional sizes pass without a step-level
  `threshold`.
* Bad, because it finds no more real icons at whole sizes than 0.9, and with the icon gone, something else on its page
  passes for 29–53% of the icons measured, against 0–23% at 0.9.

### C. Threshold 0.5

* Good, because some buttons with text would match across browsers.
* Bad, because a different button with the same styling scores up to 0.77, and an input rendered by the
  other browser lands on the wrong input at 0.71.

### D. Compare every reference as opaque

* Good, because there's one method.
* Bad, because a transparent file scores 0.28–0.30 as it is, and flattening it only works on one background.

### E. Silhouettes for every transparent file

* Good, because it needs only `@appium/opencv`'s public API.
* Bad, because a green check and a red cross in the same disc share a silhouette, so it picks the wrong one.

### F. Grayscale or blur

* Good, because scores for the right location rise.
* Bad, because scores for the wrong locations rise as fast, and fewer references land in the right place.

### G. Appium's images plugin

* Good, because the plugin already wraps the same library.
* Bad, because it needs the Appium plugin activated on each server, and browser sessions would depend on
  it to find anything. This option wasn't tried.

### H. Hit-testing with `elementFromPoint`

* Good, because `outputs.element` would describe a real DOM element.
* Bad, because a canvas is one element, so clicking it clicks its center rather than the match.

### I. Threshold 0.95

* Good, because with the icon gone, something else on its page passes for 0–10% of the icons measured, against 0–23% at 0.9.
* Bad, because the real icon is chosen 94–100% of the time rather than 98–100%, multi-color files that score 0.91 stop
  matching, and only 19–86% of icons at fractional sizes or under a sub-pixel `transform` reach it.

### J. Shape only for a one-color file

* Good, because one file finds an icon in any color, which suits CSS recoloring, and authors never need `color`.
* Bad, because a red icon matches a blue one with the same shape, so a test can pass on the wrong state. The maintainer ruled
  this out in review: matching always counts color.
