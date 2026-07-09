# Design: native app surfaces

Status: **A1–A7 delivered to `main`; A8 pending** — A1 Windows/NovaWindows
([#491](https://github.com/doc-detective/doc-detective/pull/491), ADRs 01020/01021),
A2 macOS/Mac2 ([#502](https://github.com/doc-detective/doc-detective/pull/502), ADR 01023),
A3 Android apps + managed emulators ([#505](https://github.com/doc-detective/doc-detective/pull/505),
ADR 01026 portable JRE; github-action v1.6.1 auto-KVM), A4 iOS preflight/installer,
A5 mobile browsers ([#516](https://github.com/doc-detective/doc-detective/pull/516), ADR 01029),
A6 mobile interaction vocabulary ([#517](https://github.com/doc-detective/doc-detective/pull/517)),
A7 app window + device recording ([#524](https://github.com/doc-detective/doc-detective/pull/524),
ADR 01032 — the A2 Retina crop-scale gap was fixed here via frame-derived scale), plus app window
selectors ([#536](https://github.com/doc-detective/doc-detective/pull/536), ADR 01036) and
multi-surface Phase 6 generic/parallel `startSurface`
([#539](https://github.com/doc-detective/doc-detective/pull/539), ADR 01039). Per-phase
implementation detail lives in those PRs and ADRs. This document expands
[multi-surface targeting](multi-surface-targeting.md) **Phase 5** ("native app
surfaces") into a full phased roadmap: native **Windows** apps first, then native
**macOS**, then **emulated Android**, then **emulated iOS** — including
first-class `runOn.platforms` entries for `android`/`ios` with managed default
devices, **mobile browser** testing on those devices, and mobile interaction
vocabulary. Reserved (but unimplemented) headroom covers **Linux native apps**,
**real physical devices**, and **cloud device farms**. As with multi-surface,
functionality lands incrementally but the **schema is designed up front** so no
phase requires a breaking change.

Supersedes the context-level `apps` model from the original planning issues
([.github#62](https://github.com/doc-detective/.github/issues/62) Windows,
[#63](https://github.com/doc-detective/.github/issues/63) iOS,
[#64](https://github.com/doc-detective/.github/issues/64) macOS,
[#65](https://github.com/doc-detective/.github/issues/65) Linux,
[#66](https://github.com/doc-detective/.github/issues/66) Android) and the
`windows` prototype branch (`f75f463e`), which predate multi-surface targeting.
Driver selections and platform research from those issues carry forward; their
schema shape does not (see [Non-goals](#non-goals--rejected-shapes)).

## Problem

Technical writers documenting native applications can't verify that documentation
with Doc Detective. Browser and CLI docs get automated testing; native app docs
(procedures, walkthroughs, screenshots) rely on manual verification and drift.
Mobile documentation is doubly locked out: neither native mobile apps nor mobile
web browsers are testable targets.

Multi-surface targeting already reserved the addressing model: `app` is the third
surface kind, alongside `browser` and `process`. What's unspecified is the **app
descriptor** (how you say *which* app, on *which* device), the **environment
model** (what `platforms: "android"` means), the **element vocabulary** on app
surfaces, the **driver architecture**, and the **phasing**. That's this document.

## Position in the multi-surface plan

- The `surface` reference schema gains its **`app` branch** (a `oneOf` addition —
  non-breaking by construction). The string form already resolves any name at
  runtime, so `surface: "calc"` needs no schema change at all.
- **`startSurface` ships with the first app phase** (A1), pulled forward from
  multi-surface Phase 6. Apps are its first *required* consumer — browsers have
  `goTo` auto-open and processes have `runShell.background`, but apps have no
  inline sugar. The generic browser/process branches of `startSurface` shipped
  in multi-surface Phase 6 (✅ ADR 01039); adding the branches was additive as
  designed.
- **Provisioning stays in steps; `runOn` stays matrix + gating** — with one
  deliberate, additive extension: **the environment matrix learns mobile target
  platforms** (`platforms: "android" | "ios"`), because a device is
  *environment*, not a surface (see "runOn: mobile target platforms"). There is
  still no `apps` field on `context_v3`, ever. The `requires` capability gate
  (already designed in multi-surface) ships in A1 because app tests are the
  first that *must* SKIP cleanly on hosts without the driver/app/SDK.
- App sessions ride the **Phase 4 registry generalization** (multiple driver
  sessions keyed by surface name). Sequencing: A1 starts after Phase 4 lands.

## The `app` descriptor — one shape, five platforms

The descriptor is the create-side payload of `startSurface`'s app branch. One
shape covers desktop (Windows/macOS/Linux) and mobile (Android/iOS): **the
`device` field is the desktop/mobile discriminator.** No `device` → the app runs
on the host OS, unless the *context* is a mobile platform, in which case the app
runs on the context's device (see below). With `device` → the app runs on that
managed emulator/simulator (or, later, a real device).

```jsonc
// DESKTOP — progressive: the `app` value is a path, bundle ID, AUMID, or desktop-file ID
"startSurface": { "app": "C:\\Windows\\System32\\notepad.exe" }                   // Windows exe path
"startSurface": { "app": "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" }        // Windows UWP AUMID
"startSurface": { "app": "com.apple.TextEdit" }                                   // macOS bundle ID
"startSurface": { "app": "/Applications/Calculator.app", "name": "calc",
                  "args": ["--reset"], "workingDirectory": "./sandbox",
                  "env": { "LOG_LEVEL": "debug" },
                  "waitUntil": { "delayMs": 500 }, "timeout": 30000 }
"startSurface": { "app": "org.gnome.TextEditor" }                                 // Linux desktop-file ID (reserved)

// MOBILE — in a `platforms: "android"|"ios"` context, `device` may be omitted:
// the app opens on the context's default device
"startSurface": { "app": "com.example.myapp" }
"startSurface": { "app": "com.example.myapp", "install": "./build/MyApp.apk",
                  "activity": ".MainActivity" }

// MOBILE, explicit device — progressive: string names an already-provisioned
// device; object provisions one
"startSurface": { "app": "com.example.chat", "name": "bob", "device": "second-phone" }
"startSurface": { "app": "com.example.myapp",
                  "device": { "platform": "android", "name": "Pixel_7",
                              "osVersion": "14", "headless": true } }
```

### Fields

| field | applies to | meaning |
|---|---|---|
| `app` | all | **The identifier** — executable path, `.app` path, bundle ID, package name, UWP AUMID, or desktop-file ID. Disambiguated by platform + syntax (path separators / `!` / reverse-DNS), never by a `type` enum the user must supply. |
| `name` | all | Surface-registry name. Default: executable basename without extension (`notepad.exe` → `notepad`), or the final dot-segment of an ID (`com.apple.TextEdit` → `TextEdit`). |
| `args` | desktop | Launch arguments (like `process`). |
| `workingDirectory` | desktop | Default `.` (the run's cwd), like `process`. |
| `env` | desktop | Extra environment variables for the launched app (driver support varies; unmapped → clear runtime error). |
| `install` | mobile | Path to an installable artifact (`.apk` / `.app` / `.ipa`) to install before launch. Omitted → the app must already be installed on the device. |
| `activity` | android | Main activity override (defaults to the package's launcher activity). |
| `device` | mobile | **String** → reference to an already-provisioned device by name (the context default device is always referenceable). **Object** → device descriptor, provisions the device if it isn't already up. Absent → context device (mobile context) or host desktop app (desktop context). |
| `driverOptions` | all | **Escape-hatch passthrough**: a free-form object merged into the Appium session capabilities *after* the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`, `nova:smoothMouseMove`). This is the future-proofing valve — driver-specific knobs (the dozens catalogued in the planning issues: `noReset`, `autoGrantPermissions`, `skipAppKill`, …) never force schema churn. |
| `waitUntil` | all | App-kind readiness: `{ delayMs, find }` — a fixed delay and/or an element that must exist (same element vocabulary as `find`). Kind-shaped like `process`'s `{ stdio, delayMs }`. |
| `timeout` | all | Startup ceiling (launch + device boot + install + readiness). |

### The `device` descriptor

Used in two places with one shape: `startSurface.…device` (object form) and
`context_v3.device` (refining a mobile context's default device).

> **Revised in phase A3a (ADR 01024).** The shape below supersedes an earlier
> hardware-model spec (`{ name: "Pixel_7", osVersion, headless }`). The reserved
> `type` field was dropped in favor of an abstract `deviceType`, and `name` now
> carries **reuse-or-create** semantics. Hardware-model names never appear in
> the schema — `deviceType` is abstract and portable across android/ios.

```jsonc
"device": {
  "platform": "android" | "ios",   // required in startSurface; implied by the context
  "name": "pixel7",                // device identity + AVD name. Reuse-or-create: reuse an
                                    //   existing AVD by this name, else CREATE one under it
  "deviceType": "phone",           // abstract hardware profile ("phone" | "tablet"); used only
                                    //   when creating. Default: "phone"
  "osVersion": "14",               // used only when creating; must match an INSTALLED system
                                    //   image (install more via `doc-detective install android`)
  "headless": false,               // android emulator -no-window; ignored where N/A
  "orientation": "portrait",       // RESERVED — initial orientation ("portrait" | "landscape")
  "udid": "…",                     // RESERVED — pin a specific instance / real device
  "provider": { … }                // RESERVED — cloud device farms (BrowserStack/Sauce/AWS)
}
```

- **`name` is the device's identity** in the run's device registry and its AVD
  name. Two descriptors with the same name resolve to the same device. When no
  AVD by that name exists, Doc Detective **creates one** (from `deviceType`'s
  default hardware profile and an installed system image matching `osVersion`,
  or the newest installed image) — provided the creation dependencies are
  present (an installed image + a Java runtime for `avdmanager`); a missing
  dependency SKIPs with a pointer to `doc-detective install android`. Distinct
  concurrent devices need distinct names (one booted instance per AVD).
- **`deviceType`** is an abstract profile (`phone` | `tablet`) Doc Detective
  maps to a built-in `avdmanager --device` profile. Portable across
  android/ios; ignored when `name` already matches an existing device.
- `orientation`, `udid`, and `provider` are **schema-reserved from day one**
  (validated shapes, documented "not yet implemented" runtime errors) so
  orientation control, real devices, and cloud farms are purely additive later.
  Real-device *implementation* concerns (code signing, WebDriverAgent
  provisioning, ADB authorization UX) stay out of scope until their own phase.

### Managed device boot (day one for mobile phases)

Any step or context that needs a device **owns the device lifecycle**:

1. **Reuse** a running emulator/simulator matching the descriptor (`name`, and
   `osVersion` if given) when one exists — including one booted earlier in the
   same run.
2. Otherwise **boot** it — `emulator -avd <name>` (headless per `headless`) /
   `xcrun simctl boot` — and wait for ready (`sys.boot_completed` / simctl
   `Booted`) within `timeout`.
3. **Install** the `install` artifact if provided, then launch the app session.
4. **Teardown follows the launch-ownership rule** (same as apps and processes):
   the run sweep shuts down devices *Doc Detective booted* and leaves
   pre-existing ones running. `closeSurface` on an app closes the app session
   only; the device follows at sweep.

Boot infrastructure absent is handled per platform. For **Android** on a
capable host, the SDK/system image is **lazily installed** on first need (with a
loud warning) rather than skipped; only a host that can't run the emulator, an
install failure, or `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL=1` lands the context
SKIPPED. For **iOS** (no macOS/Xcode) it stays a **gating** SKIP with an
actionable message.

## `runOn`: mobile target platforms

`platforms` grows two enum values — **`android`** and **`ios`** — an additive
schema change. This resolves a conflation `platforms` never had to face before:
for desktop entries, host and target are the same OS; for mobile entries they
split. The rules:

- **`platforms` names the *target* platform** the test runs against. Desktop
  values (`windows`/`mac`/`linux`) keep today's exact semantics (host = target).
- **A mobile entry is gated by host *capability*, not host identity**: `ios`
  needs a macOS host with Xcode; `android` needs any host with the SDK
  platform-tools + emulator. The preflight infers this — no `requires`
  incantation needed for the common case.
- **A mobile entry provisions a default device** for the context (managed boot
  above). No other context is required: `"runOn": [{ "platforms": "android" }]`
  is a complete, working matrix entry.
- **No `hosts` field** (revised in A3a, ADR 01024). A mobile entry runs on
  **every capable host** — capability (SDK present, emulator acceleration) is
  the gate, never host identity. In a multi-OS CI matrix that means android runs
  on every capable leg and SKIPs fast on the rest; the redundant capable-leg
  runs are accepted as harmless rather than pruned by a host-pinning knob that
  would have to be kept in sync. (An earlier draft of this plan proposed a
  `hosts` field; it was dropped.)
- **`device` (new, optional)** refines the default device — same descriptor as
  `startSurface`, `platform` implied by the entry:

```jsonc
// Complete mobile matrix entries
"runOn": [ { "platforms": "android" } ]
"runOn": [ { "platforms": "ios" } ]
"runOn": [ { "platforms": ["android", "ios"] } ]                     // fans out: one context per target
"runOn": [ { "platforms": "android",
             "device": { "name": "phone", "deviceType": "phone", "osVersion": "14", "headless": true } } ]

// Mobile WEB — the browser fans out on the device, same as desktop
"runOn": [ { "platforms": "android", "browsers": "chrome" } ]
"runOn": [ { "platforms": "ios", "browsers": "safari" } ]
"runOn": [ { "platforms": ["windows", "mac", "android", "ios"],      // one page, four targets
             "browsers": "chrome" } ]                                 // (safari on ios — see support matrix)
```

### Default device resolution

"Default device/image" is deterministic and reported (the resolved device joins
the context report the way resolved browser versions do):

- **Android:** a running emulator, if one is attached → else the newest-API
  existing AVD → else **create** a `doc-detective` AVD from an *installed*
  system image. When the SDK or a matching image is missing on a **capable**
  host (one that can run the emulator), Doc Detective **lazily installs** it
  (loud warning to terminal + report), rather than skipping — see the lazy
  toolchain install below. `doc-detective install android` remains the way to
  **pre-warm** that toolchain (CI images, containers) so the download isn't paid
  mid-run; `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL=1` forbids the lazy install and
  restores the skip-with-pointer. A host that *can't* run the emulator always
  SKIPs without downloading anything.
- **iOS:** the newest installed iPhone device type + runtime via
  `xcrun simctl` (present with any Xcode install) → boot. No Xcode → SKIP.

### Mobile browsers

With a mobile platform entry, `browsers` means **the browser on the device**,
driven through the same device session (UiAutomator2 + on-device chromedriver /
XCUITest + Safari). It is the context's default/active browser surface: `goTo`,
`find`, `click`, `screenshot`, `runBrowserScript` behave as on desktop —
element semantics are web DOM, not native accessibility.

| target | chrome | safari | firefox | webkit | edge |
|---|:---:|:---:|:---:|:---:|:---:|
| android | ✓ | — | SKIP | SKIP | SKIP |
| ios | SKIP | ✓ | SKIP | SKIP | SKIP |

Unsupported combinations SKIP that matrix entry (absent-browser precedent, not
FAIL). `browserConfig.headless` is meaningless on a device and is rejected with
a pointer to `device.headless`; `window`/`viewport` sizes are fixed by the
device and rejected likewise. A mobile-web test is a *browser*-surface test
that happens to run on a device — no app descriptor involved.

## The `surface` reference — app branch

Same shared shape as every kind; apps have **windows, no tabs**:

```jsonc
"surface": "calc"                                       // string form — identity-only (works today)
"surface": { "app": "calc" }                            // explicit kind, active window
"surface": { "app": "notepad", "window": { "title": "/Find/" } }   // window by title regex
"surface": { "app": "notepad", "window": -1 }           // newest window (e.g. a dialog)
```

- `window` uses the **shared selector grammar** (name / index / `-1` / criteria)
  minus `url` (meaningless for native windows). Dialogs and secondary windows
  that an app opens on its own are addressable by `title`/index, mirroring the browser
  caveat about page-opened tabs. Mobile apps are effectively single-window;
  `window` is legal but rarely needed there.
- **Shipped for desktop drivers (ADR 01036).** Two models behind one seam
  (`appWindows.ts`): Windows/NovaWindows is *switch-then-act* (handle-only
  probing — the driver's title-switch branch has a foregrounding bug —
  pid-filtered adoption of desktop-global handles, `-1` = newest adopted,
  `index ≥ 0` FAILs: no app-scoped creation order); macOS/Mac2 is
  *window-as-element* (`XCUIElementTypeWindow` elements, scoped finds with
  `//`→`.//` re-anchoring, element rect/screenshot, `-1` via (title, frame)
  baseline diff, `index` = query order). Selection is **sticky** per the
  shared surface contract. Recording crops, swipe math, and screenshots
  resolve window-true rects — fixing the A7-era latent bug where Mac2's
  `getWindowRect()` (the whole main screen) made mac "window" crops
  full-display. Mobile (android/ios) FAILs with one shared single-window
  message — including `record`, whose A7 mobile-window SKIP became a FAIL.
- `closeSurface` composes as designed: `{ "app": "notepad", "window": -1 }`
  closes one window (last-window refusal points at the bare form; absent
  match is an idempotent no-op); `"closeSurface": "notepad"` ends the app
  session (and terminates the app if Doc Detective launched it).

## Multiple apps, one device — and multiple devices

**Each app is its own surface; the device is shared infrastructure.** Devices
live in a run-level *device registry* (keyed by device `name`) that parallels
the process registry — devices are *not* surfaces and are never targeted by
`surface`; apps and browsers on them are.

```jsonc
// Two apps on the context's default device — switch by naming the surface
{ "startSurface": { "app": "com.example.myapp", "name": "myapp" } },
{ "startSurface": { "app": "com.android.settings", "name": "settings" } },
{ "click": { "elementText": "Network & internet", "surface": "settings" } },  // settings to foreground
{ "find": { "elementText": "Offline mode enabled", "surface": "myapp" } },    // myapp back to foreground
```

- **Switching = foregrounding.** Targeting an app surface activates that app
  (`mobile: activateApp` / driver equivalent) exactly as targeting a browser tab
  focuses it, and it stays active for subsequent surface-less steps — the
  active-surface rule, unchanged. The other app keeps running in the background;
  `closeSurface` is what terminates.
- **Implementation note:** on one device, multiple app surfaces may share a
  single driver session (registry maps surface name → session + app id, with
  activate-on-switch). That's invisible in the schema; the authoring model is
  simply one surface per app.
- **Multiple devices** compose the same way — app surfaces on different devices
  coexist in the registry, and steps interleave across them by surface name:

```jsonc
// Two-phone conversation test (e.g. documenting a chat flow)
{ "startSurface": { "app": "com.example.chat", "name": "alice",
                    "device": { "platform": "android", "name": "Pixel_7" } } },
{ "startSurface": { "app": "com.example.chat", "name": "bob",
                    "device": { "platform": "android", "name": "Pixel_7_second" } } },
{ "type": { "keys": ["Hi Bob!", "$ENTER$"], "surface": "alice" } },
{ "find": { "elementText": "Hi Bob!", "surface": "bob" } },
```

- Sequential `startSurface` steps boot devices **serially** from A3 onward; the
  **parallel array form** (multi-surface Phase 6, ✅ shipped — ADR 01039)
  overlaps boots — one `startSurface: [ … ]` step pre-acquires every
  descriptor's device concurrently, worth real wall-clock on 30–60s emulator
  starts (the app sessions themselves still open in authored order).
  Concurrent *actions* across devices remain a dynamic-routing concern, not a
  surface concern.
- **Matrix vs. multi-device, disambiguated in docs:** `platforms:
  ["android","ios"]` runs the *same* test once per target (fan-out);
  two `startSurface` devices put *both* devices in *one* test run. Same
  distinction as `browsers` fan-out vs. named browser surfaces.
- Resource honesty: each emulator costs GBs of RAM; the scheduler treats device
  boot as heavyweight (bounded concurrency), and recording keeps its display
  mutex.

## Element vocabulary on app surfaces — semantic-first + native escape hatch

`find`/`click`/`type` keep their existing **semantic fields**; each driver
adapter maps them onto its platform's accessibility properties:

| DD field | web | Windows (UIA) | macOS (AX) | iOS (XCUITest) | Android (UiAutomator2) |
|---|---|---|---|---|---|
| `elementText` | text content | `Name` | `AXTitle` | `label` | `text` |
| `elementId` | `id` attr | `AutomationId` | `AXIdentifier` | accessibility id | `resource-id` |
| `elementAria` `{ role, name }` | ARIA role/name | `ControlType` + `Name` | `AXRole` + `AXTitle` | element type + `label` | class + content-desc |
| `elementTestId` | `data-testid` | → `AutomationId` | → `AXIdentifier` | → accessibility id | → `resource-id` |
| `selector` | CSS | native escape hatch | native escape hatch | native escape hatch | native escape hatch |

Principles:

- **The mapping is the contract, per adapter.** Each platform phase ships its
  column, verified against real apps. A field with no sensible mapping on a
  platform fails at runtime with the alternative named ("elementClass is not
  supported on app surfaces; use elementAria.role").
- **`selector` on an app surface is the platform-native locator**, detected by
  syntax: `//…`/`(…` → XPath (all five drivers speak it), `~…` → accessibility
  id. CSS selectors are browser-only; the adapter rejects them on app surfaces
  with a pointer to the escape-hatch syntax. This gives power users full driver
  reach (predicate strings and class chains ride XPath/`driverOptions`) without
  bifurcating the authoring model.
- **Android nuance (A3b, ADR 01025):** a lone `elementId`/`elementTestId`
  compiles to UiAutomator2's **`id`** strategy (resource-id, auto-prefixed with
  the app's package) — *not* "accessibility id", which on UiAutomator2 means
  **content-desc**. So `~foo` in the escape hatch matches a content-desc on
  Android. Combined criteria compile to a `@resource-id` XPath, where the value
  must be the fully-qualified `pkg:id/name`. Because `@text` (elementText) and
  `@content-desc` (elementAria name) are distinct attributes, both can apply at
  once — the "two different accessible names conflict" rule fires only on
  Windows/macOS, never Android.
- **Portability where it's real:** a test written with `elementText`/`elementId`
  against a well-labeled app is portable across web and native. Tests using
  `selector` escape hatches are explicitly platform-pinned — the docs say so.

## Mobile interaction vocabulary — mostly not new primitives

The audit of mobile-specific needs, against the docs-as-tests use cases
(procedures, walkthroughs, screenshots). The bias: **extend existing vocabulary
where the meaning is identical; add exactly one new primitive; defer what
documentation tests don't need.**

| need | answer | shape |
|---|---|---|
| tap | existing `click` | no change |
| long-press | `click.duration` (ms) — **additive field**; maps to press-and-hold on desktop drivers too | `{ "click": { "elementText": "Message", "duration": 800 } }` |
| scroll-to-element | **implicit in `find`** on app surfaces — drivers scroll to locate (UiScrollable / XCUITest scroll), matching web `find`'s scroll-into-view behavior | no schema change |
| swipe / explicit scroll | **`swipe` — the one new primitive.** Directional sugar or point-to-point; surface-targeted like everything else. Carousels, pull-to-refresh, onboarding pagers — things `find` can't infer | `{ "swipe": "left" }` · `{ "swipe": { "direction": "up", "distance": 0.8, "surface": "myapp" } }` |
| device keys (back/home/…) | **`$KEY$` vocabulary grows device names** — `$BACK$`, `$HOME$`, `$APP_SWITCH$`, `$VOLUME_UP$`/`$VOLUME_DOWN$` — mapped per adapter, error where meaningless (iOS has no back) | `{ "type": { "keys": ["$BACK$"] } }` |
| type into fields | existing `type` (element-targeted or focused); adapters hide the soft keyboard after `setValue` by default | no change |
| permission dialogs | **a documented pattern, not a primitive** — system dialogs are elements (`click: "Allow"`); `driverOptions` (`autoGrantPermissions` etc.) for tests that don't document the dialog itself | docs only |
| orientation | `device.orientation` at boot (reserved field); a runtime rotation step is **deferred** until a documented use case needs mid-test rotation | reserved |
| deep links | **reserved:** `goTo` targeting an *app surface* = deep-link navigation (`mobile: deepLink`). Fits `goTo`'s meaning (navigate), never launches/attaches apps — that stays `startSurface`'s job. Lands only when demanded | reserved |
| pinch/zoom, shake, biometrics, geolocation, push simulation | **deferred** — reachable today via `driverOptions` at session level; a generic `deviceCommand` escape-hatch step is a possible later addition, deliberately not designed now | non-goal for now |

So: **one new step schema (`swipe`)**, one additive field (`click.duration`),
new `$KEY$` names, and adapter behavior (`find` auto-scroll) — everything else
maps, patterns, or waits for demand.

## Capability matrix additions

The multi-surface matrix already grants `app` to
find/click/dragAndDrop/screenshot/record/type/closeSurface. Refinements:

| action | app surface | notes |
|---|---|---|
| `startSurface` | ✓ | the only opener for apps — **`goTo` does NOT launch or focus apps** (rejecting the issues' modified-goTo model); `goTo` on app surfaces is *reserved* for deep-link navigation |
| `find` / `click` | ✓ | semantic mapping + escape hatch, per phase; `find` auto-scrolls; `click.duration` = long-press |
| `type` | ✓ | element-targeted or focused-window; device `$KEY$`s; app `waitUntil` ⊆ `{ delayMs, find }` via the same `if/then` guard pattern as `process` |
| `swipe` | ✓ (new) | app + browser surfaces (mobile web scrolls too); meaningless on `process` — branch simply absent |
| `screenshot` | ✓ | driver-provided window/screen capture — ships **in each platform phase** (cheap via WebDriver `takeScreenshot`) |
| `record` | ✓ (shipped, A7) | desktop apps: ffmpeg capture cropped to the app window (display mutex unchanged); android/ios: device-screen recording via the app driver (no host display, no mutex) |
| `dragAndDrop` | per driver | schema allows it; each adapter ships or rejects it explicitly |
| `goTo`, `runBrowserScript`, `checkLink` | browser only | includes **mobile** browser surfaces (chrome-on-android / safari-on-ios) |

An app launched via `runShell` + `background` is a **process** surface (stdin,
stdio) — not an app surface. Launching the same binary via `startSurface {app}`
gives UI automation instead. The two kinds don't merge; docs get a "which one do
I want" note.

## Driver architecture

One architecture rule from the planning issues survives intact: **every platform
is an Appium driver behind the existing WebDriver client**, so actions,
screenshots, and the session registry are shared code.

| platform | driver | host requirement |
|---|---|---|
| Windows desktop | [`appium-novawindows-driver`](https://github.com/AutomateThePlanet/appium-novawindows-driver) | Windows 10+, interactive session; no Developer Mode |
| macOS desktop | [`appium-mac2-driver`](https://github.com/appium/appium-mac2-driver) | macOS 11+, Accessibility (TCC) permission |
| Android emulated (apps + Chrome) | [`appium-uiautomator2-driver`](https://github.com/appium/appium-uiautomator2-driver) | any host with Android SDK platform-tools + emulator |
| iOS simulated (apps + Safari) | [`appium-xcuitest-driver`](https://github.com/appium/appium-xcuitest-driver) | macOS host with Xcode |
| Linux desktop | KDE `selenium-webdriver-at-spi` (**investigation only**) | AT-SPI2 stack, accessibility enabled |

- **Lazy install, never bundled.** Native drivers are heavy and platform-bound;
  none join `optionalDependencies`. They JIT-install through the existing
  runtime loader (`src/runtime/loader.ts` cache-install machinery, the `node-pty`
  pattern), with the ESM `package.json`-fallback resolution from PR #391.
  Install-impossible (offline, unsupported host) → gated SKIP, not FAIL.
- **Driver choice is an implementation detail behind the adapter seam.** The
  descriptor never names a driver (no `automationName` in user schema — that was
  the issues' model). If NovaWindows stalls, swapping to another UIA-based
  driver is a code change, not a schema change. `driverOptions` is the only
  place driver names leak, and it's documented as version-specific.
- **Sessions join the existing pool + scheduler.** App sessions acquire Appium
  ports from the same pool as browsers; the resource-aware scheduler treats app
  contexts like driver work (serialized against recordings on the "display"
  mutex — a native app grabbing foreground focus corrupts a concurrent recording
  on every platform) and treats **device boots** as heavyweight, bounded-
  concurrency work.
- **Preflight per platform** runs before session creation and converts known
  environment failures into actionable SKIPs (the issues' best content, kept):
  Windows — driver installed, interactive session; macOS — TCC accessibility
  granted (probe, and print the System Settings walkthrough); Android — adb /
  emulator / system image or AVD present; iOS — macOS + Xcode + simulator
  runtime present.

## Gating recap

`platforms` gates the **target** (host implied for desktop, capability-inferred
for mobile), `requires` gates what preflight can't infer (app binaries, env
vars), and surfaces are opened by steps. There is no host-pinning knob — a
mobile entry runs on every capable host and SKIPs on the rest (ADR 01024).

```jsonc
// Windows desktop app test
"runOn": [ { "platforms": ["windows"],
             "requires": { "files": ["C:\\Windows\\System32\\notepad.exe"] } } ]

// Android app test — runs on every capable host; SDK/emulator preflight is automatic
"runOn": [ { "platforms": "android" } ]

// iOS — capability-gated to macOS hosts automatically
"runOn": [ { "platforms": "ios" } ]
```

Driver availability itself is **not** a `requires` entry the user writes — the
preflight handles "driver missing / not installable" automatically.

## Reusable schema artifacts (delta)

- `surface_v3.schema.json` gains the **`surfaceApp`** branch (`app` +
  window selectors, no `tab`). Additive `oneOf` entry; steps that allow apps add
  the branch to their `$ref` list per phase.
- **`startSurface_v3.schema.json`** (new in A1): object | array, kind-keyed
  entries. A1 shipped the **app branch only**; the browser/process branches
  and the parallel array form landed in multi-surface Phase 6 (✅ ADR 01039)
  as designed.
- **`appDescriptor`** and **`deviceDescriptor`** components (shapes above) —
  `deviceDescriptor` carries `deviceType` (`phone`|`tablet`) plus the reserved
  `orientation`/`udid`/`provider` fields with full validation from day one, and
  is `$ref`'d by both `startSurface` and `context_v3.device` so they never drift
  (the `browserConfig` precedent). Revised in A3a (ADR 01024): the reserved
  `type` field was dropped in favor of `deviceType`.
- `context_v3`: **`platforms` enum += `android`, `ios`**; new optional
  **`device`** (`deviceDescriptor`, `platform` implied). All additive. No
  `hosts` field (ADR 01024). A `device` *array* (device fan-out matrix) is
  deliberately not included — reserved as a possible future additive change.
- **`waitUntilApp`** readiness shape (`{ delayMs, find }`), joining
  `waitUntilBrowser`/`waitUntilProcess` in the kind-shaped `if/then` guards.
- **`swipe_v3.schema.json`** (new, phase A6 — shipped): direction string |
  `{ direction, distance?, duration?, surface? }` |
  `{ from, to, duration?, surface? }` (points are literal pixels from the
  surface's top-left, the existing window/viewport pixel convention;
  `distance` stays a fraction; the two object forms are mutually exclusive
  branches). Point-to-point shipped in A6 rather than being reserved — swipe
  is the **movement subset of `dragAndDrop`** (ADR 01030), and every shipped
  driver had a real point-movement primitive, so reserving bought nothing.
- `click_v3` gains optional **`duration`**; the `$KEY$` vocabulary gains device
  keys (docs + adapter maps, not schema).
- `context_v3` gains **`requires`** (progressive: string → array →
  `{ commands, files, env }`) exactly as specified in multi-surface.

Every artifact is an added branch, field, enum value, or file — the
no-breaking-changes guarantee is structural, same as multi-surface.

## Phased delivery

Prerequisite: multi-surface **Phase 4** (multiple driver sessions in the
registry). Each app phase is independently shippable and ends green; every
fixture resolves PASS or SKIPPED (never FAIL) per the feature-fixture policy —
platform/driver permutations are `runOn`-gated exactly like the recording
fixtures.

- **Phase A1 — Windows desktop (NovaWindows).** The foundation phase: ships
  `startSurface` (app branch), the `surfaceApp` reference branch, `closeSurface`
  for apps, the `requires` gate, lazy driver install + preflight, the UIA
  semantic-mapping column, escape-hatch `selector` parsing, app `screenshot`,
  and app-session teardown in the run sweep. Fixtures: Notepad (path launch,
  find/click/type/screenshot), UWP Calculator (AUMID launch), a `requires`-gated
  SKIP permutation, and a driver-missing SKIP permutation — headed Windows only.
- **Phase A2 — macOS desktop (Mac2).** Bundle-ID and `.app` resolution, TCC
  preflight with the settings walkthrough, the AX mapping column, `args`/`env`
  launch options. Fixtures: TextEdit + Calculator, headed macOS only.
- **Phase A3 — Android apps + the `android` platform (UiAutomator2).** Splits
  into two shippable PRs (ADR 01024/01025). **A3a** (schema-first, no emulator):
  `platforms: "android"`/`"ios"` enum values, the revised device descriptor
  (`deviceType`, reuse-or-create), capability gating (mobile contexts SKIP with
  a roadmap reason — no `hosts` knob), lazy SDK detection, and the opt-in
  `doc-detective install android` toolchain installer. **A3b** (the device
  layer): first `device` consumer — default-device resolution, the device
  registry, managed AVD boot/reuse/teardown, context `device` refinement,
  `install` (.apk), `activity`, headless emulator, the UiAutomator2 mapping
  column, multi-app-per-device switching. Runs on any capable host OS; CI recipe
  (Linux runner + KVM) documented and exercised.
- **Phase A4 — iOS apps + the `ios` platform (XCUITest).** Implemented for
  macOS-capable hosts. iOS contexts route through app-surface preflight,
  resolve/install the `appium-xcuitest-driver`, and gate with actionable
  `xcode-select`/`simctl` guidance when host tooling is missing;
  `doc-detective install ios` prepares/diagnoses the host. Full simulator
  lifecycle parity with Android now landed (ADR 01028): a Doc-Detective-owned
  `simctl` registry resolves the newest iPhone (or a named/created device),
  boots/reuses/creates it, attaches XCUITest by `udid`, shares one session per
  simulator with `activateApp` switching, and shuts down only simulators it
  booted at run end. `install` (.app), `device` (name/deviceType/osVersion),
  and the XCUITest mapping column are honored; `headless` is a no-op (simulators
  boot without the Simulator UI). macOS hosts only; the `apps-ios` fixture leg
  gates on ≥1 real PASS. Deeper refinements (parallel multi-simulator boots,
  orientation, real devices/WebDriverAgent provisioning) stay later-phase scope.
- **Phase A5 — mobile browsers.** Implemented (ADR 01029). `browsers` on a
  mobile platform entry means the browser on the managed device, driven
  through one webdriver session per device with `browserName` set (Chrome via
  UiAutomator2 with server-managed chromedriver autodownload cached under the
  DD cache; Safari via XCUITest with the generous WDA build ceiling) —
  created through the A3/A4 device registry path and registered in the
  browser session registry, so goTo/find/click/screenshot run the desktop
  code unchanged. A pure pre-toolchain gate enforces the support matrix
  (chrome+android, safari+ios; everything else SKIPs with the supported
  browser named), fills the platform default browser, FAILs authored
  device-fixed config (`headless: false`/`window`/`viewport` → pointer to the
  device descriptor), and defers mixed native-app + web contexts with a
  split-the-test SKIP (originally penciled for A6; still deferred — see the
  A6 entry). `safari` → `webkit` aliasing became platform-aware
  (desktop pairs only), so `safari` on ios means the device Safari. The "one
  page, four targets" story is un-gated — `platforms:
  ["windows","mac","android","ios"], browsers: "chrome"` — with the ios leg
  landing on the matrix SKIP. Mobile-web fixtures run gated on the Android
  KVM legs and the macOS leg (`mobile-web-android` / `mobile-web-ios`
  groups); emulator tests reach the host via `10.0.2.2`.
- **Phase A6 — mobile interaction vocabulary.** Shipped (ADR 01030): `swipe`
  (all three forms — the movement subset of `dragAndDrop`, on the shared
  coordinate-movement engine in `movement.ts`/`appGestures.ts`),
  `click.duration` (long-press on mobile, press-and-hold on desktop apps and
  browsers), device `$KEY$`s plus common editing keys on mobile app surfaces,
  `find` auto-scroll (bounded, downward, mobile-only — UIA/AX expose
  off-screen elements without it), the permission-dialog docs pattern, and
  the two-phone multi-device fixture (serial boots,
  `DD_FIXTURE_MULTIDEVICE`-gated to the managed KVM leg); the fixture moved
  to the parallel array form when multi-surface Phase 6 shipped (ADR 01039). **Deviations found in
  implementation:** XCUITest's `mobile: keys` is iPad-only (Xcode 15+), so
  criteria-less *text* typing shipped on Android only (`mobile: type` into
  the focused element) — iOS keeps requiring element criteria for text, and
  device-key presses need no criteria on either platform. Mixed native-app +
  web contexts (the A5 split-the-test SKIP) stayed deferred: NATIVE_APP/
  WEBVIEW context switching is its own subsystem and was never in A6's scope
  list — it now rides with a later phase.
- **Phase A7 — app window and device recording.** Shipped (ADR 01032):
  `record.surface` gains the app branch; a record targeting an app surface is
  an ffmpeg capture **cropped to the app window by default** (`target:
  "display"` opts out), joining the display mutex unchanged. Subsumes the
  standalone "recording for all apps" thread (doc-detective#220 closed; #345
  occlusion handling documented as a known limitation, still open). The
  A2-found scaling gap is fixed as designed: app-window crop rects are stored
  unscaled with a pending-scale marker, and the stop-side transcode scales
  them by capture-frame size ÷ display size in points (frame size parsed
  eagerly from the capture ffmpeg's stderr head; macOS points via a JXA
  NSScreen probe; win32/linux scale 1 by construction — **empirically
  verified on a 3840×2160 Windows display at 175 % scale**, where UIA rects
  and gdigrab agree in physical pixels and the crop bound exactly to the
  window). **Deviations found in implementation:** mobile contexts record the
  **device screen** through the drivers' `startRecordingScreen` (adb
  screenrecord / simctl) rather than host ffmpeg — an internal "device" plan
  that never appears in the schema; device recordings hold no host display,
  so they're exempt from the display mutex and run fully concurrent
  (autoRecord on mobile drops its ffmpeg pin and late-starts when the first
  device session opens). One device recording per device at a time
  (screenrecord is single-instance) and a 30-minute cap; overlap/LIFO
  permutations are desktop-only. `viewport`-on-app and desktop engines on
  mobile resolve as guided SKIPs, not schema rejections.
- **Phase A8 — Linux investigation + remote groundwork.** Time-boxed spike on
  `selenium-webdriver-at-spi` (maturity, Wayland, packaging) → ADR with a
  go/no-go; specify (still without implementing) the runtime semantics of the
  reserved `device.type: "device"`, `udid`, `provider`, and `orientation`
  fields so real-device/cloud/orientation phases can be planned against a
  settled contract.

Windows leads because it's the original prototype target, needs no device
layer, and NovaWindows needs no Developer Mode or external service — the
shortest path to proving the adapter seam. macOS second reuses everything but
the mapping column and preflight. Android before iOS because it's host-agnostic
and CI-friendly; iOS closes the native set where the WDA/Xcode toolchain cost
is highest. Mobile browsers (A5) come after both mobile app phases because they
reuse the device layer those phases build.

## Testing and CI reality

- **Fixtures** follow the recording-permutation pattern: one spec per phase,
  one test per permutation (launch forms, selector forms, window selectors,
  device defaults vs. refinements, SKIP paths), `runOn`-gated to the platforms
  where they can pass.
- **CI coverage is per-platform best-effort and honest about it:** Windows
  fixtures run headed on Windows runners (interactive-session preflight decides,
  not hope); Android fixtures run where the emulator can boot (Linux + KVM) and
  SKIP on the incapable legs (no `hosts` pinning — capability decides). macOS turned out better
  than feared: GitHub's macOS runner images pre-grant `kTCCServiceAccessibility`
  to `com.apple.dt.Xcode-Helper` (which WebDriverAgentMac runs under),
  `/usr/bin/osascript`, and `/bin/bash` in the system TCC.db, so phase A2's
  fixtures run for real on hosted macos-latest — and the apps legs on Windows
  and macOS gate on ≥1 actual PASS (`DD_FIXTURES_REQUIRE_PASS`, ADR 01023) so
  an environment regression can't hide as all-SKIPPED. iOS WDA on hosted
  runners remains a phase A4 question.
- Cross-platform coverage merging already unions OS-specific lines; adapter
  columns land with their platform's matrix leg.

## Non-goals / rejected shapes

- **`apps` on `context_v3`** (the issues' and prototype's model) — rejected;
  provisioning is a step concern. The context gains *environment* (`platforms`
  values, `device`) — never surfaces.
- **`hosts` on `context_v3`** (an earlier draft of this plan) — rejected in A3a
  (ADR 01024); host *capability* is the mobile gate, so a host-identity pin is
  redundant and a maintenance burden.
- **`goTo` launching or focusing apps** — rejected; `startSurface` opens,
  `surface` focuses. (`goTo`-as-deep-link on an already-open app surface is
  reserved, not rejected — it's navigation.)
- **`automationName`/driver names in the user schema** — the adapter seam owns
  driver choice; `driverOptions` is the only (documented, unstable) leak.
- **A user-supplied desktop/mobile `type` enum** — `device` presence, context
  platform, and identifier syntax disambiguate; users state intent, not
  taxonomy.
- **Common-app name registries** (`"notepad"` → hardcoded path table) — paths,
  IDs, and AUMIDs are explicit; `$VAR` expansion covers portability.
- **Implicit system-image downloads** — multi-GB fetches are opt-in via the
  install machinery, never a side effect of running a test.
- Real-device implementation (signing, provisioning, ADB auth), cloud-farm
  implementation, runtime orientation changes — **schema-reserved only** until
  planned as their own phases.
- Elevated/UAC interaction, background-window automation, image-based element
  location, watchOS/tvOS/Wear/Auto, Espresso/Maestro/Detox backends,
  pinch/zoom/biometric/geolocation primitives (escape hatch only, for now).
- Device fan-out matrix (`context_v3.device` as an array) — a plausible future
  additive change, deliberately not designed yet.

## Backward compatibility

Nothing existing changes shape. New steps (`startSurface`, `swipe`), new
`oneOf` branches (`surfaceApp`, app `waitUntil`), new enum values
(`platforms`: `android`/`ios`), new optional context fields (`requires`,
`device`), one new optional step field (`click.duration`), new schema files.
The one deliberate exception (ADR 01024): the device descriptor's reserved
`type` field was replaced by `deviceType` in A3a — safe because `type` was
validated-but-always-FAIL, so no working spec carried it. Specs that never
mention apps or mobile platforms validate and run identically before and after
every phase.
