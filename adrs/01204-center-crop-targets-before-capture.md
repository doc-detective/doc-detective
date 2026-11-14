---
status: accepted
date: 2026-11-14
decision-makers: doc-detective maintainers
---

# Center crop targets in the viewport before capture

## Context and Problem Statement

A `screenshot` with `crop` scrolls the target element into view, captures the viewport, and cuts the element's
padded rect out of the capture. It scrolled with `scrollIntoView({ block: "start", inline: "start" })`, then
`scrollBy` back by the padding, so the element landed at the viewport's top-left edge.

Most documentation sites keep a fixed or sticky header across the top of the viewport. An element scrolled to the
top edge sits under that header, and the crop cuts out the header's pixels instead of the element (#145). It
reproduced in Firefox and Chrome, headed and headless, against a page with an 80px fixed header: both cropped
screenshots showed only the header.

Where should the crop target sit before the capture so a fixed header doesn't cover it?

## Decision Drivers

- The crop shows the element the author named, on pages with fixed or sticky headers and footers.
- No new configuration for the common case.
- Same behavior in every browser.

## Considered Options

1. Scroll the element to the center of the viewport.
2. Keep the top-left scroll, then detect occlusion with `document.elementFromPoint` and scroll past the covering
   element.
3. Add a `scrollOffset` option to `crop` that authors set to their header's height.

## Decision Outcome

Chosen option: 1, scroll to the center, because fixed headers and footers sit at the viewport's edges. The step
already fails with `Element can't fit in viewport.` when the padded rect is larger than the viewport, so a centered
target is always fully in view.

### Consequences

- Good, because crops on pages with a fixed header or footer show the element.
- Good, because it's one scroll call with no new option.
- Bad, because the page's scroll position after a cropped screenshot differs from before. A later step that reads the
  scroll position sees the element centered rather than at the top.
- Bad, because a fixed overlay taller than half the viewport can still cover a centered element. Option 2 is the
  upgrade if that shows up.

### Confirmation

`test/core-core.test.js` crops two buttons below a red fixed header on `test/server/public/crop-sticky-header.html`
and asserts each crop has no header pixels. The fixture `test/core-artifacts/capture/screenshot-crop-sticky-header.spec.json`
runs the same crops in Chrome and Firefox.

## Pros and Cons of the Options

### Scroll to the center

- Good, because one call fixes the edge-overlay case.
- Bad, because a full-height overlay or a large centered banner still covers the element.

### Detect occlusion and scroll past it

- Good, because it handles overlays anywhere.
- Bad, because it needs a hit-test loop over the padded rect and a policy for elements that stay covered.

### `scrollOffset` option

- Good, because the author controls it exactly.
- Bad, because every author has to know and maintain their header's height, per site.
