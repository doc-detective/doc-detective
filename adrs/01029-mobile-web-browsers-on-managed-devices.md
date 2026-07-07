---
status: accepted
date: 2026-07-05
decision-makers: [hawkeyexl]
---

# Mobile web browsers on managed devices (phase A5)

## Context and Problem Statement

Phases A3/A4 gave `platforms: "android"`/`"ios"` a complete native-app story:
capability preflight, managed emulator/simulator boot with a run-level device
registry, one shared Appium session per device, and launch-ownership teardown
(ADRs 01024, 01025, 01027, 01028). Mobile **web** stayed stubbed: any mobile
context containing a browser step SKIPped with a "lands in phase A5" roadmap
reason, and the design doc reserved the semantics — with a mobile platform
entry, `browsers` means **the browser on the device**, with an
unsupported-combination SKIP matrix and device-fixed `browserConfig` rejected.

How should mobile browser sessions be opened, which combinations run, and how
do the desktop browser conventions (the `safari`→`webkit` alias, default
browser resolution, headless/window/viewport, cross-engine fallback, engine
warm-up, the desktop Appium pool) translate — or deliberately not translate —
to a browser that lives on a managed device?

## Decision Drivers

- Un-gate the "one page, four targets" story: one `runOn` entry fanning a web
  test across `windows`/`mac`/`android`/`ios`.
- Reuse the A3/A4 device layer verbatim (descriptor → plan → registry → boot →
  sweep); a mobile-web test is a *browser*-surface test that happens to run on
  a device — no app descriptor involved.
- Keep every desktop browser step implementation (goTo/find/click/screenshot/
  runBrowserScript) unchanged: element semantics on a device browser are web
  DOM, so the session must ride the existing driver/session-registry path.
- Deterministic gating on every host: unsupported combinations and scope
  limits must SKIP before any SDK/Xcode probe or multi-GB install.
- Authored contradictions should be loud, not silently ignored.

## Considered Options

1. **Device browser through the device-session architecture, gate-first**
   (chosen): a pure `mobileBrowserGate` decides proceed/SKIP/FAIL before any
   toolchain work; a proceeding context boots its default device via the
   existing registry path and opens one webdriver session with `browserName`
   (UiAutomator2+Chrome / XCUITest+Safari) against the app-session Appium
   server, registered in the browser session registry like any desktop engine.
2. **Mobile engines as first-class desktop-pool candidates**: teach
   `buildFallbackCandidates`/`driverStart` about device engines so mobile
   browsers flow through the desktop start path (warm-up, fallback, pool).
3. **Defer mobile web again** and keep the roadmap stub.

## Decision Outcome

Chosen option: **option 1**, because the device layer already owns everything
hard (boot, reuse, teardown, ports, APPIUM_HOME) and the desktop engine
machinery encodes assumptions that are wrong on a device (engine
substitutability, host-local binaries, window sizing). Concretely:

- **Support matrix.** `chrome`+`android` and `safari`+`ios` are the only
  supported pairs. Every other engine SKIPs with the supported browser named.
  There is no cross-engine fallback on mobile — the device browser is part of
  the device image, not an installable choice, so `browserFallback` semantics
  don't apply.
- **Platform-aware `safari` alias.** `resolveContexts` rewrites
  `safari`→`webkit` only when pairing with a desktop (or unset) platform. On
  `android`/`ios` pairs the authored name is preserved: `safari` on ios means
  the real device Safari; `webkit` on ios is an unsupported combination.
- **Default browser per platform.** A mobile entry with browser steps and no
  `browsers` key gets the platform's device browser (chrome/safari), not the
  desktop first-available default; the desktop default-fill and the engine
  warm-up pre-pass both exclude mobile contexts.
- **Device-fixed config FAILs.** Authored `headless: false`, `window`, or
  `viewport` on a mobile pair is an authored contradiction (the device owns
  its display) and FAILs the context with a pointer to `device.headless` /
  `device.deviceType`. `headless: true` is indistinguishable from the schema
  default (AJV `useDefaults`) and is ignored. This is the one non-SKIP mobile
  gate outcome.
- **Mixed app+web contexts are deferred.** One mobile context mixing native
  app surfaces and browser steps SKIPs with a split-the-test pointer:
  interleaving requires foreground plus NATIVE_APP/WEBVIEW context switching,
  which belongs with the A6 interaction-vocabulary work. Pure mobile-web and
  pure native-app contexts both run today.
- **Session mechanics.** The mobile branch boots the context's default device
  through `acquireDevice`/`acquireSimulator` (same registry, same
  `bootedByUs` sweep), then opens one session with
  `browserName: Chrome|Safari` + `appium:udid` against the app-session Appium
  server (homed where the lazily-installed mobile driver lives). The session
  registers in the browser session registry under its engine name, so every
  desktop browser step routes through it unchanged. One device, one browser
  session; additional browser surfaces on a device are rejected.
- **On-device chromedriver management.** Android sessions set
  `appium:chromedriverAutodownload` with `appium:chromedriverExecutableDir`
  under the Doc Detective cache, and the run-owned Appium server starts with
  `--allow-insecure=uiautomator2:chromedriver_autodownload` — Appium fetches
  the chromedriver matching the device image's Chrome once, then reuses it
  across runs. Session-start failures SKIP with the likely cause named (an
  AOSP image without Chrome points at `google_apis` images and
  `doc-detective install android`).
- **WDA ceiling.** iOS mobile-web sessions default their WebDriverAgent
  launch/connect ceiling to the same generous value the apps-ios fixtures
  author (15 min) because a web session has no `startSurface` step to carry a
  timeout, and the first XCUITest session cold-builds WDA.
- **Scheduling.** The `android-emulator` exclusivity mutex now covers exactly
  the android contexts that will boot an emulator: native-app contexts and
  mobile-web contexts whose gate proceeds. Deterministically-gated contexts
  (matrix/mixed/config) never take it.

### Consequences

- Good: `"runOn": [{ "platforms": ["windows","mac","android","ios"],
  "browsers": "chrome" }]` now runs one page on four targets (with the ios
  leg SKIPping by the matrix — visible, explained gating).
- Good: no new step types, no schema shape changes (only the `browserName`
  `$comment` clarifying the platform-aware alias); desktop behavior is
  byte-identical.
- Good: mobile-web fixtures ride the existing KVM/macOS CI legs, gated on ≥1
  real PASS where the host is known-capable.
- Bad: mixed app+web docs flows (e.g. "open the app, then check the web
  dashboard") need two tests until A6.
- Bad: the emulator's host-loopback URL (`10.0.2.2`) differs from the iOS
  simulator's (`localhost`), so a localhost-targeting test isn't portable
  across the two mobile targets as written; documented, with `$VAR`
  substitution as the workaround.
- Neutral: `record` on a mobile browser context is not designed here (app
  recording is phase A7).

### Confirmation

- Hermetic unit coverage: the gate matrix/config/mixed permutations, the
  capability shapes, the platform-aware alias in `resolveContexts`, warm-up
  exclusion, and the emulator-mutex predicate
  (`test/mobile-browser.test.js`, `test/context-resolution.test.js`,
  `test/concurrency.test.js`), plus runner-level skip/FAIL-reason assertions
  in `test/core-core.test.js`.
- End-to-end: `test/core-artifacts/mobile-web-android/` PASSes on the two
  Android KVM CI legs (reuse + managed-boot, `DD_FIXTURES_REQUIRE_PASS=1`);
  `test/core-artifacts/mobile-web-ios/` PASSes on the macOS general leg
  (gated); both groups' SKIP-matrix permutations land SKIPPED everywhere.

## Pros and Cons of the Options

### Option 1 — device browser through the device-session architecture

- Good: reuses the registry/boot/sweep and the desktop step implementations
  unchanged; the gate is pure and unit-testable on any host.
- Good: matches the design doc's "driven through the same device session"
  architecture and its SKIP-matrix contract.
- Neutral: two session-creation paths in `runContext` (desktop pool vs.
  device), each owning the assumptions true for its machine.
- Bad: mixed app+web needs a deferral guard until A6.

### Option 2 — mobile engines in the desktop pool machinery

- Good: one session-creation path.
- Bad: warm-up, cross-engine fallback, on-demand installs, headed→headless
  retries, and window sizing are all wrong for a device browser; every branch
  would need mobile carve-outs — more invasive than a separate path.
- Bad: couples device boot (30–60s, RAM-heavy, mutex-scheduled) to a pool
  designed for cheap local servers.

### Option 3 — defer again

- Good: nothing to maintain.
- Bad: mobile documentation testing stays half-delivered; the "one page, four
  targets" story stays gated on no technical blocker.
