---
status: accepted
date: 2026-10-23
decision-makers: doc-detective maintainers
---

# Keep screenshot variation stable across the pixelmatch 8 upgrade

## Context and Problem Statement

A `screenshot` step with `maxVariation` compares the capture against the reference with
`pixelmatch` ([ADR 00020](00020-screenshot-visual-diff-matching.md),
[ADR 00066](00066-savescreenshot-directory-and-visual-diff.md)). It reports
`differing pixels / total pixels` as `outputs.variation` and returns WARNING when that exceeds
`maxVariation`. `saveScreenshot.ts` calls pixelmatch with a fixed `threshold: 0.0005`, and
`maxVariation` is the only knob users tune.

pixelmatch 8 keeps the API but replaces the YIQ color metric with OKLab + HyAB, and it reworks how
semi-transparent pixels are handled. Upstream warns that diff counts will differ and that tuned
thresholds need a re-check. A different count is a different `variation`. Users' existing
baselines and `maxVariation` values could start passing or warning differently with no change on
their side. How do we take the upgrade without moving those results?

## Decision Drivers

* An existing baseline and `maxVariation` must give the same verdict after the upgrade.
* Stay on the maintained pixelmatch major. 7.x gets no further fixes.
* `maxVariation` stays the single tolerance knob. No new user-facing options in a dependency bump.
* The decision rests on measurement, not on reading the changelog.

## Considered Options

* **A. Upgrade and keep `threshold: 0.0005`.**
* **B. Upgrade and set `threshold: 0`** (chosen).
* **C. Hold at pixelmatch 7.**
* **D. Upgrade and expose v8's `windowSize` / `ignoreMask` as screenshot options.**

## Decision Outcome

Chosen option: **B**, because it's the only upgrade path that reproduces v7's counts exactly, and
it costs one character.

What 0.0005 meant under v7: v7 compares a squared YIQ distance against
`35215 × threshold²`, which is ≈ 0.0088 at 0.0005. The smallest change an opaque pixel can make,
one level on one channel, scores at least ≈ 0.057. So v7 counted every changed opaque pixel that
its anti-aliasing detector didn't excuse. In effect, 0.0005 meant "any change." Under v8 the same
number is a HyAB distance on a 0–1 scale, and some one-level changes fall below it.

Measured with v7.2.0 and v8.0.0 side by side, using the production call shape and options:

| Corpus | v7 @ 0.0005 | v8 @ 0.0005 | v8 @ 0 |
| --- | --- | --- | --- |
| Every 24-bit color, R +1 (16,777,216 px, color metric only) | ignores 0 | ignores 1,609,386 | ignores 0 |
| Every 24-bit color, G +1 | ignores 0 | ignores 145,189 | ignores 0 |
| Every 24-bit color, B +1 | ignores 0 | ignores 1,568,028 | ignores 0 |
| Same sweeps with anti-aliasing detection on (as shipped) | identical to the rows above | identical | identical |

Real and synthetic pairs, counted at the production options:

| Pair | Changed px | v7 @ 0.0005 | v8 @ 0.0005 | v8 @ 0 |
| --- | --- | --- | --- | --- |
| Repo `image.png` vs `test/artifacts/reference.png` | 0 | 0 | 0 | 0 |
| Headless Chrome, same page twice | 0 | 0 | 0 | 0 |
| Chrome: typed into an input / checkbox checked / other page | 8,541 / 63,125 / 50,406 | 3,677 / 42,538 / 37,176 | same | same |
| Chrome crop of `#text-input`, empty vs typed | 1,305 | 1,085 | 1,085 | 1,085 |
| Chrome page shifted 1px | 26,490 | 13,401 | 13,401 | 13,401 |
| Chrome JPEG q90 round trip | 100,702 | 90,710 | 90,710 | 90,710 |
| Chrome ±1 noise on 2% of pixels | 20,882 | 18,966 | **18,962** | 18,966 |
| Chrome every channel −1 | 955,451 | 944,027 | 944,027 | 944,027 |
| Chrome downscale then upscale | 85,972 | 62,809 | 62,809 | 62,809 |
| Text at x=10 vs x=10.5 (subpixel anti-aliasing) | 2,377 | 895 | 895 | 895 |
| Text shifted 1px / word changed | 2,632 / 269 | 1,258 / 104 | same | same |
| Text `#333` → `#343434` / → `#3355aa` | 1,221 / 2,133 | 554 / 711 | same | same |
| Background `#fff` → `#fefefe` / → `#fffffe` | 46,692 | 45,989 | 45,989 | 45,989 |
| Alpha only, 255 → 254 | 48,000 | 46,582 | **46,519** | 46,582 |
| Alpha only, 255 → 128 / → 0 | 48,000 | 46,582 | 46,582 | 46,582 |
| Both fully transparent, hidden RGB differs | 48,000 | 0 | 0 | 0 |
| Both alpha 128, red −1 | 48,000 | 46,582 | **46,552** | 46,582 |

v8 at 0.0005 drifts only on near-invisible changes, and always downward, so a few baselines would
quietly report less variation than before. v8 at 0 matches v7 at 0.0005 on every row. The
anti-aliasing detector is unchanged for opaque pixels: the v8 diff is a refactor of the same
neighbor and brightness logic. v8 changes only how it composites semi-transparent pixels.

Behavior decided:

1. **Bump `pixelmatch` to `^8`** in the root `optionalDependencies`. It's still a JIT heavy dep
   loaded through `getPixelmatch`. v8 is ESM with a default export like 7.x, so the loader is
   unchanged.
2. **Call it with `threshold: 0`.** Any color difference counts. Anti-aliased pixels are still
   excused. `maxVariation` remains the only tolerance, as before.
3. **No new options.** `windowSize` (clustered-diff counting) and `ignoreMask` (masked regions)
   are real features. Exposing them is a separate decision with its own schema, fixtures, and docs
   (option D).

### Consequences

* Good: Existing baselines and `maxVariation` values give the same `variation` and verdict as
  before, on every measured case.
* Good: Doc Detective stays on the maintained pixelmatch major and picks up its fixes and speedups.
* Neutral: The `threshold` value now reads as "exact color match", which is what it already meant.
  Anyone revisiting it should know that 0.0005 was never a perceptual tolerance.
* Neutral: Semi-transparent pixels are the one theoretical gap. v8 composites them differently
  during anti-aliasing detection. At `threshold: 0`, v8 counts a sub-level change that v7's
  checkerboard blend rounded away, at very low alpha. Browser, Appium, and recording captures are
  opaque, so this only shows up when a user's own reference image carries alpha. The measured
  alpha rows still match.
* Bad: Parity depends on pixelmatch's anti-aliasing detector staying stable. A future major that
  changes it needs the same measurement again.

### Confirmation

* Unit: `test/saveScreenshot.test.js` compares a solid `rgb(0,128,0)` reference against an
  `rgb(1,128,0)` capture. Under v7 that reports `variation` 1. v8 at 0.0005 reports 0 (red); v8 at
  0 reports 1 (green).
* Fixtures: `test/core-artifacts/capture/screenshot-variation.spec.json` runs the real runner
  through a capture within `maxVariation` (PASS, variation asserted within tolerance) and one over
  it (WARNING by design, variation asserted above tolerance).
* Re-measure on the next pixelmatch major. Install both versions side by side under npm aliases.
  Then compare counts at the production options over real captures and the one-level color sweep.

## Pros and Cons of the Options

### A. Upgrade and keep `threshold: 0.0005`

* Good: No code change beyond the version range.
* Bad: Ignores one-level changes for about 6.6% of color and channel pairs that v7 counted, so
  some users' `variation` silently drops.
* Bad: It's a behavior change in a dependency bump, which would need docs and release notes to
  explain a difference nobody asked for.

### B. Upgrade and set `threshold: 0`

* Good: Exact v7 parity on every measured case. No user-visible change, so no docs change.
* Good: Makes the long-standing intent ("any changed pixel counts") explicit.
* Neutral: Parity rests on measurement rather than a contract from upstream.

### C. Hold at pixelmatch 7

* Good: Zero risk today.
* Bad: Strands Doc Detective on an unmaintained major. Each later bump gets harder.

### D. Expose `windowSize` / `ignoreMask`

* Good: Real value for noisy captures and dynamic regions.
* Bad: New public surface (schema, docs, fixtures) bundled into a dependency bump. That's a feature
  decision for its own change.
