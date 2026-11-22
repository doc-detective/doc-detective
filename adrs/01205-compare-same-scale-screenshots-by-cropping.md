---
status: accepted
date: 2026-11-14
decision-makers: doc-detective maintainers
---

# Compare same-scale screenshots by cropping, not resampling

## Context and Problem Statement

When a `screenshot` step compares a capture against a reference of a different size, `saveScreenshot` first checks
that the aspect ratios are within 5% (`aspectRatiosMatch`). It then resampled **both** images with sharp to the
smaller width and the smaller height, and ran pixelmatch on the result.

Resampling rewrites every row. Two images whose shared region is byte-for-byte identical report drift. A reference of
1321×433 against a capture of 1321×432, with no product change, reported 6.18%. That's over the default `maxVariation`
of 0.05, so the step returned WARNING and, under `overwrite: "aboveVariation"`, replaced the committed reference
([#719](https://github.com/doc-detective/doc-detective/issues/719)).

Near-miss sizes are common. A cropped element's size can shift by a pixel. A viewport can differ by a few pixels when
the resize to the reference ([ADR 01144](01144-resize-to-reference-and-default-browser-size.md)) doesn't apply. That
covers crops, recordings, and a browser that can't reach the size.

The resample does serve one case: a reference taken at a different `devicePixelRatio`. Then both dimensions differ by
the same factor, and the content is the same picture at another scale. ADR 01144 leaves that case to the resample on
purpose.

How should two differently sized images be compared so unchanged content reports no drift?

## Decision Drivers

- Unchanged content must report a variation of 0.
- A `devicePixelRatio` difference must keep comparing as it does now.
- No change for same-size images, so existing references and variations don't shift.
- Keep the aspect-ratio gate and its `aspectRatioMatches` output as they are.

## Considered Options

- **A. Crop to the common top-left region when the images share a scale; resample only for a larger uniform scale**
  (chosen).
- **B. Always crop to the common top-left region.**
- **C. Fail on any size mismatch.**
- **D. Keep resampling.**

## Decision Outcome

Chosen option: **A**.

After the aspect-ratio gate, the comparison checks the scale. The images share a scale when each dimension of the
smaller is at least 95% of the larger. It then copies the top-left `min(width)×min(height)` rows of each image and compares those.
Otherwise the difference is a uniform scale (the aspect gate already holds), so both images resample to the smaller
size as before. The 5% bound matches the aspect gate's tolerance and sits below the smallest common display scale step
(110%, a 0.91 ratio).

### Consequences

- Good, because a capture a few pixels larger or smaller than its reference, with unchanged content, reports 0 and
  no longer overwrites the reference.
- Good, because a `devicePixelRatio` difference compares exactly as before.
- Neutral, because content past the common region (the extra rows or columns of the larger image) isn't compared.
  It counted only as smeared drift before, and a size change beyond 5% still resamples.
- Bad, because a genuine uniform rescale of under 5% in both dimensions now compares by cropping, so misaligned
  content reports high drift. No common display scale is that close to 1.

### Confirmation

- `test/saveScreenshot.test.js`: a reference and a capture that's its top rows minus one report a variation of 0 and
  leave the reference untouched. A capture at 2× the reference still resamples and passes.
- `test/core-artifacts/capture/screenshot-variation.spec.json`, `variation-near-miss-size`: a crop 1px taller than its
  reference reports a variation of exactly 0 through the real runner.

## Pros and Cons of the Options

### A. Crop at the same scale, resample at a larger uniform scale

- Good, because it fixes the false drift and keeps the pixel-density case.
- Bad, because it adds a threshold to tell the two cases apart.

### B. Always crop

- Good, because it's the simplest rule.
- Bad, because a 2× reference would compare its top-left quarter against the whole capture and report large drift.

### C. Fail on any size mismatch

- Good, because the result can't mislead.
- Bad, because a 1px shift in a cropped element would fail the test, which is a regression from today's WARNING at
  worst.

### D. Keep resampling

- Bad, because it reports drift for unchanged content and overwrites good references.
