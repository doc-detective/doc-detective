---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Stable screenshots: settle before saving, capture-only CSS, and a fonts wait

## Context and Problem Statement

A `screenshot` step captures the page the moment it runs. Three things make that moment wrong for
docs:

* A page that's still loading, animating a spinner, or revealing content gets caught half-drawn.
  The capture then differs from its reference for reasons that have nothing to do with the product.
* Chat launchers, cookie banners, and "new" badges sit on top of the page. Authors want them out of
  the docs, but removing them with a script step changes the page for every later step.
* Web fonts that are still loading render in a fallback face, so text shifts between runs.

Playwright's `toHaveScreenshot` waits for two consecutive captures to match, takes a `stylePath`
for capture-only CSS, and waits for fonts. Users cite these as reasons to pick Playwright for
screenshots.

How should a `screenshot` step capture a page that's settled, without the widgets the author wants
hidden?

## Decision Drivers

* The saved image is documentation, so it should show the page the way a reader sees it once it
  has loaded.
* Nothing a screenshot does for the capture may leak into later steps or a running recording.
* Existing steps must capture the same image as before, at the same speed, unless they opt in.
* `stable` must report a page that never settles instead of hanging or failing the step.

## Considered Options

* **A. `style` and `stable` keys, plus an always-on fonts wait.** `style` injects CSS for the
  capture only. `stable` captures until two captures in a row are byte-identical.
* **B. Make `stable` the default.**
* **C. No new keys.** Document `wait` steps and a `runBrowserScript` that hides widgets.

## Decision Outcome

Chosen option: **A**.

* **Fonts wait, always, for browser captures.** Before the capture, the page waits for
  `document.fonts.ready`, up to 2 seconds, through `driver.execute` with a returned promise.
  A page that times out or can't report its fonts is captured as it is, with no message. It only
  ever waits for something that changes the rendering, so it can't make a capture less correct.
* **`style`** (string, CSS, at least one character). Before the capture, Doc Detective adds a
  `<style data-dd-capture>` element with the CSS to the page. Right after, in a `finally`, it
  removes every `style[data-dd-capture]`, so the page is restored even when the capture fails.
  The fonts wait runs after the style is added, so CSS that changes fonts settles too. A `style`
  that can't be added FAILs the step: ``Couldn't add the `style` CSS to the page: <cause>.``
  A capture without the CSS would put the hidden widgets into the docs.
* **`style` is a schema error on app surfaces**, through the existing `allOf` guard that rejects
  `crop` there. A native window has no stylesheet.
* **`stable`** (boolean; unset means one capture, with no schema default, so existing effective steps don't change). Doc Detective captures, then captures again every
  100 ms until two captures in a row are byte-identical, and keeps that one. The comparison is on
  the raw PNG bytes before live blurs are burned in, so it works the same for app captures, where
  `stable` is allowed. The ceiling is a fixed 5 seconds, marked with a `ponytail:` comment: a
  `stableTimeout` key can follow if pages need longer.
* **A page that never settles is a WARNING, not a FAIL.** The last capture is saved and compared
  as usual. The step adds `outputs.stable` (`true` or `false`) and the implicit assertion
  `$$outputs.stable == true` with warning severity, and appends
  ``Page kept changing for 5 seconds, so the screenshot may not be stable.`` to the description.
  Without `stable`, there's no output and no assertion.
* When the step resizes the window to match the reference and captures again (ADR 01144), the
  retake applies `style` and `stable` too. Its stability is the one reported.

### Consequences

* Good: pages that load in stages, and pages with overlays, can be captured without extra steps
  and without changing the page for later steps.
* Good: the fonts wait removes a source of fallback-font drift for every browser screenshot.
* Neutral: every browser capture runs one more `execute` call for the fonts wait, which returns
  at once on a page whose fonts have loaded.
* Bad: `stable` costs at least one more capture and 100 ms per step, which is why it's opt-in.
* Bad: a page with a continuous animation never settles, so `stable` waits the full 5 seconds and
  warns. Hiding the animation with `style` is the fix.

### Confirmation

* `test/screenshot-stable.test.js` covers `stable` settling after several captures, timing out
  into a WARNING, and capturing once without `stable`. It also covers `style` being added before
  the capture and removed after it, including when the capture throws, and the fonts wait running first.
* `src/common/test/validate.test.js` covers the new keys, the `stable` default, malformed values,
  and `style` on an app surface.
* `test/core-artifacts/capture/screenshot-stable-style.spec.json` runs each form in headless
  Chrome and Firefox. A page that settles after 300 ms PASSes with the loaded page, and `style`
  hides a banner only for the capture. An endless animation is a deterministic WARNING.

## Pros and Cons of the Options

### A. `style` and `stable` keys, plus the fonts wait

* Good: opt-in for the costly part; the cheap part helps everyone.
* Good: capture-only CSS can't leak into later steps or recordings.
* Bad: two more keys on `screenshot`.

### B. `stable` by default

* Good: matches Playwright.
* Bad: slows every screenshot step, and a page with any animation would start warning on upgrade.

### C. No new keys

* Good: nothing to build.
* Bad: a fixed `wait` is either too short or too slow, and a hiding script changes the page for
  every later step.
