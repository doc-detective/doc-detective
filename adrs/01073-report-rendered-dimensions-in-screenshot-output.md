---
status: accepted
date: 2026-07-15
decision-makers: doc-detective maintainers
---

# Report the saved screenshot's rendered dimensions in the step output

## Context and Problem Statement

The external report that prompted this work ("The Browser Had a Floor I Didn't Know About") ended with
a manual workaround: the author inspected the saved screenshot's file dimensions and captioned the
image with the size the page *actually* rendered, because "requested and rendered aren't always
identical, and the images are the ground truth, not the caption."

Doc Detective's `saveScreenshot` action exposed `screenshotPath`, `variation`, and a few crop/compare
booleans, but never the captured image's dimensions. So a reader of a run report — or a downstream
step building a caption — had no programmatic way to know the size the page rendered at; they'd have to
open the PNG. When a viewport is floored ([ADR 01071](01071-warn-when-a-browser-floors-a-requested-viewport.md)),
that rendered size is exactly the fact worth surfacing.

## Decision Drivers

* Make the rendered size — ground truth — available without opening the file.
* Reflect the *saved* image (post-crop), not an intermediate capture.
* Never fail a screenshot over a metadata read.

## Considered Options

1. **Add `width` and `height` to `saveScreenshot`'s `outputs`, read from the final PNG buffer**
   (chosen). Computed once from `finalBuffer` (the captured-or-cropped buffer that gets written), so it
   reflects exactly what was saved. Always present; best-effort (a metadata failure leaves them unset,
   never fails the step).
2. **Report the viewport CSS dimensions instead of the image pixel dimensions.** Rejected: the image
   pixels are the true "what was saved" and already fold in devicePixelRatio and any crop; the caption
   use-case wants the file's dimensions.
3. **Do nothing (leave it to the user to open the file).** Rejected: that is the manual workaround this
   is meant to remove.

## Decision Outcome

Chosen: **option 1**. After `finalBuffer` is finalized (post-crop, pre-write), `saveScreenshot` reads
its dimensions via `sharp(finalBuffer).metadata()` and sets `result.outputs.width` /
`result.outputs.height`. Because `finalBuffer` is the cropped buffer on the crop path, the reported
dimensions reflect the crop, not the full capture. The read is wrapped so a metadata failure is
swallowed (the screenshot still succeeds).

### Consequences

* Good: the rendered size is in the report and referenceable (`$$width` / `$$height`) for captions or
  later steps — the article's workaround, automated.
* Good: reflects the saved file exactly (crop-aware, DPR-aware).
* Neutral: one extra in-memory `sharp().metadata()` per screenshot.
* Neutral: additive output; no existing output or side effect changes.

### Confirmation

* Unit: a 375×812 PNG fed through the in-memory capture path yields `outputs.width === 375` /
  `outputs.height === 812` — `test/recording-screenshot-coverage.test.js` ("reports the saved
  screenshot's rendered dimensions in outputs"). The existing `test/core-artifacts/capture/`
  fixtures exercise the screenshot path end-to-end (the crop path reuses the same `finalBuffer`, so
  cropped captures report cropped dimensions structurally).

## Pros and Cons of the Options

### Option 1 — width/height from the final PNG buffer
* Good: exact, crop- and DPR-aware; additive; cheap.
* Bad: none material (best-effort metadata read).

### Option 2 — viewport CSS dimensions
* Good: matches the requested-viewport vocabulary.
* Bad: not what was saved; ignores crop and DPR.

### Option 3 — do nothing
* Good: zero code.
* Bad: leaves the manual "open the file" workaround in place.

## More Information

Companion to [ADR 01071](01071-warn-when-a-browser-floors-a-requested-viewport.md) (warn on a floored
viewport). Origin: external report (Diana Payton, "The Browser Had a Floor I Didn't Know About").
