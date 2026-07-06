---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# Mobile interaction vocabulary — swipe, long-press, device keys, auto-scroll (phase A6)

## Context and Problem Statement

Phases A1–A5 made native apps and mobile browsers testable targets (ADRs
01021–01029), but the interaction vocabulary stayed desktop-shaped: no swipe
for carousels/pagers, no long-press, no device Back/Home keys, and a `find`
that fails when the element is off-screen in a scrollable native list. The
design doc (docs/design/native-app-surfaces.md, "Mobile interaction
vocabulary") scoped phase A6 to exactly one new primitive (`swipe`), one
additive field (`click.duration`), new `$KEY$` names, `find` auto-scroll as
adapter behavior, the permission-dialog docs pattern, and the multi-device
(two-phone) fixture with serial boots.

How should the swipe primitive be shaped and implemented per driver, how far
does the key vocabulary reach on each platform, and where does auto-scroll
stop?

## Decision Drivers

- Extend existing vocabulary where the meaning is identical; add exactly one
  new primitive; defer what documentation tests don't need.
- One authoring model across five drivers — per-platform differences live in
  the adapter seam, not the schema.
- Every schema change is additive; unrepresentable states are preferred over
  runtime rejections where the schema can express them.
- Deterministic gestures beat native flings for docs tests (repeatable
  screenshots and element positions).
- Don't regress the existing key vocabulary on browser, process, or desktop
  app surfaces.

## Considered Options

1. **swipe as the movement subset of dragAndDrop** — a shared coordinate-
   movement engine; `swipe` = surface resolution + shorthand normalization
   over it; `dragAndDrop` = element location over the same movement concept.
   Point-to-point (`from`/`to` fraction coordinates) ships now alongside the
   direction shorthand.
2. swipe as a fully standalone step with per-driver native gestures only, and
   `from`/`to` schema-reserved with a "not yet implemented" runtime error.
3. No new step: overload `find`/`moveTo` with scroll options.

## Decision Outcome

Chosen option: **1** — swipe is the movement subset of dragAndDrop (the
`find`↔`click` relationship applied to movement), with all three forms
(string direction, directional object, point-to-point object) implemented in
one phase.

### The shape

- `swipe_v3`: `"up"|"down"|"left"|"right"` | `{ direction, distance? (0–1,
  default 0.5), duration? (ms, default 500), surface? }` | `{ from: {x,y},
  to: {x,y}, duration?, surface? }`, where x/y are **literal pixels** from
  the surface's top-left (the app window, or the browser viewport) — the
  same pixel convention as the context `window`/`viewport` fields; the
  directional form's `distance` stays a portable fraction. **Direction is
  the finger's motion**: swiping up reveals content below. Directional
  swipes are clamped to a 10%-inset box (Android edge-gesture avoidance);
  explicit `from`/`to` points are the author's own.
- The **process kind is unrepresentable**: swipe's `surface` restricts bare
  strings to browser-engine keywords (the `byEngineName` precedent) and has
  no `{ process }` branch — a background process has no screen to swipe, so
  the rejection happens at validation time, not runtime.
- `click_v3` (and find's inline click sub-effect) gain `duration` (ms ≥ 1):
  long-press on mobile, press-and-hold on desktop apps and browsers.
- No new step for scroll-to-element: `find` **auto-scrolls** on mobile app
  surfaces, bounded by `MAX_FIND_SCROLLS` (5) and the step timeout, scrolling
  only toward content below (the documented-procedure case). Desktop app
  surfaces don't scroll — UIA/AX expose off-screen elements in the
  accessibility tree, and blind wheel-scrolling risks disturbing state.
  `click` and element-targeted `type` inherit auto-scroll by delegation.

### The engine and adapters

`src/core/tests/movement.ts` is the shared engine (`performMovement`: a W3C
pointer chain over fraction coordinates; `directionToPoints`;
`performElementPress` for browser long-press). `src/core/tests/appGestures.ts`
is the per-platform adapter table, keyed like `APP_DRIVER_PLATFORMS`:

| platform | directional swipe | point-to-point | long-press | keys |
|---|---|---|---|---|
| android | `mobile: swipeGesture` (inset area, percent) | W3C touch via the engine | `mobile: longClickGesture` | `mobile: pressKey` keycodes |
| ios | `mobile: dragFromToForDuration` (computed points; duration clamped to XCUITest's 0.5s floor) | same | `mobile: touchAndHold` | `mobile: pressButton` (home/volume) |
| windows | `windows: scroll` (wheel clicks; NovaWindows has no W3C actions) | `windows: clickAndDrag` | `windows: click` `durationMs` | none (rejection stays) |
| mac | `macos: scroll` (pixel deltas) | `macos: clickAndDrag` | W3C mouse chain, `macos: clickAndDragAndHold` fallback | none |

Native extensions are preferred where they exist because they're documented
and deterministic; the W3C engine fills the gaps. Desktop **directional**
swipe is scroll *intent* (wheel deltas at the window center) because a mouse
drag doesn't scroll desktop content; browser directional swipe is
`window.scrollBy` with finger-motion signs because a mouse drag selects text.
Browser point-to-point is a real W3C pointer drag (sliders, canvases) —
desktop-browser-only, the same constraint as non-left buttons (device web
contexts reject the actions endpoint). Wheel-delta signs are undocumented per
driver and isolated in one function per adapter, verified by the headed
desktop fixtures.

### Key vocabulary

- **Mobile app surfaces** get device keys (`$BACK$` 4, `$HOME$` 3,
  `$APP_SWITCH$` 187, `$VOLUME_UP$` 24, `$VOLUME_DOWN$` 25 on Android;
  `home`/`volumeup`/`volumedown` buttons on iOS) plus the common editing keys
  (Android keycodes; iOS folds `$ENTER$`/`$TAB$`/`$BACKSPACE$` into typed
  text). `$BACK$`/`$APP_SWITCH$` on iOS fail with guidance (no such buttons).
  Unknown `$…$` tokens pass through verbatim as text — the process-path
  convention. **`$HOME$` is overloaded by design**: device home button on
  mobile app surfaces, cursor-to-line-start on browser surfaces.
- **Element criteria become optional on mobile**: device-key-only steps need
  no element, and Android types criteria-less into the focused element via
  `mobile: type`. **iOS keeps requiring criteria for text** — XCUITest's
  `mobile: keys` turned out to be iPad-only (Xcode 15+), so there is no
  reliable focused-element typing on iOS; the error says so and names the
  alternative. (This revises the design-doc example that typed criteria-less
  on any mobile surface; the example was Android, which works.)
- **Browser, process, and desktop app surfaces are unchanged** — the desktop
  app rejection message now names the mobile-only scope instead of promising
  "a later phase", but the behavior is identical.

### Multi-device

The A3b device registry already supported multiple named devices (port
allocation, per-device shared sessions, launch-ownership sweep); A6 adds the
proving fixture (`android-two-devices.spec.json`): two `startSurface` steps
with distinct managed devices, serial boots, interleaved surface-named steps.
It's gated behind `DD_FIXTURE_MULTIDEVICE` (the `DD_FIXTURE_PROVISION`
precedent) and enabled only on the managed-boot KVM leg — two extra AVD
creations and boots are too heavy for every leg. The parallel array form of
`startSurface` stays in multi-surface Phase 6.

### Consequences

- Good: mobile docs tests can swipe pagers, long-press, press Back/Home, and
  find off-screen list entries with zero new authoring concepts beyond one
  step.
- Good: `dragAndDrop`'s future app-surface branch has its engine ready
  (element centers → `performMovement`).
- Bad: browser directional swipe scrolls rather than synthesizing touch
  events — carousels driven by touch listeners need an app surface; the docs
  say so.
- Bad: desktop wheel-delta magnitude is approximate (click quantization on
  Windows); acceptable for scroll gestures.
- Neutral: permission dialogs are a documented pattern (`click: "Allow"` as a
  normal element; `driverOptions.autoGrantPermissions` when the dialog isn't
  the thing being documented), not a primitive.

### Confirmation

Unit suites (fake drivers): `test/app-gestures.test.js`, `test/swipe.test.js`,
`test/click-duration.test.js`, `test/type-mobile-keys.test.js`,
`test/find-autoscroll.test.js`, plus schema cases in
`src/common/test/validate.test.js`. Real-driver coverage: the phase A6
fixtures — `apps-android/android-interactions.spec.json` and
`android-two-devices.spec.json` (KVM legs), `apps-ios/ios-interactions.spec.json`
(macOS legs), long-press/swipe permutations in the headed Windows/macOS
`apps/` specs (REQUIRE_PASS), and `interactions/swipe.spec.json` (browsers).

## Pros and Cons of the Options

### 1 — movement subset of dragAndDrop, point-to-point now

- Good: one engine, three consumers (swipe, browser long-press, dragAndDrop's
  future app branch); coordinate semantics decided once.
- Good: point-to-point ships with real implementations on all four desktop/
  mobile platforms (clickAndDrag / dragFromToForDuration / W3C touch).
- Bad: slightly larger phase than the design doc's minimum.

### 2 — standalone step, from/to reserved

- Good: smaller phase.
- Bad: ships schema fields that only error at runtime (support noise), and
  the reserved-field precedent (orientation/udid/provider) exists for
  *runtime-heavy* capabilities — from/to needed no new runtime layer, so
  reserving it bought nothing.

### 3 — overload find/moveTo

- Good: no new step.
- Bad: swiping a carousel isn't finding anything; conflating navigation
  gestures with element location breaks the one-action-one-meaning rule the
  vocabulary is built on.
