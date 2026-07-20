---
status: accepted
date: 2026-07-16
decision-makers: hawkeyexl
---

# Screenshot annotations: one annotation model, one SVG renderer, surface-agnostic geometry

## Context and Problem Statement

Doc Detective captures fresh screenshots so images don't drift from the product, but any *annotation* on those images — the numbered badge, the box around the button, the blur over an account ID — is added by hand afterward, in a separate tool. That handwork rots exactly the way stale screenshots do: the capture regenerates, the annotation doesn't, and the arrow now points at the wrong control. Worse, a hand-drawn blur silently stops covering a field that moved.

We want declarative annotations that regenerate with every capture. Two hard constraints shape the design:

1. **Annotations must eventually work on recordings too**, not just stills. A video annotation has to exist while frames are captured, which pulls toward rendering in the page (a DOM overlay). A still annotation is best composited into the image (no page mutation, works on native apps). If those two paths each own their own drawing code, they will drift, and the same spec will produce two different pictures.
2. **The interface must stay as simple as reasonable.** An earlier prototype (doc-detective-common branch `annotations`, commit `38b10d4a`, schema-only, never implemented) defined 8 annotation types each with 5–9 styling properties. That surface is large to document, large to fixture, and it pushes styling decisions into every step, so a doc set drifts visually.

A third question surfaced during design: are element-anchored annotations even possible on native app surfaces, or are app captures limited to fixed-position annotations?

## Decision Drivers

* One rendering implementation for stills and recordings — divergence between media is the primary risk.
* Small authoring surface; visual consistency across a doc set by default.
* No new heavy dependencies.
* Never silently produce an image that *looks* annotated but isn't — especially for redaction.
* Don't bake in restrictions the codebase doesn't actually require.

## Considered Options

* **Option A — Minimal semantic set with strong defaults.** ~5 types, no per-annotation styling, one theme.
* **Option B — Revive the prototype schema as-is.** 8 types, full per-annotation styling.
* **Option C — Option A's surface, designed for growth.** Semantic types, shared optional `style`, theme cascade, room for later type keys.
* **Option D — Emit geometry only.** Record resolved element bounds in the report; let consumers draw.

## Decision Outcome

Chosen option: **Option C**, with a **single pure SVG generator** behind **two thin adapters**, and a **surface-agnostic geometry provider**.

**Annotation model.** `{ "<type>": <target>, label?, id?, style?, position?, track?, transition?, duration?, all? }`, exactly one type key per annotation. v1 types: `outline`, `arrow`, `badge`, `callout`, `blur`, `text`. The target *is* the type key's value: a string (selector-or-display-text, same semantics as `crop`), a detailed find object, or `{ position }`. Exactly-one is enforced with `oneOf` over single-key `required` branches — two keys satisfy two branches and fail. (The prototype used `not: { required: [...all others] }`, which is subtly wrong: `required` means *all* of the listed keys, so it only rejects an annotation carrying every other type at once. `{outline, blur}` would have passed.)

**One renderer, two adapters.** `annotationsToSvg` is pure — no driver, no sharp, no DOM — and owns every geometry and style decision. Phase 1 ships the buffer adapter (sharp composites the SVG into the captured PNG). Phase 2's `annotate` step will mount the *same* markup into a `dd-annotation-layer` DOM overlay so annotations appear in recordings. Because both consume one generator, a shape drawn in a still and in a video come from one implementation.

**Blur is the documented exception.** SVG can't blur what's behind it — a filter only affects content inside the SVG. So `annotationsToSvg` returns blur *regions* alongside the markup, and each adapter applies them in its own medium: sharp extract/blur/composite for buffers, `backdrop-filter` for the DOM. Blurs apply before the overlay so annotations drawn over a redacted region stay sharp.

**Ephemeral annotations never touch the page.** `screenshot.annotations` always composites in image space, even on browser surfaces where a DOM overlay would be possible. This keeps the page under test unmutated, works identically on app surfaces, and — critically — can't flash into a recording running concurrently.

**Surface-agnostic geometry.** The difference between a browser viewport, a desktop app window, and a mobile device screen collapses to one formula:

| Surface | Rect source | Origin subtracted | Logical width |
|---|---|---|---|
| Browser | `getBoundingClientRect()` (viewport-relative) | none | `window.innerWidth` |
| Windows app | `getElementRect()` (**window-relative**) | none | `appWindowRect().w` |
| macOS app | `getElementRect()` (screen coords) | window origin via `appWindowRect` | `appWindowRect().w` |
| Mobile (deferred) | `getElementRect()` (device coords) | none | `driver.getWindowRect().width` |

Scale is always `capturedImageWidth / logicalWidth`, derived from the capture rather than queried — Retina and Windows display scaling fall out for free, subsuming the `devicePixelRatio` read the crop path does by hand.

**The two desktop platforms differ, and the difference is empirical.** The initial design assumed all app drivers report screen coordinates, inferred from `appWindowRect` feeding ffmpeg's display crop. That's true of `getWindowRect`, but *not* of child elements on Windows: the Windows driver session is rooted at the app window (which is why `appWindowScreenshot` can call `driver.saveScreenshot()` and get exactly that window), so `getElementRect` is already window-relative. Rebasing there shifted every annotation up-left by the window's desktop position — caught by running the fixture against Character Map, where the error was exactly the (25, 115) window origin. macOS keeps the rebase: Mac2 reports screen coordinates (its `appWindowRect` result works as a display crop) while the capture is an element screenshot of the window. `appWindowOrigin` encodes this with the evidence, and `app-annotations-macos.spec.json` exists specifically to let CI verify the macOS half, which couldn't be checked on the Windows development machine.

**Element-anchored annotations work on app surfaces.** This reverses an earlier assumption. Element finding on native apps already ships: `findElement.ts:80` routes a surface-carrying `find` to the app driver, and `appSurface.ts` maps semantic fields onto UIA / AX / UiAutomator2 / XCUITest locators. `appWindows.ts:649` already reads `driver.getElementRect()`. The real restriction is *criteria*, not anchoring: only `elementText`, `elementId`, `elementTestId`, and `elementAria` map to native locators — `selector`, `elementClass`, and `elementAttribute` have no equivalent, and a bare string target is selector-or-text ambiguous. Those are rejected with a message naming the supported fields, reusing the constraint `find` already lives with.

Making this work needed one small change to `findElement`: its app path exposed only `outputs.element` (a text summary), never `outputs.rawElement`, so there was no driver handle to read geometry from. It now sets `rawElement` exactly as the browser path does via `setElementOutputs`. `runStep` already strips `rawElement` from every result, so it doesn't reach reports.

**`all` is refused on app surfaces.** The app find path compiles one native locator and resolves a single element, so honoring `all` there would annotate the first match and silently skip the rest — for `blur`, a screenshot that looks fully redacted but isn't. That's the same disclosure the fail-on-missing-target rule exists to prevent, so the step fails with the restriction named rather than under-redacting. A multi-match native find can lift this later; browser surfaces are unaffected.

**Theme cascade.** `annotationDefaults` resolves test > spec > config > built-in, mirroring `autoScreenshot`. An annotation's own `style` wins over all of them.

### Consequences

* Good: one authoring surface for stills and recordings; `track`/`transition`/`duration` are inert in stills rather than errors, so the same object means the same thing in both media.
* Good: no new dependencies — sharp (already an optional dep, JIT-loaded) rasterizes SVG natively.
* Good: the pure generator and theme resolver are hermetically unit-testable; no browser needed for the bulk of the logic.
* Good: app surfaces get element anchoring, and the geometry provider makes app `crop` (currently rejected) a straightforward follow-on.
* Bad: `annotationDefaults` duplicates the style property list in the schema, because draft-07's `additionalProperties: false` doesn't compose across `allOf`. Needs a keep-in-sync comment.
* Bad: text rendering depends on the host's fontconfig via librsvg. Mitigated with a cross-OS canary fixture and a font *stack* ending in a generic family.
* Bad: annotated screenshots change pixels, so a theme change invalidates `maxVariation` baselines. Documented; an un-annotated capture stays byte-identical (regression-tested).
* Neutral: `all: true` required adding an `all` option to `findElementByCriteria`. It reuses that function's existing candidate enumeration rather than duplicating find semantics; default behavior is unchanged.

### Confirmation

* `src/common/test/validate.test.js` — schema contract: six types, exactly-one enforcement, target shapes, the cascade, and that **no defaults are injected at any level**.
* `test/annotations-model.test.js`, `test/annotations-svg.test.js`, `test/annotations-geometry.test.js` — hermetic unit coverage of theme resolution, every renderer, and the scale/crop-origin math.
* `test/annotations-find-all.test.js` — the `all` option, including that default first-match behavior is unchanged.
* `test/annotations-screenshot.test.js` — the pipeline end-to-end, including the FAIL/WARNING paths fixtures can't express, and that an un-annotated screenshot stays byte-identical.
* `test/core-artifacts/capture/screenshot-annotations.spec.json` — every type, target shape, style override, cascade level, crop interaction, and `all`, plus the text-rendering canary across the OS matrix.
* `test/core-artifacts/apps/app-annotations.spec.json` (Windows, verified locally) and `app-annotations-macos.spec.json` (macOS, verified in CI) — element-anchored and position-anchored annotations on native app surfaces, and the platform-specific window-origin behavior.

## Pros and Cons of the Options

### Option A — Minimal semantic set, no per-annotation styling

* Good: smallest surface; enforced visual consistency.
* Bad: no escape hatch — one annotation needing a different color forces a theme change on the whole doc set.
* Bad: no room for the recording-oriented fields without a breaking reshape.

### Option B — Revive the prototype schema as-is

* Good: schema already drafted; maximum expressiveness.
* Bad: 8 types × 5–9 styling properties each is a large surface to document and to fixture ("every permutation" is a repo requirement).
* Bad: half the types overlap (`rectangle`/`highlight`/`outline`, `text`/`callout`).
* Bad: per-annotation styling everywhere means doc sets drift visually.
* Bad: its exclusivity guard is broken (see above).

### Option C — Option A's surface, designed for growth

* Good: one-liner common case; `style` as an escape hatch; theme for consistency.
* Good: new types are additive type keys — the prototype's `line`/`circle`/`rectangle`/`highlight` can land later without a break.
* Good: the same object works for stills and recordings.
* Bad: slightly more schema machinery than Option A (guards, shared style).

### Option D — Emit geometry only

* Good: least code.
* Bad: fails the high-fidelity goal for static images; pushes drawing onto every consumer.
