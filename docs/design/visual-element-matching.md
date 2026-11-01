# Design: find elements by image

Status: **pre-approved by hawkeyexl on 2026-11-01, revision 5**. This is the first change run
through [docs as the spec](docs-as-spec-process.md). The user-facing half of the spec is
[Find elements by image](../fern/pages/docs/test-docs/find-elements-by-image.mdx), and the decision
record is [ADR 01146](../../adrs/01146-find-elements-by-image.md).

## Problem

Every `find` criterion reads the DOM or the accessibility tree. Anything drawn rather than structured is
out of reach: an icon with no text or label, a canvas, a chart, or a custom-drawn widget. Authors fall back
to hard-coded coordinates in `runBrowserScript`, which break the moment the layout moves.

The main use is "find this icon." `find` and everything that delegates to it should accept a picture of
the target, and that picture should work in every browser.

## Measurements

Measured on 2026-11-01 with `@appium/opencv` 5.0.2, on Windows 11. The measurements used real captures from Doc Detective's
managed headless Chrome and Firefox, plus Chrome started directly at 1× and 2×. A score is OpenCV's
`TM_CCOEFF_NORMED` result. The icons are 8 Font Awesome Solid icons rendered as inline SVG, `<img>` SVG, webfont,
and downscaled PNG, at 16 to 24 pixels. The cases include fractional positions, a dark toolbar, a tinted toolbar, and
inside buttons. The multi-color set is 6 hand-drawn SVGs, three of which share an outline. The other elements are
35 controls, text blocks, and canvas drawings.

A second round measured the same 30 common interface icons from each of 10 sets. The sets were Lucide at strokes 2, 1.5,
and 1, Feather, Tabler, Heroicons, Phosphor regular, light, and thin, and Font Awesome Solid. At 24 pixels tall, their strokes
run from 0.75 to 2 pixels. The rows cover 14 to 48 pixels, `<img>`, a webfont, dark and tinted toolbars, light gray icons,
inside buttons, fractional sizes, and sub-pixel transforms. The pages also hold text, form controls, a table, and a
horizontal rule, for false matches to land on. The 30 icons deliberately include simple shapes and pairs that differ by a
small detail. The false-match rates below are therefore worst cases rather than typical ones.

**Icons and graphics match across browsers:**

| Reference | Other browser | Other display scale | Not on the page |
|---|---|---|---|
| Icon cropped from a screenshot | 0.96–1.00 | 0.92–1.00 | up to 0.71 |
| Icon file, one color, at the displayed size | 0.93–1.00 | 0.98–1.00, at device size | up to 0.86 |
| Icon file, one color, every whole size from 12 to 64 pixels | 0.93–1.00, plus one 0.89 | Same | up to 0.96 |
| Icon file, several colors, at the displayed size | 0.91–0.99 | Not measured | up to 0.66 |
| Icon file, several colors, tried at 13 sizes | Same | Not measured | up to 0.86 |
| Canvas shapes, charts, gradients, bitmaps | 0.998–1.000 | 0.85–1.00 | up to 0.63 |

The one-color and several-color file rows use the matching methods in decisions 4 and 5. They hold on white,
dark, and tinted backgrounds. Different icons are covered [below](#lookalikes-pass).

**Correlation alone ignores color.** `TM_CCOEFF_NORMED` removes each channel's mean and scale, so a recolored icon scores
high. A third round put the same icons in 18 colors on white, dark, and tinted backgrounds. It recolored the multi-color
icons without changing their shapes:

| Reference, against the same shape in another color | Reached 0.9 on correlation alone | Reached 0.9 with color counted, decisions 2–5 |
|---|---|---|
| One-color file | All, because a silhouette has no color | None with a different hue, only nearby shades |
| Opaque crop | 59%, 864 of 1,456 | 3%, 48 of 1,456, all nearby shades, and up to 4% on the thinnest strokes |
| Multi-color file | 19%, 60 of 312 | 11%, 34 of 312, all nearby shades |

Counting color costs real matches almost nothing. Across both browsers, one-color files scored about 1.00 on the page's own
color at every stroke width and size measured. Multi-color files scored 0.98 or above, and opaque crops 0.89 or above,
reaching 0.9 in 99–100% of cases. In the whole-size sweep at 0.9, no real icon was lost to color, of 5,426. Graphics
stayed at 0.98 or above, a paragraph at 0.97, and a heading at 0.99.

"Nearby" means about 32 RGB levels apart or closer, such as `#e01b24` and `#c01c28`, or `#222222` and `#333333`. Thin strokes
have one more allowance. Below about 1.5 pixels, browsers draw a stroke up to 28% lighter than a file predicts, but its hue
stays within 2 levels. So a `#333333` file can also match `#555555` on a thin icon, but never a different hue.

**Thin outlines match as well as solid icons, at whole sizes.** Scores at the real icon, in both browsers, trying every
whole size:

| Set | Stroke at 24 pixels | Whole sizes, lowest score | Fractional sizes reaching 0.9 | Sub-pixel transforms reaching 0.9 |
|---|---|---|---|---|
| Font Awesome Solid | Solid | 0.95 | 100% | 98% |
| Lucide | 2 | 0.98 | 93% | 93% |
| Heroicons | 1.5 | 0.93 | 87% | 98% |
| Lucide | 1 | 0.93 | 76% | 33% |
| Phosphor thin | 0.75 | 0.93, plus one 0.89 | 68% | 53% |

At the displayed size, Feather and Tabler at stroke 2 scored 0.98 or above. At that size, Lucide at 1.5, Phosphor regular, and
Phosphor light scored 0.93 or above. Dark and tinted toolbars, light gray icons, `<img>`, a Lucide webfont, and icons inside
buttons score like plain inline SVG. Both browsers snap fractional layout positions to whole pixels, so those score like
whole positions too. A `transform` isn't snapped, and neither is a fractional size. The fractional sizes were 17.5, 18.67,
19.2, and 22.4 pixels, and 17.5 was the hardest, at 33–70% for outlines.

**A small raster file doesn't enlarge well.** A 256-pixel PNG resized to the displayed size scored 0.91–1.00. When shrunk to
16 or 20 pixels, a 24-pixel PNG scored 0.90–1.00. When enlarged to 26 pixels, 0–10% of outline icons reached 0.9, and when
enlarged to 32 pixels, 0–50%. Solid icons reached it 97% of the time at both.

**A page that overrides the stroke width needs a matching file.** Half a step apart passes nearly always: a file at
stroke 2 against a page at 1.5 reached 0.9 in 96% of cases. A file at stroke 2 against a page at stroke 1 reached it in
48% of cases overall, and 28% at 24 and 32 pixels.

**A real 2× capture needs device-size matching.** Chrome only, with a file at twice its CSS size against the capture as it
is: 0.98–1.00, including half CSS pixel positions. Scaling the capture down to CSS pixels first scored 0.97–1.00 at whole CSS
pixel positions. It scored 0.64–0.86 at half pixel ones, which a 2× display draws sharply and a scaled capture blurs. Solid icons
fell to 0.85. The resize kernel made no difference.

<a id="lookalikes-pass"></a>
**Some different icons pass 0.9.** The first round's 8 icons had none of these shapes, so its "different icon up to 0.87"
was a sampling artifact. With the real icon gone, these reach 0.9 or above on a page that holds the other:

| What matches | Example | Score |
|---|---|---|
| Icons sharing an outline, differing by a small detail | `square-check` and `square`, `info` and `circle` | 0.90–0.96 |
| A simple icon, and the same shape in text | `plus` and `+`, `chevron-right` and `>` | 0.90–0.96 |
| A simple icon, and a form control or rule | `circle` and a radio button, `square` and a checkbox, `minus` and `<hr>` | 0.90–0.98 |
| A thin shape, and the same shape in a larger icon | `check` and `circle-check`, `minus` and the shaft of `arrow-right` | 0.90–0.96 |
| A solid shape, and the same shape in a larger icon | solid `circle` and the head of `user` | 0.94–1.00 |

Every pair that reached 0.9 is one of these kinds. With every whole size tried, the real icon outranked them for
99.4–100% of outline icons and 97.7% of solid ones. The exceptions are `chevron-right` at stroke 1 against a `>`, and a
solid `circle` against the head of `user`.

**A plain comparison doesn't work for a transparent icon file:**

| File matched as | One-color icon | Multi-color icon, on white | Multi-color icon, on dark |
|---|---|---|---|
| As it is, with alpha treated as content | 0.28–0.30 | Not measured | Not measured |
| Flattened on white | 1.00 on white only | 1.00 | 0.28–0.45 |
| Silhouette, shape only | 0.99–1.00, any color | 0.71–0.99, picks the wrong icon when outlines match | 0.72–0.97, the same |
| OpenCV mask | No usable result | 0.91–0.99, right icon | 0.94–0.99, right icon |

**Text is what doesn't travel:**

| Content | Other browser | Other display scale |
|---|---|---|
| Text drawn in a canvas | 0.995 | 0.96–0.99 |
| Button with an icon and a label | 0.84–0.97 | 0.91–0.95 |
| Paragraphs and headings | 0.88–0.98 | 0.83–0.89, paragraph only |
| Absolutely positioned button with text | 0.80–0.94 | 0.77–0.89 |
| Buttons with text in page flow | 0.50–0.73 | 0.81–0.82 |
| Form inputs in page flow | 0.67–0.71, on the wrong input | Not measured |

**Near-identical elements score high when the real target is gone.** A form input with different placeholder text
scored 0.96–0.97, and canvas text one letter shorter 0.95. Likewise, a chart with one bar changed scored 0.94, and a button whose text
is one letter shorter 0.93. Beneath those, a gear with 6 teeth instead of 8 scored 0.83, and a different button with
the same styling up to 0.77. When the real target is on screen in the same browser, it scores 1.0 and outranks all of
these.

**Preprocessing didn't help.** Grayscale and Gaussian blur raised the wrong matches as fast as the right ones. Blurring
also put fewer references in the right place: 18 of 28 at σ=2, and 12 of 28 at σ=5, against 21 of 28 unprocessed.

**Two inputs score a false 1.000:** a single-color reference, and a reference larger than the capture. The second does so because OpenCV
swaps the two images when the template is the larger one.

**Cost at 1200×800.** `getImageOccurrence` takes about 95 ms, most of it converting images. Calling `matchTemplate` directly
on a single channel takes about 31 ms, and 85 ms at 2400×1600. That one result holds both polarities, because the score
against a negated image is exactly the negative. `getImageOccurrence` gave 0.9961 and 0.9970 for the two, and the direct
result's maximum and minimum were 0.9961 and −0.9970. Trying all 53 whole sizes takes about 1.6 s at 1× and 4.5 s at 2× when
nothing matches. Rendering a file at all 53 takes about 80 ms. When the icon is there, stopping at a score of 0.98 tries
16–30 sizes on average. The results are the same as trying them all for outlines and nearly the same for solid icons. A masked
comparison takes about 225 ms, or 3 s for 13 sizes. A plain match at 2400×1600 takes about 370 ms, and a masked one about 1.1 s. The first match in a process adds about
600 ms to start the WebAssembly build. The packages add 8 MB to the runtime cache, because `sharp` is already a heavy dep.

**Process state.** The first match changes it. `opencv-bindings` adds an `uncaughtException` handler, and `initOpenCv`
removes every `unhandledRejection` listener on each call.

## Decisions

1. **`elementImage` joins the existing criteria,** as a path, or as an object holding either `path` or `base64`, plus an
   optional `threshold` and `color`. Base64 lives in its own field rather than in the string form, because a short file name
   can also be valid base64. Only a named field can't be misread. It sits beside `elementText` and the rest on every
   schema that names them: `find`, `click`, `dragAndDrop`, `type`, `goTo.waitUntil.find`, `waitUntil.find`,
   `screenshot.crop`, and annotation targets.
2. **Color always counts.** A location's score is the lower of its shape score and its color score. A perfect shape therefore can't
   make up for the wrong color. Color score is `1 − distance / 441`, where 441 is the largest possible RGB distance, so the
   default threshold allows 44 levels. Every shape peak at or above the threshold gets a color check. That's because a page can hold
   the same icon in two colors with the same shape score.
3. **An opaque reference compares as it is, with color from gain and offset.** An opaque image, such as a crop from a
   screenshot, keeps its background, so its background also has to match. Correlation can't see a per-channel gain or
   offset, so that's what the color check measures. Over the matched window, it takes each channel's gain from the ratio of
   standard deviations and its offset from the means. It then reports how far the reference's colors move under them. This
   needs no pixel alignment, so text that shifts between browsers isn't punished twice.
4. **A transparent one-color file finds its shape by silhouette, and its color by a fit.** Its alpha channel is compared with
   the grayscale capture. One result map covers both polarities, because an icon can be lighter or darker than its
   background, and color decides which is right. At each peak, a per-channel fit of `capture = background + (icon −
   background) × alpha` gives the background and the icon's color. The slope is the ratio of standard deviations, because a
   least-squares slope shrinks when a stroke is slightly misaligned. The difference from the file's color then splits in two.
   The part off the line from the background to the file's color is hue, and counts in full. The part along that line is
   lightness. It counts only past a tolerance of 5%, or 25% when `Σα² / Σα`, the share of ink at full coverage, is below 0.75.
5. **A transparent multi-color file finds its shape through an OpenCV mask.** Only its opaque pixels count, so the background
   doesn't matter and the colors and interior do. A silhouette can't do this, because a green check and a red cross in the
   same disc share one. Color comes from gain and offset over the opaque pixels, as in decision 3. `getImageOccurrence` has
   no mask argument, so this path calls `matchTemplate` through `opencv-bindings`, the package `@appium/opencv` wraps. A mask
   gives no usable result for one color, which is why decision 4 exists.
6. **`color` says what color an icon is on the page.** Icon sets draw in `currentColor`, which has no color until a page sets
   one, so such a file renders black. `color` overrides the file's color, and a file with no `color` matches its own. This
   leaves no way to ignore color, on purpose. A failed match names both colors and suggests `color`, so the fix is one field.
   `color` applies only to a transparent one-color file, and on anything else it fails the step.
7. **A transparent file is tried at many sizes, and the best score wins.** Files are rarely the size they're displayed at.
   A one-color file is tried at its own size. It is then tried at 24, 16, 20, 32, 18, 14, 22, 28, 36, 40, 48, 64, and 12 CSS
   pixels tall. Then it is tried at every other whole size from 12 to 64. A list of common sizes isn't enough. A 15-pixel
   icon reached 0.9 at most 13% of the time, and a 26-pixel one at most 57%. Trying every whole size finds all of them but
   one, which scored 0.89. Taking the first size to reach the threshold isn't enough either: it chose the wrong place up to
   7% of the time. That happened because a false match at an earlier size came before the real icon at a later one.
   Stopping as soon as a score reaches 0.98 saves about half the time when the icon is there. A multi-color file is tried
   at its own size and the 13 listed sizes only. That's because each masked comparison takes about seven times as long.
8. **Transparent files match at device resolution.** On a surface with display scale `s`, each CSS size is multiplied by `s`,
   and the capture stays as it is. Scaling the capture down would be cheaper, but it blurs anything at a half CSS pixel
   position, which drops outlines to 0.64–0.86.
9. **An SVG is rendered fresh at each size, and a raster is resized.** Enlarging a small PNG loses thin strokes, and rendering
   all 53 sizes takes only about 80 ms.
10. **The default threshold is 0.9.** These results count color, and use the sweep in decision 7 and a file in the page's
    color. The sets were Lucide at strokes 2 and 1, Heroicons, Phosphor thin, and Font Awesome Solid:

    | Threshold | Real icon chosen, whole sizes | Real icon reaches it, fractional sizes and sub-pixel transforms | Icon gone, something else on its page passes | Icon gone, page with no lookalikes, something passes |
    |---|---|---|---|---|
    | 0.80 | 98–100% | 98–100% | 29–53% | 2–23% |
    | 0.85 | 98–100% | 85–100% | 18–38% | 0–12% |
    | **0.90** | 98–100% | 60–99% | 0–23% | 0–7% |
    | 0.95 | 94–100% | 19–86% | 0–10% | 0–2% |
    | 0.97 | 85–100% | 7–57% | 0–7% | 0% |

    0.8 finds no more real icons at whole sizes than 0.9, and it lets far more wrong ones through. 0.95 is stricter, and
    it's what an author should choose when a state matters. But it starts missing the thinnest icons, and several-color files
    that score as low as 0.91. Misses say what happened and take one field to fix, while a false pass is silent. So this
    leans strict without giving up real icons. Headings at 0.88 and some icon buttons at 0.84 need a step-level `threshold`.
    So do thin icons at fractional sizes or under a sub-pixel `transform`.
11. **Lookalikes in the same color pass at the default.** An icon that's gone can pass on a page showing a sibling with the same
    outline and color, such as `square` for `square-check`. It can pass on a page showing a character with the same shape and
    color, such as `+` for `plus`. The real icon nearly always outranks these when it's there, so clicks land correctly. An
    author checking a state raises `threshold` on that step, and one matching a simple glyph scopes the search with other
    criteria. See [Deferred](#deferred) for an automatic check.
12. **An opaque reference that misses at its own size is retried at 1× and 2× sizes.** The retries use `s` and `s/2` times
    its size, where `s` is the surface's display scale. Icons score 0.92–1.00 this way. Of 34 opaque references tried with
    the target masked out, only two smooth gradient badges falsely passed at 0.8, both at half size.
13. **Cross-browser buttons with text aren't solved.** They score 0.50–0.73, and a different button scores up to 0.77, so no
    threshold can accept one and reject the other. They have text, so `elementText` is the better tool.
14. **A match stands in for an element.** It's a small object with the methods callers already use, whose rectangle comes
    from the match. `find`, `click`, `moveTo`, and `type` then work without a branch per caller. The few paths that pass an
    element to `driver.execute` branch on `isVisualMatch`.
15. **Coordinates, not hit-testing.** `elementFromPoint` would return the whole `<canvas>`, and clicking that element clicks
    its center rather than the match. The match's own center is the only correct point.
16. **All criteria route through `findElementByCriteria`.** The callers that bypass `findElement` (`type`, readiness waits,
    `all` annotations) already go through it, so there's one place to add the branch.
17. **Other criteria scope the search.** That keeps the existing rule that every criterion must hold, and it's the way to
    pick one of several identical matches.
18. **Browser surfaces on desktop only, for now.** See [Deferred](#deferred).

## Internal claims

These describe behavior no user-facing page should promise, but that the implementation must keep.

<!-- cite image-process-listeners image-process-listeners-proof -->
Matching leaves the process's `unhandledRejection` and `uncaughtException` listeners as it found them.

<!-- cite image-needs-inferred image-needs-inferred-proof -->
A run whose steps name `elementImage` adds `@appium/opencv`, `opencv-bindings`, and `sharp` to its inferred runtime needs,
so they install during preflight rather than in the middle of a step.

<!-- cite image-score-min image-score-min-proof -->
A location's score is the lower of its shape score and its color score, for every kind of reference.

<!-- cite image-sweep-best -->
When several sizes of a transparent file reach the threshold, the highest score wins, so a false match at an earlier size can't beat the real icon at a later one.

<!-- cite image-device-pixels image-device-pixels-proof -->
On a surface with a display scale above 1, a transparent file matches at its CSS size times the scale, against the capture at device resolution.

## Plan

Every claim, its proof, and the wave that builds it. Test names in
[find-image.test.js](../../test/find-image.test.js) start with the claim ID. The fixture is
[find-image.spec.json](../../test/core-artifacts/interactions/find-image.spec.json).

| Claim | Proof | Wave |
|---|---|---|
| `image-field-forms` | [validate.test.js](../../src/common/test/validate.test.js) | 1 |
| `image-auto-install` | [runtime-heavy-deps.test.js](../../test/runtime-heavy-deps.test.js) | 1 |
| `image-needs-inferred` | [runtime-infer-needs.test.js](../../test/runtime-infer-needs.test.js) | 1 |
| `image-path-relative` | [find-image.test.js](../../test/find-image.test.js) | 1 |
| `image-file-formats` | find-image.test.js, fixture | 2 |
| `image-base64` | find-image.test.js, fixture | 2 |
| `image-base64-not-printed` | find-image.test.js | 2 |
| `image-default-threshold` | find-image.test.js | 2 |
| `image-file-one-color` | find-image.test.js, fixture | 2 |
| `image-file-multicolor` | find-image.test.js, fixture | 2 |
| `image-file-any-size` | find-image.test.js, fixture | 2 |
| `image-svg-rendered` | find-image.test.js | 2 |
| `image-sweep-best` | find-image.test.js | 2 |
| `image-score-min` | find-image.test.js | 2 |
| `image-color-field` | validate.test.js, find-image.test.js, fixture | 2 |
| `image-color-one-color-only` | find-image.test.js | 2 |
| `image-color-hue` | find-image.test.js, fixture | 2 |
| `image-color-thin` | find-image.test.js | 2 |
| `image-device-pixels` | find-image.test.js | 2 |
| `image-opaque-exact` | find-image.test.js | 2 |
| `image-rescale` | find-image.test.js | 2 |
| `image-first-match` | find-image.test.js, fixture | 2 |
| `image-on-screen-only` | fixture | 2 |
| `image-retries-until-timeout` | find-image.test.js, fixture | 2 |
| `image-outputs` | find-image.test.js, fixture | 2 |
| `image-combined` | find-image.test.js, fixture | 2 |
| `image-miss-message` | find-image.test.js | 2 |
| `image-missing-file` | find-image.test.js | 2 |
| `image-uniform-reference` | find-image.test.js | 2 |
| `image-oversized-reference` | find-image.test.js | 2 |
| `image-process-listeners` | find-image.test.js | 2 |
| `image-click-center` | fixture | 3 |
| `image-moveto` | fixture | 3 |
| `image-type-focuses` | fixture | 3 |
| `image-drag` | fixture | 3 |
| `image-crop` | find-image.test.js, fixture | 3 |
| `image-annotation-target` | find-image.test.js, fixture | 3 |
| `image-wait` | fixture | 3 |
| `image-browser-only` | find-image.test.js | 3 |
| `image-no-mobile` | find-image.test.js | 3 |

Wave 1 is the schema and the dependency. Wave 2 is the matcher and `find`. Wave 3 is everything that delegates to `find`.
The waves run in order, because each builds on the one before it.

## Not measured

- macOS and Linux, including how their font rendering changes the text rows above.
- Safari. It isn't blocked. The page promises only Chrome and Firefox.
- Headed browsers using a GPU, which may rasterize canvas and SVG differently from these headless captures.
- Firefox at 2×. The 2× results are from Chrome, with device-size matching sampled on 10 of the 30 icons.
- Icon files with semi-transparent shadows, and detailed multi-color files such as photographs.
- Multi-color outline icons, and multi-color files at sizes off their 13-size list.
- How often lookalikes occur on real pages. The rates above come from a set chosen to contain them.
- Display color profiles. These captures are sRGB, and a macOS capture under a wide-gamut profile may shift colors past the
  tolerance.
- An icon whose color has the same grayscale value as its background. It has no contrast for the silhouette to find.
- Icons with `opacity` over a varied background. On a flat background, the color on screen is what `color` has to name.

## Deferred

- **App surfaces.** Capture and coordinates differ per platform, as the table in
  [geometry.ts](../../src/core/annotations/geometry.ts) shows. Only Windows can be tested from the machine this was built on.
  Add them when someone needs them, starting from `appWindowScreenshot` and `appWindowOrigin`.
- **Mobile browsers.** iOS web contexts reject W3C pointer actions, and device screenshots include browser chrome. Both need
  their own coordinate handling.
- **Several references on one step.** `path` could take a list, so one step could cover a per-browser reference for each
  browser. Add it if authors end up duplicating tests for this.
- **URL references.** `screenshot` accepts them through `fetchFile`. Add them when someone asks.
- **An automatic check for lookalikes.** After a silhouette match, fit the capture as `a + b × alpha`. Count pixels the
  fit misses by more than half the icon's contrast, as a share of its ink. Real icons at whole sizes stayed at 0.00–0.04.
  When the limit was set just above that for each set, this caught all 70 false matches for Lucide at stroke 2. For the
  others it caught 58–95%, leaving shapes truly contained in another icon. It adds two tuned constants and a second reason a match can fail, and
  fractional sizes and sub-pixel transforms can trip it. Add it if authors hit false passes that `threshold` can't fix.
- **Half-pixel sizes and offsets.** These would help fractional sizes and sub-pixel transforms, at four times the cost or more.
  A step-level `threshold` covers these for now.
