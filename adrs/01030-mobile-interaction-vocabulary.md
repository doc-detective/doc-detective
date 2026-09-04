---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# Mobile interaction vocabulary: swipe, long-press, device keys, auto-scroll (phase A6)

## Context and Problem Statement

Phases A1–A5 made native apps and mobile browsers testable targets, in ADRs
01021–01029. But the interaction vocabulary stayed desktop-shaped. There was no
swipe for carousels and pagers, no long-press, and no device Back or Home keys.
And `find` failed when the element was off-screen in a scrollable native list.
The design doc, docs/design/native-app-surfaces.md, under "Mobile interaction
vocabulary", scoped phase A6 tightly. It covers exactly one new primitive,
`swipe`, and one additive field, `click.duration`. It also covers new `$KEY$`
names, `find` auto-scroll as adapter behavior, the permission-dialog docs
pattern, and the multi-device two-phone fixture with serial boots.

How should the swipe primitive be shaped and implemented per driver? How far
does the key vocabulary reach on each platform? And where does auto-scroll
stop?

## Decision Drivers

- Extend existing vocabulary where the meaning is identical; add exactly one
  new primitive; defer what documentation tests don't need.
- One authoring model across five drivers. Per-platform differences live in
  the adapter seam, rather than the schema.
- Every schema change is additive; unrepresentable states are preferred over
  runtime rejections where the schema can express them.
- Deterministic gestures beat native flings for docs tests (repeatable
  screenshots and element positions).
- Don't regress the existing key vocabulary on browser, process, or desktop
  app surfaces.

## Considered Options

1. **swipe as the movement subset of dragAndDrop.** There's a shared
   coordinate-movement engine. `swipe` is surface resolution plus shorthand
   normalization over it. `dragAndDrop` is element location over the same
   movement concept. Point-to-point, with `from` and `to` fraction coordinates,
   ships now alongside the direction shorthand.
2. swipe as a fully standalone step with per-driver native gestures only, and
   `from`/`to` schema-reserved with a "not yet implemented" runtime error.
3. No new step: overload `find`/`moveTo` with scroll options.

## Decision Outcome

Chosen option: **1**. Swipe is the movement subset of dragAndDrop, which is the
`find`↔`click` relationship applied to movement. All three forms ship in one
phase: the string direction, the directional object, and the point-to-point
object.

### The shape

- `swipe_v3` accepts `"up"|"down"|"left"|"right"`, or `{ direction, distance?
  (0–1, default 0.5), duration? (ms, default 500), surface? }`, or
  `{ from: {x,y}, to: {x,y}, duration?, surface? }`. There x and y are
  **literal pixels** from the surface's top-left, meaning the app window or the
  browser viewport. That's the same pixel convention as the context `window`
  and `viewport` fields. The directional form's `distance` stays a portable
  fraction. **Direction is the finger's motion**, so swiping up reveals content
  below. Directional swipes are clamped to a 10%-inset box, for Android
  edge-gesture avoidance. Explicit `from` and `to` points are the author's own.
- The **process kind is unrepresentable**. Swipe's `surface` restricts bare
  strings to browser-engine keywords, per the `byEngineName` precedent, and has
  no `{ process }` branch. A background process has no screen to swipe, so the
  rejection happens at validation time rather than runtime.
- `click_v3` (and find's inline click sub-effect) gain `duration` (ms ≥ 1):
  long-press on mobile, press-and-hold on desktop apps and browsers.
- **`click.button` is now honored on app surfaces where the driver can do it.**
  That closes a pre-A6 gap where a requested `right` or `middle` button was
  silently downgraded to a left click. The schema enum stays `left`, `right`,
  and `middle`, unchanged, so those are the authorable buttons. Windows honors
  all three, through `windows: click`. macOS honors right-click, through
  `macos: rightClick`, and rejects middle, since the Mac2 driver has none.
  Touch surfaces, Android and iOS, reject any non-left button as meaningless.
  All of it runs through a `clickButton` adapter row, so the rejection is loud
  and actionable rather than a surprising left click. A long-press, meaning
  `duration`, on an app surface is primary-button only. So `duration` combined
  with a non-left `button` is rejected.
- There's no new step for scroll-to-element. `find` **auto-scrolls** on mobile
  app surfaces, bounded by `MAX_FIND_SCROLLS`, which is 5, and the step
  timeout. It scrolls only toward content below, the documented-procedure case.
  Desktop app surfaces don't scroll. UIA and AX expose off-screen elements in
  the accessibility tree, and blind wheel-scrolling risks disturbing state.
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

Native extensions are preferred where they exist, because they're documented
and deterministic. The W3C engine fills the gaps. Desktop **directional**
swipe is scroll *intent*, as wheel deltas at the window center, because a mouse
drag doesn't scroll desktop content. Browser directional swipe is
`window.scrollBy` with finger-motion signs, because a mouse drag selects text.
Browser point-to-point is a real W3C pointer drag, for sliders and canvases.
It's desktop-browser-only, the same constraint as non-left buttons, since
device web contexts reject the actions endpoint. Wheel-delta signs are
undocumented per driver, and isolated in one function per adapter, verified by
the headed desktop fixtures.

### Key vocabulary

- **Mobile app surfaces** get device keys. On Android those are `$BACK$` 4,
  `$HOME$` 3, `$APP_SWITCH$` 187, `$VOLUME_UP$` 24, and `$VOLUME_DOWN$` 25. On
  iOS they are the `home`, `volumeup`, and `volumedown` buttons. The common
  editing keys come too. Android uses keycodes, and iOS folds `$ENTER$`,
  `$TAB$`, and `$BACKSPACE$` into typed text. `$BACK$` and `$APP_SWITCH$` on
  iOS fail with guidance, since there are no such buttons. Unknown `$…$` tokens
  pass through verbatim as text, the process-path convention. **`$HOME$` is
  overloaded by design.** It's the device home button on mobile app surfaces,
  and cursor-to-line-start on browser surfaces.
- **Env-substitution collision fixed.** `replaceEnvs` is the `$VAR` env
  interpolation applied to step values. It matched the `$HOME` prefix of the
  `$HOME$` sentinel, and rewrote it to the home path on any host where `$HOME`
  is set. That's every Unix box, including the macOS CI runner. So the token
  never reached the key splitter. It surfaced as literal text, and iOS reported
  "requires element criteria". This is a **pre-existing** latent bug affecting
  any `$ENVVAR$` special key, including the browser `$HOME$` cursor key. The
  iOS fixture exposed it as the first `$HOME$` use on a Unix runner. The fix is
  a trailing `(?![a-zA-Z0-9_$])` guard on the env regex. A `$NAME$`, with a
  dollar on both sides, is a sentinel, never an env reference. A bare `$NAME`
  still substitutes.
- **Element criteria become optional on mobile.** Device-key-only steps need
  no element, and Android types criteria-less into the focused element through
  `mobile: type`. **iOS keeps requiring criteria for text.** XCUITest's
  `mobile: keys` turned out to be iPad-only, on Xcode 15+, so there is no
  reliable focused-element typing on iOS. The error says so, and names the
  alternative. This revises the design-doc example that typed criteria-less
  on any mobile surface. That example was Android, which works.
- **Browser and process surfaces are unchanged.** **Desktop app surfaces**
  still reject every `$KEY$` token, since the vocabulary is mobile-only this
  phase. There are two refinements. The rejection message now names the
  mobile-only scope, instead of promising "a later phase". And the sentinel
  regex gained digits, as `$[A-Z0-9_]+$`, so digit-bearing tokens like `$F11$`
  and `$NUMPAD_0$` are rejected *uniformly*. Pre-A6 they slipped through the
  letter-only regex and were typed as literal text, an inconsistency this
  closes.

### Multi-device

The A3b device registry already supported multiple named devices, through port
allocation, per-device shared sessions, and the launch-ownership sweep. A6 adds
the proving fixture, `android-two-devices.spec.json`. It has two `startSurface`
steps with distinct managed devices, serial boots, and interleaved
surface-named steps. It's gated behind `DD_FIXTURE_MULTIDEVICE`, per the
`DD_FIXTURE_PROVISION` precedent, and enabled only on the managed-boot KVM leg.
Two extra AVD creations and boots are too heavy for every leg. The parallel
array form of `startSurface` stays in multi-surface Phase 6.

### Consequences

- Good: mobile docs tests can swipe pagers, long-press, press Back and Home,
  and find off-screen list entries. There are no new authoring concepts beyond
  one step.
- Good: `dragAndDrop`'s future app-surface branch has its engine ready
  (element centers → `performMovement`).
- Bad: browser directional swipe scrolls rather than synthesizing touch
  events. Carousels driven by touch listeners need an app surface, and the docs
  say so.
- Bad: desktop wheel-delta magnitude is approximate, from click quantization on
  Windows. That's acceptable for scroll gestures.
- Neutral: permission dialogs are a documented pattern rather than a primitive.
  Use `click: "Allow"` as a normal element, or
  `driverOptions.autoGrantPermissions` when the dialog isn't the thing being
  documented.
- Neutral: adding `swipe` to the shared `BROWSER_STEP_KEYS` list surfaced a
  pre-existing gap. The runtime asset inference, `inferRuntimeNeeds`, counted
  any browser-keyed step as needing a browser binary. That included one naming
  an app surface with the object form, `surface: { app: … }`. The runner's own
  per-context predicate, `isBrowserRequired`, already excludes
  app-object-targeted steps. So the fix teaches inference the same exclusion,
  through a `stepTargetsAppSurface` predicate now centralized in the runtime
  layer. An app-only spec no longer provisions Chrome. App screenshots still
  infer the image stack, since the exclusion gates only the browser flag.
  Surface-agnostic app steps that inherit the context, meaning `click` and
  `type` with no per-step surface, are unaffected. They still infer the generic
  driver stack, as before.

### Confirmation

Unit suites use fake drivers: `test/app-gestures.test.js`,
`test/swipe.test.js`, `test/click-duration.test.js`,
`test/type-mobile-keys.test.js`, and `test/find-autoscroll.test.js`. Schema
cases live in `src/common/test/validate.test.js`. Real-driver coverage comes
from the phase A6 fixtures. Those are
`apps-android/android-interactions.spec.json` and
`android-two-devices.spec.json` on the KVM legs, and
`apps-ios/ios-interactions.spec.json` on the macOS legs. Long-press and swipe
permutations live in the headed Windows and macOS `apps/` specs, under
REQUIRE_PASS. `interactions/swipe.spec.json` covers browsers.

## Pros and Cons of the Options

### 1: movement subset of dragAndDrop, point-to-point now

- Good: one engine, three consumers (swipe, browser long-press, dragAndDrop's
  future app branch); coordinate semantics decided once.
- Good: point-to-point ships with real implementations on all four desktop/
  mobile platforms (clickAndDrag / dragFromToForDuration / W3C touch).
- Bad: slightly larger phase than the design doc's minimum.

### 2: standalone step, from and to reserved

- Good: smaller phase.
- Bad: it ships schema fields that only error at runtime, which is support
  noise. The reserved-field precedent, for orientation, udid, and provider,
  exists for *runtime-heavy* capabilities. `from` and `to` needed no new
  runtime layer, so reserving them bought nothing.

### 3: overload find and moveTo

- Good: no new step.
- Bad: swiping a carousel isn't finding anything. Conflating navigation
  gestures with element location breaks the one-action-one-meaning rule the
  vocabulary is built on.
