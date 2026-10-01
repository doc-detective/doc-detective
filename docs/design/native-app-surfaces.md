# Design: native app surfaces

Status: **A1–A7 delivered to `main`, with A8 pending.**

- A1, Windows and NovaWindows
  ([#491](https://github.com/doc-detective/doc-detective/pull/491), ADRs 01020 and 01021).
- A2, macOS and Mac2 ([#502](https://github.com/doc-detective/doc-detective/pull/502), ADR 01023).
- A3, Android apps and managed emulators
  ([#505](https://github.com/doc-detective/doc-detective/pull/505), ADR 01026 portable JRE, plus
  github-action v1.6.1 auto-KVM).
- A4, iOS preflight and installer.
- A5, mobile browsers ([#516](https://github.com/doc-detective/doc-detective/pull/516), ADR 01029).
- A6, mobile interaction vocabulary
  ([#517](https://github.com/doc-detective/doc-detective/pull/517)).
- A7, app window and device recording
  ([#524](https://github.com/doc-detective/doc-detective/pull/524), ADR 01032, where the A2 Retina
  crop-scale gap was fixed through frame-derived scale).

App window selectors landed alongside these
([#536](https://github.com/doc-detective/doc-detective/pull/536), ADR 01036), as did multi-surface
Phase 6 generic and parallel `startSurface`
([#539](https://github.com/doc-detective/doc-detective/pull/539), ADR 01039). Per-phase
implementation detail lives in those PRs and ADRs. This document expands
[multi-surface targeting](multi-surface-targeting.md) **Phase 5**, "native app
surfaces", into a full phased roadmap. It covers native **Windows** apps first,
then native **macOS**, then **emulated Android**, then **emulated iOS**. That
includes first-class `runOn.platforms` entries for `android` and `ios` with
managed default devices, **mobile browser** testing on those devices, and mobile
interaction vocabulary. Reserved but unimplemented headroom covers **Linux native
apps**, **real physical devices**, and **cloud device farms**. As with
multi-surface, functionality lands incrementally. The **schema is designed up
front**, so no phase requires a breaking change.

This supersedes two things that predate multi-surface targeting. First, the
context-level `apps` model from the original planning issues:
[.github#62](https://github.com/doc-detective/.github/issues/62) Windows,
[#63](https://github.com/doc-detective/.github/issues/63) iOS,
[#64](https://github.com/doc-detective/.github/issues/64) macOS,
[#65](https://github.com/doc-detective/.github/issues/65) Linux, and
[#66](https://github.com/doc-detective/.github/issues/66) Android. Second, the
`windows` prototype branch (`f75f463e`).
Driver selections and platform research from those issues carry forward. Their
schema shape does not (see [Non-goals](#non-goals--rejected-shapes)).

## Problem

Technical writers documenting native applications can't verify that documentation
with Doc Detective. Browser and CLI docs get automated testing; native app docs
(procedures, walkthroughs, screenshots) rely on manual verification and drift.
Mobile documentation is doubly locked out: neither native mobile apps nor mobile
web browsers are testable targets.

Multi-surface targeting already reserved the addressing model: `app` is the third
surface kind, alongside `browser` and `process`. Several things are unspecified.
The **app descriptor**, meaning how you say *which* app on *which* device. The
**environment model**, meaning what `platforms: "android"` means. Then the
**element vocabulary** on app surfaces, the **driver architecture**, and the
**phasing**. That's this document.

## Position in the multi-surface plan

- The `surface` reference schema gains its **`app` branch**, a `oneOf` addition
  that's non-breaking by construction. The string form already resolves any name
  at runtime, so `surface: "calc"` needs no schema change at all.
- **`startSurface` ships with the first app phase** (A1), pulled forward from
  multi-surface Phase 6. Apps are its first *required* consumer. Browsers have
  `goTo` auto-open and processes have `runShell.background`, but apps have no
  inline sugar. The generic browser and process branches of `startSurface`
  shipped in multi-surface Phase 6 (✅ ADR 01039). Adding the branches was
  additive as designed.
- **Provisioning stays in steps, and `runOn` stays matrix plus gating.** There's
  one deliberate, additive extension. **The environment matrix learns mobile
  target platforms** through `platforms: "android" | "ios"`, because a device is
  *environment* rather than a surface (see "runOn: mobile target platforms").
  There is still no `apps` field on `context_v3`, ever. The `requires` capability
  gate, already designed in multi-surface, ships in A1. App tests are the first
  that *must* SKIP cleanly on hosts without the driver, app, or SDK.
- App sessions ride the **Phase 4 registry generalization** (multiple driver
  sessions keyed by surface name). Sequencing: A1 starts after Phase 4 lands.

## The `app` descriptor: one shape, five platforms

The descriptor is the create-side payload of `startSurface`'s app branch. One
shape covers desktop (Windows/macOS/Linux) and mobile (Android/iOS): **the
`device` field is the desktop and mobile discriminator.** With no `device`, the
app runs on the host OS. The exception is a mobile-platform *context*, where the
app runs on the context's device (see below). With `device`, the app runs on that
managed emulator or simulator, or later a real device.

```jsonc
// DESKTOP, progressive: the `app` value is a path, bundle ID, AUMID, or desktop-file ID
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

// MOBILE, explicit device, progressive: a string names an already-provisioned
// device, and an object provisions one
"startSurface": { "app": "com.example.chat", "name": "bob", "device": "second-phone" }
"startSurface": { "app": "com.example.myapp",
                  "device": { "platform": "android", "name": "Pixel_7",
                              "osVersion": "14", "headless": true } }
```

### Fields

| field | applies to | meaning |
|---|---|---|
| `app` | all | **The identifier.** That's an executable path, `.app` path, bundle ID, package name, UWP AUMID, or desktop-file ID. Platform and syntax disambiguate it, through path separators, `!`, and reverse-DNS. A `type` enum the user must supply never does. |
| `name` | all | Surface-registry name. It defaults to the executable basename without its extension (`notepad.exe` → `notepad`), or the final dot-segment of an ID (`com.apple.TextEdit` → `TextEdit`). |
| `args` | desktop | Launch arguments (like `process`). |
| `workingDirectory` | desktop | Default `.` (the run's cwd), like `process`. |
| `env` | desktop | Extra environment variables for the launched app. Driver support varies, and an unmapped case gives a clear runtime error. |
| `install` | mobile | Path to an installable artifact (`.apk`, `.app`, or `.ipa`) to install before launch. When omitted, the app must already be installed on the device. |
| `activity` | android | Main activity override (defaults to the package's launcher activity). |
| `device` | mobile | A **string** references an already-provisioned device by name, and the context default device is always referenceable. An **object** is a device descriptor, provisioning the device if it isn't already up. When absent, it's the context device in a mobile context, or a host desktop app in a desktop context. |
| `driverOptions` | all | **Escape-hatch passthrough.** It's a free-form object merged into the Appium session capabilities *after* the ones Doc Detective computes. It's namespaced per driver, as in `appium:noReset` and `nova:smoothMouseMove`. This is the future-proofing valve. Driver-specific knobs never force schema churn. The planning issues catalogue dozens, including `noReset`, `autoGrantPermissions`, and `skipAppKill`. |
| `waitUntil` | all | App-kind readiness through `{ delayMs, find }`. That's a fixed delay, an element that must exist, or both, using the same element vocabulary as `find`. It's kind-shaped like `process`'s `{ stdio, delayMs }`. |
| `timeout` | all | Startup ceiling, covering launch, device boot, install, and readiness. |

### The `device` descriptor

Used in two places with one shape: `startSurface.…device` (object form) and
`context_v3.device` (refining a mobile context's default device).

> **Revised in phase A3a (ADR 01024).** The shape below supersedes an earlier
> hardware-model spec (`{ name: "Pixel_7", osVersion, headless }`). The reserved
> `type` field was dropped in favor of an abstract `deviceType`, and `name` now
> carries **reuse-or-create** semantics. Hardware-model names never appear in
> the schema. `deviceType` is abstract and portable across android and ios.

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

- **`name` is the device's identity** in the run's device registry, and its AVD
  name. Two descriptors with the same name resolve to the same device. When no
  AVD by that name exists, Doc Detective **creates one**. It uses `deviceType`'s
  default hardware profile, plus an installed system image matching `osVersion`,
  or the newest installed image. That needs the creation dependencies present:
  an installed image, and a Java runtime for `avdmanager`. A missing dependency
  SKIPs with a pointer to `doc-detective install android`. Distinct concurrent
  devices need distinct names, since there's one booted instance per AVD.
- **`deviceType`** is an abstract profile, either `phone` or `tablet`, that Doc
  Detective maps to a built-in `avdmanager --device` profile. It's portable
  across android and ios, and ignored when `name` already matches a device.
- `orientation`, `udid`, and `provider` are **schema-reserved from day one**,
  with validated shapes and documented "not yet implemented" runtime errors.
  Orientation control, real devices, and cloud farms are therefore purely
  additive later. Real-device *implementation* concerns stay out of scope until
  their own phase. Those are code signing, WebDriverAgent provisioning, and ADB
  authorization UX.

### Managed device boot (day one for mobile phases)

Any step or context that needs a device **owns the device lifecycle**:

1. **Reuse** a running emulator or simulator matching the descriptor, on `name`
   and `osVersion` if given, when one exists. That includes one booted earlier
   in the same run.
2. Otherwise **boot** it, with `emulator -avd <name>` (headless per `headless`)
   or `xcrun simctl boot`. Wait for ready, on `sys.boot_completed` or simctl
   `Booted`, within `timeout`.
3. **Install** the `install` artifact if provided, then launch the app session.
4. **Teardown follows the launch-ownership rule**, as apps and processes do.
   The run sweep shuts down devices *Doc Detective booted*, and leaves
   pre-existing ones running. `closeSurface` on an app closes the app session
   only, and the device follows at sweep.

Absent boot infrastructure is handled per platform. For **Android** on a capable
host, the SDK and system image are **lazily installed** on first need, with a
loud warning, rather than skipped. Only three things land the context SKIPPED: a
host that can't run the emulator, an install failure, or
`DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL=1`. For **iOS**, meaning no macOS or
Xcode, it stays a **gating** SKIP with an actionable message.

## `runOn`: mobile target platforms

`platforms` grows two enum values, **`android`** and **`ios`**, an additive
schema change. This resolves a conflation `platforms` never had to face before.
For desktop entries, host and target are the same OS. For mobile entries they
split. The rules:

- **`platforms` names the *target* platform** the test runs against. Desktop
  values (`windows`, `mac`, `linux`) keep today's exact semantics, where host
  equals target.
- **A mobile entry is gated by host *capability*, not host identity.** `ios`
  needs a macOS host with Xcode. `android` needs any host with the SDK
  platform-tools and emulator. The preflight infers this, so the common case
  needs no `requires` incantation.
- **A mobile entry provisions a default device** for the context, per managed
  boot above. No other context is required. `"runOn": [{ "platforms": "android" }]`
  is a complete, working matrix entry.
- **No `hosts` field**, revised in A3a, ADR 01024. A mobile entry runs on
  **every capable host**. Capability is the gate, meaning SDK present and
  emulator acceleration, never host identity. In a multi-OS CI matrix, android
  runs on every capable leg and SKIPs fast on the rest. The redundant
  capable-leg runs are accepted as harmless. Pruning them would need a
  host-pinning knob that has to be kept in sync. An earlier draft of this plan
  proposed a `hosts` field, and it was dropped.
- **`device`, new and optional**, refines the default device. It's the same
  descriptor as `startSurface`, with `platform` implied by the entry:

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
  system image. The SDK or a matching image may be missing on a **capable**
  host, meaning one that can run the emulator. Doc Detective then **lazily
  installs** it rather than skipping, with a loud warning to the terminal and
  report. See the lazy toolchain install below. `doc-detective install android` remains the
  way to **pre-warm** that toolchain for CI images and containers, so the
  download isn't paid mid-run. `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL=1` forbids
  the lazy install and restores the skip-with-pointer. A host that *can't* run
  the emulator always SKIPs without downloading anything.
- **iOS:** take the newest installed iPhone device type and runtime through
  `xcrun simctl`, present with any Xcode install, then boot. No Xcode means SKIP.

### Mobile browsers

With a mobile platform entry, `browsers` means **the browser on the device**. It
is driven through the same device session, using UiAutomator2 with on-device
chromedriver, or XCUITest with Safari. It is the context's default and active
browser surface. `goTo`, `find`, `click`, `screenshot`, and `runBrowserScript`
behave as on desktop. Element semantics are web DOM, not native accessibility.

| target | chrome | safari | firefox | webkit | edge |
|---|:---:|:---:|:---:|:---:|:---:|
| android | ✓ | n/a | SKIP | SKIP | SKIP |
| ios | SKIP | ✓ | SKIP | SKIP | SKIP |

Unsupported combinations SKIP that matrix entry, following the absent-browser
precedent rather than FAILing. `browserConfig.headless` is meaningless on a
device, and is rejected with a pointer to `device.headless`. `window` and
`viewport` sizes are fixed by the device, and rejected likewise. A mobile-web
test is a *browser*-surface test that happens to run on a device, with no app
descriptor involved.

## The `surface` reference: app branch

It's the same shared shape as every kind. Apps have **windows, no tabs**:

```jsonc
"surface": "calc"                                       // string form, identity-only (works today)
"surface": { "app": "calc" }                            // explicit kind, active window
"surface": { "app": "notepad", "window": { "title": "/Find/" } }   // window by title regex
"surface": { "app": "notepad", "window": -1 }           // newest window (e.g. a dialog)
```

- `window` uses the **shared selector grammar** of name, index, `-1`, and
  criteria, minus `url`, which is meaningless for native windows. Dialogs and
  secondary windows an app opens on its own are addressable by `title` or index,
  mirroring the browser caveat about page-opened tabs. Mobile apps are
  effectively single-window, so `window` is legal but rarely needed there.
- **Shipped for desktop drivers (ADR 01036).** There are two models behind one
  seam, `appWindows.ts`. Windows and NovaWindows are *switch-then-act*. That
  means handle-only probing, because the driver's title-switch branch has a
  foregrounding bug. It uses pid-filtered adoption of desktop-global handles,
  where `-1` is the newest adopted, and `index ≥ 0` FAILs since there's no
  app-scoped creation order. macOS and Mac2 are
  *window-as-element*, using `XCUIElementTypeWindow` elements and scoped finds with
  `//`→`.//` re-anchoring, element rect/screenshot, `-1` via (title, frame)
  baseline diff, `index` = query order). Selection is **sticky** per the
  shared surface contract. Recording crops, swipe math, and screenshots
  resolve window-true rects. That fixes the A7-era latent bug where Mac2's
  `getWindowRect()`, returning the whole main screen, made mac "window" crops
  full-display. Mobile, meaning android and ios, FAILs with one shared
  single-window message. That includes `record`, whose A7 mobile-window SKIP
  became a FAIL.
- `closeSurface` composes as designed. `{ "app": "notepad", "window": -1 }`
  closes one window. A last-window refusal points at the bare form, and an
  absent match is an idempotent no-op. `"closeSurface": "notepad"` ends the app
  session, and terminates the app if Doc Detective launched it.

## Multiple apps on one device, and multiple devices

**Each app is its own surface, and the device is shared infrastructure.**
Devices live in a run-level *device registry*, keyed by device `name`, that
parallels the process registry. Devices are *not* surfaces and are never
targeted by `surface`. Apps and browsers on them are.

```jsonc
// Two apps on the context's default device: switch by naming the surface
{ "startSurface": { "app": "com.example.myapp", "name": "myapp" } },
{ "startSurface": { "app": "com.android.settings", "name": "settings" } },
{ "click": { "elementText": "Network & internet", "surface": "settings" } },  // settings to foreground
{ "find": { "elementText": "Offline mode enabled", "surface": "myapp" } },    // myapp back to foreground
```

- **Switching means foregrounding.** Targeting an app surface activates that app
  through `mobile: activateApp` or the driver equivalent, exactly as targeting a
  browser tab focuses it. It stays active for subsequent surface-less steps,
  under the unchanged active-surface rule. The other app keeps running in the
  background, and `closeSurface` is what terminates it.
- **Implementation note:** on one device, multiple app surfaces may share a
  single driver session. The registry maps surface name to a session and app id,
  with activate-on-switch. That's invisible in the schema. The authoring model
  is simply one surface per app.
- **Multiple devices** compose the same way. App surfaces on different devices
  coexist in the registry, and steps interleave across them by surface name:

```jsonc
// Two-phone conversation test, say for documenting a chat flow
{ "startSurface": { "app": "com.example.chat", "name": "alice",
                    "device": { "platform": "android", "name": "Pixel_7" } } },
{ "startSurface": { "app": "com.example.chat", "name": "bob",
                    "device": { "platform": "android", "name": "Pixel_7_second" } } },
{ "type": { "keys": ["Hi Bob!", "$ENTER$"], "surface": "alice" } },
{ "find": { "elementText": "Hi Bob!", "surface": "bob" } },
```

- Sequential `startSurface` steps boot devices **serially** from A3 onward. The
  **parallel array form** (multi-surface Phase 6, ✅ shipped in ADR 01039)
  overlaps boots. One `startSurface: [ … ]` step pre-acquires every descriptor's
  device concurrently, worth real wall-clock on 30–60s emulator starts. The app
  sessions themselves still open in authored order. Concurrent *actions* across
  devices remain a dynamic-routing concern, not a surface concern.
- **Matrix versus multi-device, disambiguated in docs.** `platforms:
  ["android","ios"]` runs the *same* test once per target, a fan-out. Two
  `startSurface` devices put *both* devices in *one* test run. It's the same
  distinction as `browsers` fan-out versus named browser surfaces.
- Resource honesty: each emulator costs GBs of RAM. The scheduler treats device
  boot as heavyweight, with bounded concurrency, and recording keeps its display
  mutex.

## Element vocabulary on app surfaces: semantic-first, with a native escape hatch

`find`, `click`, and `type` keep their existing **semantic fields**. Each driver
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
  platform fails at runtime and names the alternative. One example: "elementClass
  is not supported on app surfaces; use elementAria.role".
- **`selector` on an app surface is the platform-native locator**, detected by
  syntax. `//…` and `(…` mean XPath, which all five drivers speak. `~…` means an
  accessibility id. CSS selectors are browser-only, and the adapter rejects them
  on app surfaces with a pointer to the escape-hatch syntax. This gives power
  users full driver reach, since predicate strings and class chains ride XPath
  and `driverOptions`, without bifurcating the authoring model.
- **Android nuance (A3b, ADR 01025):** a lone `elementId` or `elementTestId`
  compiles to UiAutomator2's **`id`** strategy, a resource-id auto-prefixed with
  the app's package. It is *not* "accessibility id", which on UiAutomator2 means
  **content-desc**. So `~foo` in the escape hatch matches a content-desc on
  Android. Combined criteria compile to a `@resource-id` XPath, where the value
  must be the fully-qualified `pkg:id/name`. `@text` (elementText) and
  `@content-desc` (elementAria name) are distinct attributes, so both can apply
  at once. The "two different accessible names conflict" rule fires only on
  Windows and macOS, never Android.
- **Portability where it's real:** a test written with `elementText` or
  `elementId` against a well-labeled app is portable across web and native.
  Tests using `selector` escape hatches are explicitly platform-pinned, and the
  docs say so.

## Mobile interaction vocabulary: mostly not new primitives

This is the audit of mobile-specific needs against the docs-as-tests use cases
of procedures, walkthroughs, and screenshots. The bias: **extend existing
vocabulary where the meaning is identical, add exactly one new primitive, and
defer what documentation tests don't need.**

| need | answer | shape |
|---|---|---|
| tap | existing `click` | no change |
| long-press | `click.duration` in ms, an **additive field**. It maps to press-and-hold on desktop drivers too | `{ "click": { "elementText": "Message", "duration": 800 } }` |
| scroll-to-element | **implicit in `find`** on app surfaces. Drivers scroll to locate, through UiScrollable or XCUITest scroll, matching web `find`'s scroll-into-view behavior | no schema change |
| swipe or explicit scroll | **`swipe`, the one new primitive.** It's directional sugar or point-to-point, surface-targeted like everything else. It covers carousels, pull-to-refresh, and onboarding pagers, things `find` can't infer | `{ "swipe": "left" }` · `{ "swipe": { "direction": "up", "distance": 0.8, "surface": "myapp" } }` |
| device keys (back, home, and so on) | **The `$KEY$` vocabulary grows device names.** Those are `$BACK$`, `$HOME$`, `$APP_SWITCH$`, `$VOLUME_UP$`, and `$VOLUME_DOWN$`, mapped per adapter. They error where meaningless, since iOS has no back | `{ "type": { "keys": ["$BACK$"] } }` |
| type into fields | existing `type`, element-targeted or focused. Adapters hide the soft keyboard after `setValue` by default | no change |
| permission dialogs | **a documented pattern, not a primitive.** System dialogs are elements, as in `click: "Allow"`. Use `driverOptions` such as `autoGrantPermissions` for tests that don't document the dialog itself | docs only |
| orientation | `device.orientation` at boot, a reserved field. A runtime rotation step is **deferred** until a documented use case needs mid-test rotation | reserved |
| deep links | **reserved.** `goTo` targeting an *app surface* means deep-link navigation through `mobile: deepLink`. That fits `goTo`'s meaning of navigate. It never launches or attaches apps, which stays `startSurface`'s job. It lands only when demanded | reserved |
| pinch and zoom, shake, biometrics, geolocation, push simulation | **deferred.** These are reachable today through `driverOptions` at session level. A generic `deviceCommand` escape-hatch step is a possible later addition, deliberately not designed now | non-goal for now |

So there's **one new step schema, `swipe`**, one additive field
(`click.duration`), new `$KEY$` names, and adapter behavior in `find`
auto-scroll. Everything else maps, becomes a pattern, or waits for demand.

## Capability matrix additions

The multi-surface matrix already grants `app` to
find/click/dragAndDrop/screenshot/record/type/closeSurface. Refinements:

| action | app surface | notes |
|---|---|---|
| `startSurface` | ✓ | the only opener for apps. **`goTo` does NOT launch or focus apps**, rejecting the issues' modified-goTo model. `goTo` on app surfaces is *reserved* for deep-link navigation |
| `find` and `click` | ✓ | semantic mapping plus escape hatch, per phase. `find` auto-scrolls, and `click.duration` gives long-press |
| `type` | ✓ | element-targeted or focused-window, with device `$KEY$`s. App `waitUntil` ⊆ `{ delayMs, find }`, through the same `if/then` guard pattern as `process` |
| `swipe` | ✓ (new) | app and browser surfaces, since mobile web scrolls too. It's meaningless on `process`, so that branch is simply absent |
| `screenshot` | ✓ | driver-provided window and screen capture. It ships **in each platform phase**, and is cheap through WebDriver `takeScreenshot` |
| `record` | ✓ (shipped, A7) | On desktop apps, an ffmpeg capture cropped to the app window, with the display mutex unchanged. On android and ios, device-screen recording through the app driver, with no host display and no mutex |
| `dragAndDrop` | per driver | schema allows it; each adapter ships or rejects it explicitly |
| `goTo`, `runBrowserScript`, `checkLink` | browser only | includes **mobile** browser surfaces (chrome-on-android / safari-on-ios) |

An app launched through `runShell` with `background` is a **process** surface,
meaning stdin and stdio, not an app surface. Launching the same binary through
`startSurface {app}` gives UI automation instead. The two kinds don't merge, and
docs get a "which one do I want" note.

## Driver architecture

One architecture rule from the planning issues survives intact. **Every platform
is an Appium driver behind the existing WebDriver client.** Actions, screenshots,
and the session registry are therefore shared code.

| platform | driver | host requirement |
|---|---|---|
| Windows desktop | [`appium-novawindows-driver`](https://github.com/AutomateThePlanet/appium-novawindows-driver) | Windows 10+, interactive session; no Developer Mode |
| macOS desktop | [`appium-mac2-driver`](https://github.com/appium/appium-mac2-driver) | macOS 11+, Accessibility (TCC) permission |
| Android emulated (apps + Chrome) | [`appium-uiautomator2-driver`](https://github.com/appium/appium-uiautomator2-driver) | any host with Android SDK platform-tools + emulator |
| iOS simulated (apps + Safari) | [`appium-xcuitest-driver`](https://github.com/appium/appium-xcuitest-driver) | macOS host with Xcode |
| Linux desktop | KDE `selenium-webdriver-at-spi` (**investigation only**) | AT-SPI2 stack, accessibility enabled |

- **Lazy install, never bundled.** Native drivers are heavy and platform-bound,
  so none join `optionalDependencies`. They JIT-install through the existing
  runtime loader, meaning the `src/runtime/loader.ts` cache-install machinery and
  the `node-pty` pattern. They use the ESM `package.json`-fallback resolution
  from PR #391. When install is impossible, offline or on an unsupported host,
  the result is a gated SKIP rather than a FAIL.
- **Driver choice is an implementation detail behind the adapter seam.** The
  descriptor never names a driver. There's no `automationName` in the user
  schema, which was the issues' model. If NovaWindows stalls, swapping to another
  UIA-based driver is a code change, not a schema change. `driverOptions` is the
  only place driver names leak, and it's documented as version-specific.
- **Sessions join the existing pool and scheduler.** App sessions acquire Appium
  ports from the same pool as browsers. The resource-aware scheduler treats app
  contexts like driver work, serialized against recordings on the "display"
  mutex. A native app grabbing foreground focus corrupts a concurrent recording
  on every platform. It treats **device boots** as heavyweight,
  bounded-concurrency work.
- **Preflight per platform** runs before session creation, and converts known
  environment failures into actionable SKIPs. That keeps the issues' best
  content. Windows checks the driver is installed and the session interactive.
  macOS checks TCC accessibility is granted, probing and printing the System
  Settings walkthrough. Android checks adb, the emulator, and a system image or
  AVD. iOS checks for macOS, Xcode, and a simulator runtime.

## Gating recap

`platforms` gates the **target**, with the host implied for desktop and
capability-inferred for mobile. `requires` gates what preflight can't infer,
meaning app binaries and env vars. Surfaces are opened by steps. There is no
host-pinning knob. A mobile entry runs on every capable host and SKIPs on the
rest (ADR 01024).

```jsonc
// Windows desktop app test
"runOn": [ { "platforms": ["windows"],
             "requires": { "files": ["C:\\Windows\\System32\\notepad.exe"] } } ]

// Android app test: runs on every capable host, and SDK/emulator preflight is automatic
"runOn": [ { "platforms": "android" } ]

// iOS: capability-gated to macOS hosts automatically
"runOn": [ { "platforms": "ios" } ]
```

Driver availability itself is **not** a `requires` entry the user writes. The
preflight handles a missing or non-installable driver automatically.

## Reusable schema artifacts (delta)

- `surface_v3.schema.json` gains the **`surfaceApp`** branch (`app` +
  window selectors, no `tab`). Additive `oneOf` entry; steps that allow apps add
  the branch to their `$ref` list per phase.
- **`startSurface_v3.schema.json`** (new in A1): object | array, kind-keyed
  entries. A1 shipped the **app branch only**; the browser/process branches
  and the parallel array form landed in multi-surface Phase 6 (✅ ADR 01039)
  as designed.
- **`appDescriptor`** and **`deviceDescriptor`** components, with the shapes
  above. `deviceDescriptor` carries `deviceType`, either `phone` or `tablet`,
  plus the reserved `orientation`, `udid`, and `provider` fields with full
  validation from day one. Both `startSurface` and `context_v3.device` `$ref` it,
  so they never drift, following the `browserConfig` precedent. It was revised in
  A3a (ADR 01024), where the reserved `type` field was dropped in favor of
  `deviceType`.
- `context_v3` gains **`android` and `ios` in the `platforms` enum**, plus a new
  optional **`device`**, a `deviceDescriptor` with `platform` implied. All of it
  is additive. There's no `hosts` field (ADR 01024). A `device` *array*, meaning
  a device fan-out matrix, is deliberately not included. It's reserved as a
  possible future additive change.
- **`waitUntilApp`** readiness shape (`{ delayMs, find }`), joining
  `waitUntilBrowser`/`waitUntilProcess` in the kind-shaped `if/then` guards.
- **`swipe_v3.schema.json`**, new in phase A6 and shipped. It takes a direction
  string, `{ direction, distance?, duration?, surface? }`, or
  `{ from, to, duration?, surface? }`. Points are literal pixels from the
  surface's top-left, the existing window and viewport pixel convention.
  `distance` stays a fraction, and the two object forms are mutually exclusive
  branches. Point-to-point shipped in A6 rather than being reserved. Swipe is the
  **movement subset of `dragAndDrop`** (ADR 01030), and every shipped driver had
  a real point-movement primitive, so reserving bought nothing.
- `click_v3` gains optional **`duration`**; the `$KEY$` vocabulary gains device
  keys (docs + adapter maps, not schema).
- `context_v3` gains **`requires`** (progressive: string → array →
  `{ commands, files, env }`) exactly as specified in multi-surface.

Every artifact is an added branch, field, enum value, or file. The
no-breaking-changes guarantee is therefore structural, same as multi-surface.

## Phased delivery

Prerequisite: multi-surface **Phase 4** (multiple driver sessions in the
registry). Each app phase is independently shippable and ends green. Every
fixture resolves PASS or SKIPPED, never FAIL, per the feature-fixture policy.
Platform and driver permutations are `runOn`-gated exactly like the recording
fixtures.

- **Phase A1: Windows desktop (NovaWindows).** The foundation phase. It ships
  the `startSurface` app branch, the `surfaceApp` reference branch,
  `closeSurface` for apps, the `requires` gate, lazy driver install and
  preflight, and the UIA semantic-mapping column. It also ships escape-hatch
  `selector` parsing, app `screenshot`, and app-session teardown in the run
  sweep. There are four fixtures, headed Windows only. Those are Notepad (path
  launch, then find, click, type, and screenshot), UWP Calculator (AUMID
  launch), a `requires`-gated SKIP permutation, and a driver-missing SKIP
  permutation.
- **Phase A2: macOS desktop (Mac2).** Bundle-ID and `.app` resolution, TCC
  preflight with the settings walkthrough, the AX mapping column, and `args` and
  `env` launch options. The fixtures are TextEdit and Calculator, headed macOS
  only.
- **Phase A3: Android apps and the `android` platform (UiAutomator2).** This
  splits into two shippable PRs (ADR 01024 and 01025).
  - **A3a** is schema-first, with no emulator. It adds `android` and `ios` as
    `platforms` enum values. It adds the revised device descriptor, carrying
    `deviceType` and reuse-or-create. It adds capability gating, where mobile
    contexts SKIP with a roadmap reason and no `hosts` knob. Lazy SDK detection
    lands here too, plus the opt-in `doc-detective install android` toolchain
    installer.
  - **A3b** is the device layer, the first `device` consumer. It covers
    default-device resolution, the device registry, and managed AVD boot, reuse,
    and teardown. It also covers context `device` refinement, `install` for an
    .apk, `activity`, and a headless emulator. Finally it covers the
    UiAutomator2 mapping column and multi-app-per-device switching. It runs on
    any capable host OS, and the CI recipe of a Linux runner with KVM is
    documented and exercised.
- **Phase A4: iOS apps and the `ios` platform (XCUITest).** Implemented for
  macOS-capable hosts. iOS contexts route through app-surface preflight, then
  resolve and install the `appium-xcuitest-driver`. They gate with actionable
  `xcode-select` and `simctl` guidance when host tooling is missing.
  `doc-detective install ios` prepares and diagnoses the host. Full simulator
  lifecycle parity with Android has now landed (ADR 01028). A Doc-Detective-owned
  `simctl` registry resolves the newest iPhone, or a named or created device. It
  boots, reuses, or creates it, attaches XCUITest by `udid`, and shares one
  session per simulator with `activateApp` switching. At run end it shuts down
  only simulators it booted. It honors `install` for a .app, `device` with name,
  deviceType, and osVersion, and the XCUITest mapping column. `headless` is a
  no-op, since simulators boot without the Simulator UI. It's macOS hosts only,
  and the `apps-ios` fixture leg gates on at least one real PASS. Deeper
  refinements stay later-phase scope: parallel multi-simulator boots,
  orientation, and real devices with WebDriverAgent provisioning.
- **Phase A5: mobile browsers.** Implemented (ADR 01029). `browsers` on a
  mobile platform entry means the browser on the managed device. It's driven
  through one webdriver session per device with `browserName` set. Chrome goes
  through UiAutomator2, with server-managed chromedriver autodownload cached
  under the DD cache. Safari goes through XCUITest, with the generous WDA build
  ceiling. Both are created through the A3 and A4 device registry path, and
  registered in the browser session registry, so `goTo`, `find`, `click`, and
  `screenshot` run the desktop code unchanged. A pure pre-toolchain gate enforces
  the support matrix of chrome with android and safari with ios. Everything else
  SKIPs with the supported browser named. The gate fills the platform default
  browser, and FAILs authored device-fixed config, pointing `headless: false`,
  `window`, and `viewport` at the device descriptor. It defers mixed native-app
  and web contexts with a split-the-test SKIP. That was originally penciled for
  A6 and is still deferred, per the A6 entry. `safari` to `webkit` aliasing
  became platform-aware, covering desktop pairs only, so `safari` on ios means
  the device Safari. The "one page, four targets" story is un-gated through
  `platforms: ["windows","mac","android","ios"], browsers: "chrome"`, with the
  ios leg landing on the matrix SKIP. Mobile-web fixtures run gated on the
  Android KVM legs and the macOS leg, in the `mobile-web-android` and
  `mobile-web-ios` groups. Emulator tests reach the host through `10.0.2.2`.
- **Phase A6: mobile interaction vocabulary.** Shipped (ADR 01030). It adds `swipe`
  in all three forms. It's the movement subset of `dragAndDrop`, on the shared
  coordinate-movement engine in `movement.ts` and `appGestures.ts`. It also
  shipped `click.duration`, giving long-press on mobile and press-and-hold on
  desktop apps and browsers. Then device `$KEY$`s, plus common editing keys on
  mobile app surfaces. Then `find` auto-scroll, which is bounded, downward, and
  mobile-only, since UIA and AX expose off-screen elements without it. Finally
  the permission-dialog docs pattern, and the two-phone multi-device fixture
  with serial boots, `DD_FIXTURE_MULTIDEVICE`-gated to the managed KVM leg. That
  fixture moved to the parallel array form when multi-surface Phase 6 shipped
  (ADR 01039). **Deviations found in implementation:** XCUITest's `mobile: keys`
  is iPad-only on Xcode 15+, so criteria-less *text* typing shipped on Android
  only, through `mobile: type` into the focused element. iOS keeps requiring
  element criteria for text, and device-key presses need no criteria on either
  platform. Mixed native-app and web contexts, the A5 split-the-test SKIP, stayed
  deferred. NATIVE_APP and WEBVIEW context switching is its own subsystem and was
  never in A6's scope list, so it now rides with a later phase.
- **Phase A7: app window and device recording.** Shipped (ADR 01032).
  `record.surface` gains the app branch. A record targeting an app surface is
  an ffmpeg capture **cropped to the app window by default**, and
  `target: "display"` opts out. It joins the display mutex unchanged. This
  subsumes the standalone "recording for all apps" thread. doc-detective#220 is
  closed, and #345 occlusion handling is documented as a known limitation and
  still open. The A2-found scaling gap is fixed as designed.
  App-window crop rects are stored unscaled with a pending-scale marker. The
  stop-side transcode then scales them by capture-frame size divided by display
  size in points. Frame size is parsed eagerly from the capture ffmpeg's stderr
  head. macOS points come from a JXA NSScreen probe, and win32 and linux scale 1
  by construction. That's **empirically verified on a 3840×2160 Windows display
  at 175 % scale**. There, UIA rects and gdigrab agree in physical pixels, and
  the crop bound exactly to the window. **Deviations found in implementation:** mobile
  contexts record the **device screen** through the drivers'
  `startRecordingScreen`, using adb screenrecord or simctl, rather than host
  ffmpeg. That's an internal "device" plan that never appears in the schema.
  Device recordings hold no host display, so they're exempt from the display
  mutex and run fully concurrent. autoRecord on mobile drops its ffmpeg pin and
  late-starts when the first device session opens. There's one device recording
  per device at a time, since screenrecord is single-instance, plus a 30-minute
  cap. Overlap and LIFO permutations are desktop-only. `viewport`-on-app and
  desktop engines on mobile resolve as guided SKIPs, not schema rejections.
- **Phase A8: Linux investigation and remote groundwork.** A time-boxed spike on
  `selenium-webdriver-at-spi`, covering maturity, Wayland, and packaging,
  producing an ADR with a go/no-go. Then specify, still without implementing,
  the runtime semantics of the reserved `device.type: "device"`, `udid`,
  `provider`, and `orientation` fields. Real-device, cloud, and orientation
  phases can then be planned against a settled contract.

Windows leads for three reasons. It's the original prototype target, it needs no
device layer, and NovaWindows needs no Developer Mode or external service. That
makes it the shortest path to proving the adapter seam. macOS comes second, and
reuses everything but the mapping column and preflight. Android comes before iOS
because it's host-agnostic and CI-friendly. iOS closes the native set, where the
WDA and Xcode toolchain cost is highest. Mobile browsers (A5) come after both
mobile app phases, because they reuse the device layer those phases build.

## Testing and CI reality

- **Fixtures** follow the recording-permutation pattern. That's one spec per
  phase, and one test per permutation. Permutations cover launch forms, selector
  forms, window selectors, device defaults versus refinements, and SKIP paths.
  Each is `runOn`-gated to the platforms where it can pass.
- **CI coverage is per-platform best-effort, and honest about it.** Windows
  fixtures run headed on Windows runners, where the interactive-session preflight
  decides rather than hope. Android fixtures run where the emulator can boot, on
  Linux with KVM, and SKIP on the incapable legs. There's no `hosts` pinning,
  since capability decides. macOS turned out better than feared. GitHub's macOS
  runner images pre-grant `kTCCServiceAccessibility` in the system TCC.db to
  `com.apple.dt.Xcode-Helper`, which WebDriverAgentMac runs under, plus
  `/usr/bin/osascript` and `/bin/bash`. Phase A2's fixtures therefore run for
  real on hosted macos-latest. The apps legs on Windows and macOS gate on at
  least one actual PASS, through `DD_FIXTURES_REQUIRE_PASS` (ADR 01023). An
  environment regression therefore can't hide as all-SKIPPED. iOS WDA on hosted runners
  remains a phase A4 question.
- Cross-platform coverage merging already unions OS-specific lines; adapter
  columns land with their platform's matrix leg.

## Non-goals / rejected shapes

- **`apps` on `context_v3`**, the issues' and prototype's model, is rejected.
  Provisioning is a step concern. The context gains *environment*, meaning
  `platforms` values and `device`, never surfaces.
- **`hosts` on `context_v3`**, from an earlier draft of this plan, was rejected
  in A3a (ADR 01024). Host *capability* is the mobile gate, so a host-identity
  pin is redundant and a maintenance burden.
- **`goTo` launching or focusing apps** is rejected. `startSurface` opens, and
  `surface` focuses. `goTo`-as-deep-link on an already-open app surface is
  reserved rather than rejected, since it's navigation.
- **`automationName` and driver names in the user schema** are out. The adapter
  seam owns driver choice, and `driverOptions` is the only leak, documented and
  unstable.
- **A user-supplied desktop or mobile `type` enum** is out. `device` presence,
  context platform, and identifier syntax disambiguate. Users state intent, not
  taxonomy.
- **Common-app name registries**, mapping `"notepad"` to a hardcoded path table,
  are out. Paths, IDs, and AUMIDs are explicit, and `$VAR` expansion covers
  portability.
- **Implicit system-image downloads** are out. Multi-GB fetches are opt-in
  through the install machinery, never a side effect of running a test.
- Real-device implementation covering signing, provisioning, and ADB auth. Also
  cloud-farm implementation and runtime orientation changes. These are
  **schema-reserved only** until planned as their own phases.
- Administrator and UAC interaction, background-window automation, and
  image-based element location. Also watchOS, tvOS, Wear, and Auto, and the
  Espresso, Maestro, and Detox backends. Finally pinch, zoom, biometric, and
  geolocation primitives. Those are escape hatch only, for now.
- A device fan-out matrix, meaning `context_v3.device` as an array, is a
  plausible future additive change, deliberately not designed yet.

## Backward compatibility

Nothing existing changes shape. Everything is additive. There are new steps
(`startSurface`, `swipe`), new `oneOf` branches (`surfaceApp` and app
`waitUntil`), and new `platforms` enum values (`android` and `ios`). There are
also new optional context fields (`requires` and `device`), one new optional
step field (`click.duration`), and new schema files. There's one deliberate exception, per
ADR 01024. The device descriptor's reserved `type` field was replaced by
`deviceType` in A3a. That was safe because `type` was validated but always
FAILed, so no working spec carried it. Specs that never mention apps or mobile
platforms validate and run identically before and after every phase.
