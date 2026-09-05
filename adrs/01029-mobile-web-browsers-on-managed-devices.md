---
status: accepted
date: 2026-07-05
decision-makers: [hawkeyexl]
---

# Mobile web browsers on managed devices (phase A5)

## Context and Problem Statement

Phases A3 and A4 gave `platforms: "android"` and `"ios"` a complete native-app
story. That's capability preflight, and managed emulator and simulator boot
with a run-level device registry. It's also one shared Appium session per
device, and launch-ownership teardown (ADRs 01024, 01025, 01027, 01028). Mobile **web**
stayed stubbed. Any mobile context containing a browser step SKIPped with a
"lands in phase A5" roadmap reason. The design doc reserved the semantics. With
a mobile platform entry, `browsers` means **the browser on the device**. It
comes with an unsupported-combination SKIP matrix, and device-fixed
`browserConfig` is rejected.

How should mobile browser sessions be opened, and which combinations run? And
how do the desktop browser conventions translate, or deliberately not
translate, to a browser that lives on a managed device? Those conventions are
the `safari`→`webkit` alias, default browser resolution, headless, window and
viewport handling, cross-engine fallback, engine warm-up, and the desktop
Appium pool.

## Decision Drivers

- Un-gate the "one page, four targets" story: one `runOn` entry fanning a web
  test across `windows`/`mac`/`android`/`ios`.
- Reuse the A3 and A4 device layer verbatim: descriptor → plan → registry →
  boot → sweep. A mobile-web test is a *browser*-surface test that happens to
  run on a device, with no app descriptor involved.
- Keep every desktop browser step implementation unchanged. That covers goTo,
  find, click, screenshot, and runBrowserScript. Element semantics on a device
  browser are web DOM, so the session must ride the existing driver and
  session-registry path.
- Deterministic gating on every host: unsupported combinations and scope
  limits must SKIP before any SDK/Xcode probe or multi-GB install.
- Authored contradictions should be loud, not silently ignored.

## Considered Options

1. **Device browser through the device-session architecture, gate-first**
   (chosen). A pure `mobileBrowserGate` decides proceed, SKIP, or FAIL before
   any toolchain work. A proceeding context boots its default device through
   the existing registry path. It opens one webdriver session with
   `browserName`, either UiAutomator2 with Chrome or XCUITest with Safari,
   against the app-session Appium server. That session registers in the browser
   session registry like any desktop engine.
2. **Mobile engines as first-class desktop-pool candidates**: teach
   `buildFallbackCandidates`/`driverStart` about device engines so mobile
   browsers flow through the desktop start path (warm-up, fallback, pool).
3. **Defer mobile web again** and keep the roadmap stub.

## Decision Outcome

Chosen option: **option 1**. The device layer already owns everything hard,
meaning boot, reuse, teardown, ports, and APPIUM_HOME. And the desktop engine
machinery encodes assumptions that are wrong on a device, such as engine
substitutability, host-local binaries, and window sizing. Concretely:

- **Support matrix.** `chrome` with `android`, and `safari` with `ios`, are the
  only supported pairs. Every other engine SKIPs with the supported browser
  named. There is no cross-engine fallback on mobile. The device browser is
  part of the device image, not an installable choice, so `browserFallback`
  semantics don't apply.
- **Platform-aware `safari` alias.** `resolveContexts` rewrites
  `safari`→`webkit` only when pairing with a desktop (or unset) platform. On
  `android`/`ios` pairs the authored name is preserved: `safari` on ios means
  the real device Safari; `webkit` on ios is an unsupported combination.
- **Default browser per platform.** A mobile entry with browser steps and no
  `browsers` key gets the platform's device browser, chrome or safari. It does
  not get the desktop first-available default. The desktop default-fill and the
  engine warm-up pre-pass both exclude mobile contexts.
- **Device-fixed config FAILs.** Authored `headless: false`, `window`, or
  `viewport` on a mobile pair is an authored contradiction (the device owns
  its display) and FAILs the context with a pointer to `device.headless` /
  `device.deviceType`. `headless: true` is indistinguishable from the schema
  default (AJV `useDefaults`) and is ignored. This is the one non-SKIP mobile
  gate outcome.
- **Mixed app and web contexts are deferred.** One mobile context mixing native
  app surfaces and browser steps SKIPs with a split-the-test pointer.
  Interleaving requires foreground plus NATIVE_APP and WEBVIEW context
  switching, which belongs with the A6 interaction-vocabulary work. Pure
  mobile-web and pure native-app contexts both run today.
- **Session mechanics.** The mobile branch boots the context's default device
  through `acquireDevice` or `acquireSimulator`, with the same registry and the
  same `bootedByUs` sweep. It then opens one session with
  `browserName: Chrome|Safari` and `appium:udid`, against the app-session
  Appium server. That server is homed where the lazily-installed mobile driver
  lives. The session registers in the browser session registry under its engine
  name, so every desktop browser step routes through it unchanged. One device
  gets one browser session, and additional browser surfaces on a device are
  rejected.
- **On-device chromedriver management.** Android sessions set
  `appium:chromedriverAutodownload` with `appium:chromedriverExecutableDir`
  under the Doc Detective cache. The run-owned Appium server starts with
  `--allow-insecure=uiautomator2:chromedriver_autodownload`. Appium fetches
  the chromedriver matching the device image's Chrome once, then reuses it
  across runs. Session-start failures SKIP with the likely cause named. An
  AOSP image without Chrome points at `google_apis` images and
  `doc-detective install android`.
- **WDA ceiling.** iOS mobile-web sessions default their WebDriverAgent launch
  and connect ceiling to the same generous 15 min the apps-ios fixtures author.
  A web session has no `startSurface` step to carry a timeout, and the first
  XCUITest session cold-builds WDA.
- **Scheduling.** The `android-emulator` exclusivity mutex now covers exactly
  the android contexts that will boot an emulator: native-app contexts and
  mobile-web contexts whose gate proceeds. Deterministically-gated contexts
  (matrix/mixed/config) never take it.

### Consequences

- Good: `"runOn": [{ "platforms": ["windows","mac","android","ios"],
  "browsers": "chrome" }]` now runs one page on four targets. The ios leg SKIPs
  by the matrix, which is visible, explained gating.
- Good: no new step types, no schema shape changes (only the `browserName`
  `$comment` clarifying the platform-aware alias); desktop behavior is
  byte-identical.
- Good: mobile-web fixtures ride the existing KVM/macOS CI legs, gated on ≥1
  real PASS where the host is known-capable.
- Bad: mixed app+web docs flows (e.g. "open the app, then check the web
  dashboard") need two tests until A6.
- Bad: the emulator's host-loopback URL, `10.0.2.2`, differs from the iOS
  simulator's `localhost`. So a localhost-targeting test isn't portable across
  the two mobile targets as written. That's documented, with `$VAR`
  substitution as the workaround.
- Neutral: `record` on a mobile browser context is not designed here (app
  recording is phase A7).

### Confirmation

- Hermetic unit coverage spans the gate matrix, config, and mixed permutations.
  It also covers the capability shapes, the platform-aware alias in
  `resolveContexts`, warm-up exclusion, and the emulator-mutex predicate. Those
  live in
  `test/mobile-browser.test.js`, `test/context-resolution.test.js`, and
  `test/concurrency.test.js`. Runner-level skip and FAIL-reason assertions live
  in `test/core-core.test.js`.
- End-to-end, `test/core-artifacts/mobile-web-android/` PASSes on the two
  Android KVM CI legs, covering reuse and managed-boot under
  `DD_FIXTURES_REQUIRE_PASS=1`. `test/core-artifacts/mobile-web-ios/` PASSes on
  the gated macOS general leg. Both groups' SKIP-matrix permutations land
  SKIPPED everywhere.

## Pros and Cons of the Options

### Option 1: device browser through the device-session architecture

- Good: reuses the registry/boot/sweep and the desktop step implementations
  unchanged; the gate is pure and unit-testable on any host.
- Good: matches the design doc's "driven through the same device session"
  architecture and its SKIP-matrix contract.
- Neutral: two session-creation paths in `runContext` (desktop pool vs.
  device), each owning the assumptions true for its machine.
- Bad: mixed app+web needs a deferral guard until A6.

### Option 2: mobile engines in the desktop pool machinery

- Good: one session-creation path.
- Bad: warm-up, cross-engine fallback, on-demand installs, headed→headless
  retries, and window sizing are all wrong for a device browser. Every branch
  would need mobile carve-outs, more invasive than a separate path.
- Bad: couples device boot (30–60s, RAM-heavy, mutex-scheduled) to a pool
  designed for cheap local servers.

### Option 3: defer again

- Good: nothing to maintain.
- Bad: mobile documentation testing stays half-delivered; the "one page, four
  targets" story stays gated on no technical blocker.
