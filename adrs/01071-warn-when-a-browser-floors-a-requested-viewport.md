---
status: accepted
date: 2026-07-15
decision-makers: doc-detective maintainers
---

# Warn (and report the realized size) when a browser floors a requested viewport

## Context and Problem Statement

Doc Detective realizes a requested browser `viewport` by resizing the OS window: it reads the
current page viewport (`window.innerWidth/innerHeight`), computes the delta to the requested size,
and calls `setWindowSize(window + delta)`. Two code paths do this — the context-level
`setViewportSize` (`src/core/tests.ts`, applied to a context's `browser.viewport`) and the
step-level `applyViewport` (`src/core/tests/startSurface.ts`, applied to a `startSurface` browser
descriptor's `viewport`).

Neither path confirmed the result. Browsers and the host OS enforce a **minimum window size** — on
desktop Chrome a window cannot be narrower than ~500px — so a request for a small mobile viewport
(e.g. `375px`) is silently clamped up. The resize call succeeds, the page loads, a screenshot is
saved, and the step reports **PASS**, because success was defined as "the browser reached the page
and the resize call returned." The author is left believing they captured a 375px-wide mobile
render when the page actually rendered at ~500px. The `setViewportSize` path even carried an empty
`// Confirm viewport size` comment — the intent to verify existed but was never implemented.

This was reported externally (Diana Payton, "The Browser Had a Floor I Didn't Know About"): a
requested 375px viewport consistently produced ~500px with no failure and no warning. Reproduced
live on headed Chrome, a 375px request renders at 501px.

The requested viewport is not always physically achievable, so *failing* the step is wrong (the
window genuinely cannot be that small). But *silently passing* is also wrong. The gap is
**observability**: the run must tell the author the realized size differs from the request.

## Decision Drivers

* A green step must not imply a size guarantee the browser didn't honor.
* Screenshots and measurements should be reconcilable against ground truth — the size the page
  actually rendered, not the size that was asked for.
* A floored viewport is not a failure: the constraint is external (browser/OS), and failing would
  make legitimate small-viewport requests unusable on desktop engines.
* Benign deltas (a scrollbar appearing/disappearing shifts content width by ~15px) must not produce
  noise.
* Both viewport-sizing paths should behave identically; the comparison logic should be pure and
  unit-testable without a live driver.

## Considered Options

1. **Read back, warn on mismatch, and report the realized size** (chosen). After resizing, re-read
   `window.innerWidth/innerHeight`; compare against the request via a pure helper
   (`viewportMismatchWarning`) with a small tolerance; emit a `warning`-level log when they diverge;
   and, for `startSurface`, surface `{ requested, actual }` in the step's `outputs.viewport`.
2. **Fail the step when the viewport can't be realized.** Rejected: the floor is an external
   constraint, not an author error; this would break every sub-minimum request on desktop Chrome.
3. **Emulate the viewport** (`driver.setViewport` over a BiDi socket / CDP device metrics) so it
   renders at the requested size regardless of the window floor. This would be the *fidelity* fix,
   but it was evaluated and **rejected** in [ADR 01072](01072-bidi-socket-for-chrome-viewport-emulation.md):
   the required BiDi socket crashed headed recording contexts and flaked geckodriver startup. This
   warning is therefore the shipped behavior, not a stopgap.
4. **Do nothing / document the floor.** Rejected: the whole point of the report is that a silent
   mismatch is invisible; a docs footnote doesn't reach the author looking at a green run.

## Decision Outcome

Chosen: **option 1**. A new pure helper `viewportMismatchWarning(requested, actual, tolerance)` in
`src/core/utils.ts` compares only the dimensions the caller actually requested (a width-only request
is never warned about height), treats an unreadable actual dimension as a mismatch, and absorbs
deltas within `VIEWPORT_TOLERANCE_PX` (16px, ~a scrollbar). Both `setViewportSize` and
`applyViewport` now read the viewport back after resizing and log the helper's warning when the
request wasn't met. `applyViewport` additionally returns the realized dimensions so the
`startSurface` browser descriptor can report `outputs.viewport = { requested, actual }`.

### Consequences

* Good: a floored viewport is now visible — a `warning` line names the requested vs rendered size,
  and `startSurface` outputs carry ground truth. The step still PASSes (the floor isn't a failure).
* Good: the two sizing paths share one comparison rule; the `// Confirm viewport size` stub is now
  real.
* Neutral: an extra `execute()` round-trip per viewport-bearing browser start (one read-back). Only
  runs when a viewport was requested.
* Trade-off: the 16px tolerance can hide a genuine floor smaller than a scrollbar. Accepted — the
  dominant failure mode is a large mobile-width clamp (100px+), and a zero tolerance would warn on
  benign scrollbar shifts.
* Follow-up: viewport emulation (option 3) was evaluated as the fidelity fix and **rejected** in
  [ADR 01072](01072-bidi-socket-for-chrome-viewport-emulation.md) (the BiDi socket it needs crashed
  recording), so this warning is the shipped behavior for the resize path on every engine.

### Confirmation

* Unit tests for the pure helper (`test/viewport-mismatch.test.js`): exact match, width floor,
  height-only floor, requested-only comparison, tolerance, unreadable actual, empty request.
* Integration tests with a driver stub that models the window→viewport relationship and an optional
  floor (`test/start-surface-viewport.test.js`): warns and reports the floored size, stays silent on
  exact realization, and emits no viewport output when none was requested.
* Live reproduction on headed Chrome: a 375px request renders at 501px, emits the warning, and
  reports `outputs.viewport.actual` = `{ width: 501, height: 813 }` while the run PASSes.
* The floor applies **headless too**: a headless-Chrome 400px request rendered at 518px in the same
  live check. So headless is not an escape hatch (an earlier draft of the docs wrongly said it was),
  and a sub-floor viewport can't be asserted "realized" in a portable fixture — the deterministic
  automated coverage is the unit + integration tests above, and the realized-happy-path (an
  above-floor 800px viewport) is covered by `test/core-artifacts/sessions/start-surface-browser.spec.json`.
  Realizing sub-floor widths would require viewport emulation, which was evaluated and rejected in
  ADR 01072 (see option 3).

## Pros and Cons of the Options

### Option 1 — read back, warn, report realized size

* Good: makes the silent mismatch observable without failing legitimate requests.
* Good: pure, unit-testable comparison shared by both sizing paths.
* Neutral: one extra read-back round-trip per viewport-bearing browser start.
* Bad: tolerance can mask a sub-scrollbar floor.

### Option 2 — fail the step

* Good: impossible to miss.
* Bad: breaks every sub-minimum viewport on desktop engines; treats an external constraint as an
  author error.

### Option 3 — CDP device-metrics emulation

* Good: the request is actually honored; no floor.
* Bad: engine-specific (Chromium), and changes screenshot/recording geometry and devicePixelRatio;
  larger blast radius. Complementary, tracked separately.

### Option 4 — document only

* Good: zero code.
* Bad: doesn't reach the author looking at a green run; the mismatch stays invisible in practice.
