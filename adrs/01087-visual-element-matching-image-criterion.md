---
status: accepted
date: 2026-07-27
decision-makers: [hawkeyexl, Claude]
---

# Visual element matching via an `image` finding criterion

## Context and Problem Statement

Doc Detective locates elements through DOM/accessibility semantics: `selector`, `elementText`, `elementId`, `elementTestId`, `elementClass`, `elementAttribute`, `elementAria`. Some UI can't be reached that way — canvas-rendered controls, custom-drawn icons, native-app widgets without stable automation metadata, or documentation workflows where the author only has a cropped screenshot of the target. How should Doc Detective locate an element from a *picture* of it, consistently across every element-finding action and every supported surface (desktop browsers, mobile web, and Windows/macOS/Android/iOS native apps)?

## Decision Drivers

- Must work on **all supported platforms** without native build toolchains (the historical OpenCV-binding failure mode).
- Must be available in **every** element-finding site — `find`, `click`, `dragAndDrop` source/target, `type` element targeting, `waitUntil.find`, `screenshot.crop`, `annotate` targets — not a parallel one-action feature.
- Found elements should be **real elements** wherever possible, so the existing sub-effects (`moveTo`, `click` buttons/duration, `type`) and `outputs.element` contract keep working unchanged.
- Robust to display scaling (Retina, Windows 125–200%): a template captured at one DPI must match a screen at another.
- Deterministic, debuggable failures: a miss must say how close the best candidate came and show where it was.

## Considered Options

1. **Appium `images` plugin** (`-image` locator strategy) loaded into the already-spawned Appium servers.
2. **Call the plugin's engine (`@appium/opencv`) directly** from Doc Detective's own find pipeline.
3. Native OpenCV bindings (`opencv4nodejs` / forks).
4. Hand-rolled normalized cross-correlation on the existing `sharp`/`pngjs` stack.

## Decision Outcome

Chosen option: **call `@appium/opencv` directly** (option 2), integrated as a new `image` criterion in the shared find pipeline.

- **Engine**: `@appium/opencv` (Apache-2.0) → `opencv-bindings`, opencv.js compiled to WASM — zero native build, no `os`/`cpu` restrictions. Registered as a standard heavy dep (`HEAVY_NPM_DEPS` + `optionalDependencies`), JIT-installed like `sharp`/`pixelmatch`. A load failure at match time is a step **FAIL** with an actionable install message (the match is the step's purpose — pixelmatch precedent), never a silent skip.
- **Criterion shape**: `image` accepts a bare string (template file path, resolved like other spec paths, or a `data:image/...;base64,` URI) or an object `{ path, matchThreshold?, region? }`. It **AND-combines** with the existing seven criteria. The bare-string step shorthand (`"find": "Save"`) never means image.
- **Threshold**: fractional 0–1 `matchThreshold` (ADR 00139 semantics), default **0.8**, overridable per step and via a new `imageMatching.matchThreshold` config object.
- **Scaling is automatic and not configurable**: the template is matched across a scale ladder `{captureScale, 1, 1/captureScale}` where `captureScale = capturedImageWidth / logicalWidth` (the existing `computeScale`); best score wins. Empirically, a 2×-vs-1× mismatch otherwise fails totally.
- **Element recovery**:
  - Browsers: match center → `document.elementFromPoint` → real element; all sub-effects and `outputs.element` work unchanged.
  - Native apps: match center → `getPageSource()` XML (all four drivers expose per-node bounds) → smallest bounds-containing node → positional XPath → real element handle. **Best-effort**: on any recovery failure the find still succeeds with rect-only outputs (`outputs.imageMatch = {rect, center, score, scaleUsed}`), and a click sub-effect falls back to a coordinate tap.
- **Ambiguity fails loudly**: ≥2 matches at/above threshold with nothing (other criteria, `region`) to disambiguate is a FAIL naming the count, scores, and locations — never a silent first-match click.
- **Miss diagnostics**: the failure description reports the best candidate's score, and a best-effort annotated screenshot with the best-candidate box is written alongside other step media.

### Consequences

- Good: one matching engine and one behavior on every surface; no per-platform capability matrix for the core feature.
- Good: existing pipelines (assertion model via `outputs.found`, annotations geometry, screenshot capture per surface) are reused, not duplicated.
- Bad: template matching is viewport-bound on browsers (below-the-fold templates don't match; no auto-scroll in v1) and adds capture+match cost (~100 ms–1.5 s) per poll iteration, so image finds poll less often within a timeout.
- Bad: `outputs.element` for an image-only browser find describes the **topmost** node at the match center, which may be a child of the logical control (matches what a real user's click would hit).

### Confirmation

Unit suites for the pure matcher/scaling/recovery helpers (`test/visualMatch.test.js`, `test/pageSourceRecovery.test.js`); schema positive/negative cases in `src/common/test/validate.test.js`; feature fixtures in `test/core-artifacts/visual-find/` (self-seeded template via screenshot crop, AND-combination disambiguation, region scoping, data-URI form, app-surface permutations gated by `runOn`); negative paths (ambiguity, missing template, below-threshold miss with diagnostic) asserted programmatically in the mocha core suite.

## Pros and Cons of the Options

### Appium images plugin

- Good: least code; maintained upstream; battle-tested matching heuristics.
- Bad: image elements support only a crippled command set — no `getText`/`getHTML`/`isEnabled`/`getComputedLabel` (breaks `setElementOutputs`), no `sendKeys` (breaks the `type` sub-effect).
- Bad: with any plugin loaded, Appium 3 skips the direct JWP proxy for **every** command in **every** session (plugin `handle` matches all commands), then requires `proxyCommand` on the driver for fallback — bound by the chromium/windows/mac2/xcuitest drivers but **not** by appium-geckodriver or appium-safari-driver, which would break Firefox/Safari sessions outright.
- Bad: never recovers real elements anywhere.

### Call @appium/opencv directly (chosen)

- Good: WASM install verified on Windows with zero toolchain; same code path on every surface; real-element recovery on browsers *and* (best-effort) native apps; slots into the existing heavy-dep JIT machinery and find pipeline.
- Bad: we own the matching orchestration (scale ladder, ambiguity, staleness) rather than inheriting the plugin's.
- Neutral: adds ~8.4 MB WASM to the runtime cache — comparable to existing heavy deps.

### Native OpenCV bindings (opencv4nodejs and forks)

- Good: fastest matching.
- Bad: native builds are the exact cross-platform failure mode this design must avoid (the reason Appium itself migrated to WASM bindings); forks are single-maintainer.

### Hand-rolled NCC on sharp/pngjs

- Good: no new dependency.
- Bad: reimplements `cv.matchTemplate` at O(W·H·w·h) in JS; an image-pyramid implementation is a project of its own; not justified against an 8.4 MB Apache-2.0 WASM dep.

## More Information

- Empirical probe results (Windows x64, Node 24): exact-scale match score 1.0000 (85–480 ms by capture size, ~600 ms one-time WASM init); uniform color drift → 0.9986; 2× capture vs 1× template → total failure; DPR-rescaled template → 0.9752. ORB/AKAZE/BRISK feature matching finds zero keypoints on small flat icons — template matching only in v1.
- Related: ADR 00139 (fractional thresholds), ADR 00020/00066 (screenshot visual diff), ADR 01081 (uniform surface routing), ADR 01061 (find text-matching semantics).
