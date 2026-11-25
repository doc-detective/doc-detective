---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Screenshot comparison tolerance and diff images

Amends [ADR 01142](01142-keep-screenshot-variation-stable-across-pixelmatch-8.md): the per-pixel color tolerance becomes the
`threshold` key, and its default changes from `0` to `0.1`.

## Context and Problem Statement

A `screenshot` comparison counts changed pixels with pixelmatch and warns when the fraction exceeds
`maxVariation`. Three gaps show up in practice:

* ADR 01142 pinned pixelmatch's `threshold` at `0` so pixelmatch 8 reproduced pixelmatch 7's
  counts. At `0`, a one-level color change counts, so font smoothing and anti-aliasing that differ
  between a laptop and a CI runner read as drift. Authors loosen `maxVariation` to compensate, which
  also hides real changes.
* `maxVariation` is a ratio. On a small crop, 5% can be a few pixels or a whole word.
* A WARNING says how much changed, not where. With `overwrite: "aboveVariation"`, the reference is
  overwritten too, so the old image is gone when the author goes to look.

How should a comparison tolerate rendering noise, cap absolute change, and show what changed?

## Decision Drivers

* No existing reference may start warning or get overwritten because of this change.
* Use pixelmatch's own options and output rather than a second diff engine.
* Nothing new is written next to the user's docs.

## Considered Options

* **A. `threshold` (default `0.1`), `maxDiffPixels`, and diff images in the run folder.**
* **B. Same keys, but keep the `threshold` default at `0`.**
* **C. Only raise `maxVariation` guidance in the docs.**

## Decision Outcome

Chosen option: **A**.

* `screenshot.threshold` is a number from `0` to `1`, default `0.1`, passed to pixelmatch as its
  per-pixel color tolerance. `0.1` is pixelmatch's own default (Playwright uses `0.2`).
  * A higher threshold can only lower the changed-pixel count, never raise it. With every other
    input fixed, the measured variation can only fall. No comparison that passed today starts
    warning, and `aboveVariation` can't overwrite a reference it would have kept. That's why the
    default can change without a major version.
  * `threshold: 0` restores ADR 01142's counts exactly.
* `screenshot.maxDiffPixels` is an integer, `0` or more, with no default. When set, the step also
  asserts `$$outputs.diffPixels <= N` at WARNING severity. It sits alongside `maxVariation`: when
  both are set, both must hold, and `aboveVariation` overwrites when either fails. The message is
  ``Screenshot differs from the reference by 412 pixels, more than `maxDiffPixels` (150).``
* When a comparison finds any changed pixel, it writes two files. They go to the context's
  `screenshots/` folder, the same folder automatic screenshots use:
  * `<name>-<stepId>.diff.png`: pixelmatch's diff output, encoded with `pngjs`.
  * `<name>-<stepId>.previous.png`: the reference bytes before any `aboveVariation` overwrite.

  `<name>` is the reference's basename without its extension. The `stepId` keeps two references
  that share a basename, such as `a/home.png` and `b/home.png`, from overwriting each other's files.
  A rerun of the same step, such as in a `goToStep` loop, appends `-2`, `-3`, and so on to both
  names. A direct `saveScreenshot` call with no context folder writes to the run folder's `screenshots/`
  folder, as the capture itself does. A failure to write them is logged and doesn't change the
  step's result.
* New outputs: `diffPixels` always, when a comparison runs; `diffPath` and `previousPath`, absolute,
  only when the files were written. Every comparison WARNING description ends with
  ``See `<diffPath>`.`` when a diff exists.
* Masks (ADR 01216) are painted before pixelmatch runs, so masked areas never appear in the diff.

### Consequences

* Good: rendering noise no longer forces a loose `maxVariation`.
* Good: small crops get an absolute limit.
* Good: every drift WARNING points at an image of what changed, and the old reference survives an
  overwrite.
* Neutral: references with subtle real changes below the 0.1 tolerance (a one-level color shift)
  stop warning. Authors who want that sensitivity set `threshold: 0`.
* Bad: two more PNGs per drifting comparison in the run folder.

### Confirmation

* `test/screenshot-tolerance.test.js` covers noise passing at the default and warning at `0`,
  `maxDiffPixels` under and over, and both limits together. It also covers diff images: written to
  the run folder and not written for identical images. Two references that share a basename keep
  separate files, as does a rerun of the same step. A direct call writes to the run folder's `screenshots/` folder.
* `test/saveScreenshot.test.js` keeps ADR 01142's one-level test with `threshold: 0`.
* `test/core-artifacts/capture/screenshot-tolerance.spec.json` runs each key in headless Chrome,
  including the deterministic `maxDiffPixels` WARNING that writes the diff images.

## Pros and Cons of the Options

### A. Default 0.1

* Good: matches pixelmatch's and the wider ecosystem's expectations; can only reduce warnings.
* Bad: a one-level color change no longer counts unless the author asks.

### B. Default 0

* Good: no change in counts at all.
* Bad: keeps the noise problem for everyone who doesn't know to set the key.

### C. Docs only

* Good: nothing to build.
* Bad: no absolute cap, no diff image, and the old reference is still lost on overwrite.
