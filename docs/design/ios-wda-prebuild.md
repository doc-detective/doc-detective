# Design: managed WebDriverAgent prebuild

Status: **implemented (phases 1–4, ADR 01059).** Two empirical checkpoints await confirmation from
the live macOS fixture legs. Those are the Xcode floor, pinned at 14, and the locator's driver
floor, pinned at major 10. Adjust the pins if the legs disagree. This document is the implementation plan for
building WebDriverAgent (WDA) as part of `doc-detective install ios`, and auto-consuming the build
products in iOS sessions. It was produced from the CI wall-clock investigation (2026-07-13). The
companion plan is [warm-phase.md](warm-phase.md), which front-loads provisioning into an inline
warm phase, including this feature's products check.

## Problem

The first XCUITest session on a cold host compiles WebDriverAgent through `xcodebuild`. That's
about 10 minutes of the ~14-minute first-session cost that dominates the `apps-ios` and
`mobile-web-ios` CI legs. The mitigations that exist today are partial and live in the wrong
places:

- The capability mapping already exists, but it's **opt-in through an env var**.
  `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` maps to `appium:derivedDataPath`
  ([appSurface.ts:622-632](../../src/core/tests/appSurface.ts),
  [mobileBrowser.ts:193-196](../../src/core/tests/mobileBrowser.ts)). Its comment reads "e.g. a CI
  cache keyed by driver + Xcode version", so the caller owns correctness.
- The actual build cache lives in the **external** `doc-detective/github-action` (`ios: auto`, "ios
  WDA cache key v2"). Its key carries only OS and Xcode version. It cannot see the JIT-installed
  `appium-xcuitest-driver` version. ADR 01033 documents the resulting failure. A stale restored
  cache produced a 15-minute session timeout, plus a ceiling-length retry, for a ~30 min worst
  case.
- `doc-detective install ios` ([iosInstaller.ts](../../src/runtime/iosInstaller.ts)) is
  guidance-only. It probes `xcode-select -p` and `simctl list devices`, and downloads and builds
  nothing. Its describe text promises WebDriverAgent and XCUITest preparation regardless.

Every Doc Detective user running iOS tests in CI pays the cold compile or hand-rolls caching.

## Decisions (settled, 2026-07-13)

1. **Prebuild is part of `install ios`, default-on, no flag.** Check-and-skip on **build
   products**, not devices. WDA builds once per Xcode version and driver version, against a generic
   simulator destination. Device availability is neither necessary nor sufficient.
2. **No off-switch, best-effort instead.** The build is attempted, and any failure degrades to a
   `skipped` report row with guidance. That covers no full Xcode, signing issues, and a transient
   xcodebuild failure. The command stays green, matching the ADR 01053 best-effort pattern
   ([installer.ts:240-264](../../src/runtime/installer.ts)).
3. **Concurrency by read-only consumption plus a single locked writer.** Sessions consume the
   products through `appium:usePrebuiltWDA`, and readers never mutate the derived data. N
   concurrent runners therefore share one path safely. Only the installer writes, behind a new
   advisory lock. **No cross-process lock primitive exists in the codebase today**, confirmed by
   sweep, so one must be added.

## Cache layout and key

```text
<cacheDir>/ios/wda/<key>/           # e.g. ios/wda/xcode-16.4-16F6-driver-7.28.3/
  DerivedData/                      # xcodebuild -derivedDataPath target
  products.json                     # completeness marker, written LAST after validation
  last-used                         # sidecar stamp touched by the session-time locator
<cacheDir>/ios/wda/.lock/           # advisory lock dir (writer only)
```

- **Key inputs.** For the driver version, `resolveHeavyDepVersion("appium-xcuitest-driver", ctx)`
  ([loader.ts:216-240](../../src/runtime/loader.ts)) already exists. For the Xcode version and
  build, add a **new** `xcodebuild -version` probe in iosInstaller. Nothing in `src/` reads the
  Xcode version today. `xcode-select -p` can't distinguish full Xcode from bare Command Line Tools,
  and only full Xcode can build WDA.
- **`products.json` marker.** Records key inputs, the validated
  `Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app` path, and a timestamp.
  It's **published atomically**, written to a temp file in the same dir and then renamed. That's
  the `writeInstalledRecord` pattern ([cacheDir.ts:238-271](../../src/runtime/cacheDir.ts)). A
  lock-free reader therefore never observes partial JSON. Readers require the marker, and a crashed
  half-built dir has no marker, so it's invisible. This is the lock-free correctness story for
  readers.
- **Pruning.** This is keyed by the `last-used` sidecar stamp, **not** directory mtime. Reads inside
  a subtree don't bump a dir's mtime on APFS, so an actively-used key would look untouched. The
  session-time locator touches `last-used` on every valid hit. The installer, under the lock,
  deletes sibling key dirs whose stamp is over 30 days old. It updates the `installed.json` `ios`
  slot in the same pass, so that slot never references a deleted key. Active-use safety follows.
  Any key a live session consumes was stamped at that session's start, so a pruned key is provably
  30 days unused. The residual cross-process race isn't a real execution shape: a session that
  resolved a path, then idled 30 days before reading it. This isn't "keep current only". CI macOS
  runner pools mix Xcode images ([test/AGENTS.md:86](../../test/AGENTS.md)), and a shared weekly
  cache legitimately accumulates one entry per image. Keyed subdirs let mixed images coexist
  instead of thrashing.
- **installed.json.** Add an optional `ios?` slot mirroring the `android?` pattern
  ([cacheDir.ts:39-46, 220-222](../../src/runtime/cacheDir.ts)), recording the built keys.

## Phase 1: advisory lock primitive (`src/runtime/lock.ts`)

A small cross-process lock. It's `mkdir`-as-lock with a metadata file carrying `pid`, `hostname`,
and an ISO timestamp, plus a bounded wait with polling. **Staleness is a heartbeat lease, not
age-since-acquire.** Lock age alone must never permit takeover. A legitimate xcodebuild can hold
the lock for ~20 minutes. A TTL long enough to cover that would make a crashed holder block the
next build for the whole window. Instead, the holder refreshes the metadata timestamp about every
30 s. A contender may take over in two cases only. The **heartbeat** is stale, say over 5 minutes
of missed refreshes. Or the recorded pid is dead on the same host. A live slow build heartbeats and
is never stolen, while a crashed holder is recovered within minutes. Inject fs, clock, and sleep
effects so it's hermetically unit-testable, per the installer-test house pattern. No real spawns or
fs in unit tests.

TDD sequence: acquire-when-free → contend-and-wait → heartbeat-keeps-lease → stale-heartbeat
takeover → dead-pid takeover → release-on-throw. Heartbeat-keeps-lease means an old lock with a
fresh heartbeat and no takeover. These are pure unit tests only. No ADR is needed on its own, since
it ships with Phase 2's ADR as an implementation detail.

## Phase 2: the prebuild in `install ios`

Extend [iosInstaller.ts](../../src/runtime/iosInstaller.ts) after its existing probes. The
installer's `ctx: CacheDirContext` hook is already accepted but unused (`:44-45`). This phase is
what it was reserved for. Here's the pipeline, where each step is a report-visible outcome:

1. Existing probes unchanged (darwin, `--yes`, `xcode-select -p`, `simctl`). Dry-run gains a note
   that a WDA build would be verified/performed.
2. **New probe:** run `xcodebuild -version` through the injected `run` dep. Failure means a
   CLT-only host, giving a `skipped` row with "full Xcode required to prebuild WebDriverAgent"
   guidance. The probe also enforces a **minimum Xcode version floor**. `build-for-testing` against
   the generic `platform=iOS Simulator` destination requires a modern Xcode. Pin the exact floor
   during red→green, verifying empirically, likely at 14+. Below the floor, report `skipped` with
   upgrade guidance rather than running a doomed build. **It's best-effort, and never exits
   non-zero.**
3. **Ensure the driver** through `ensureRuntimeInstalled(["appium-xcuitest-driver"])`. Route it
   through the loader, never a raw `npm install`, so the npm-prune defenses stay engaged
   ([src/runtime/AGENTS.md](../../src/runtime/AGENTS.md), issue #501). This makes `install ios`
   heavier than today, adding a driver download on a bare host. That's acceptable and reportable.
4. **Resolve WDA source** from `resolveHeavyDepPathInCache("appium-xcuitest-driver", ctx)` to the
   bundled `appium-webdriveragent/` package root. Walk to it, don't hardcode nesting, since
   hoisting varies.
5. **Check-and-skip, the pre-lock fast path.** A valid `products.json` for the current key means
   `already-up-to-date`, with no lock overhead.
6. **Acquire the lock** at `ios/wda/.lock`, with a bounded wait. On timeout, report `skipped` with
   "another install is building". Then **re-check the marker before building**. A contender that
   waited out a concurrent build finds the now-valid `products.json`, releases, and reports
   `already-up-to-date`. That closes the TOCTOU window between steps 5 and 6, which would otherwise
   double-build on a cold host with parallel CI jobs.
7. **Build:**
   `xcodebuild build-for-testing -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner
   -destination "generic/platform=iOS Simulator" -derivedDataPath <keyed>/DerivedData`
   Give it a generous timeout of about 20 minutes. The android installer's transient-retry shape
   ([androidInstaller.ts:454-479](../../src/runtime/androidInstaller.ts)) applies, with
   xcodebuild-specific transient signatures. There's no `-destination` device dependency, so no
   simulator needs to exist or be booted.
8. **Validate** that the Runner .app exists. Then write `products.json` with an atomic temp and
   rename, record it in `installed.json`, prune stale siblings, and release the lock. Report
   `installed` when no key existed before. Report `updated` when a **new** key was built while a
   different key was previously recorded. Keys are additive subdirs, never replaced in place, so
   "updated" means the current toolchain moved, not that anything was rebuilt in place.

Structure it as the android installer does, with a **pure plan builder** driving both `--dry-run`
and execution. Its inputs are the probe results, the existing marker, and the key. Inject the full
effect surface: `run`, `fs`, the lock, `ensureRuntimeInstalled`, and the clock. Every branch above
gets a red→green unit test in `test/ios-installer.test.js`. Stub `resolvePathInCache` and
`ensureInstalled` per the [src/runtime/AGENTS.md](../../src/runtime/AGENTS.md) testing note. Cover
the **contend-and-lose** case too, where a second contender acquires the lock, finds the completed
marker, and skips the build. `test/cli-install.test.js` covers the dry-run wiring cross-platform.

Expect the new `xcodebuild` spawn from a cache-derived path to trip CodeQL's
`js/command-line-injection` false-positive class ([test/AGENTS.md:108-124](../../test/AGENTS.md)).
The resolution is alert dismissal with justification, not code contortions. The cache path is
already shell-meta-guarded by `assertSafeRuntimePath` ([cacheDir.ts:122-131](../../src/runtime/cacheDir.ts)).

## Phase 3: runtime consumption in iOS sessions

There are two capability builders: [appSurface.ts:602-633](../../src/core/tests/appSurface.ts) for
iOS apps, and [mobileBrowser.ts:173-197](../../src/core/tests/mobileBrowser.ts) for mobile web. In
both:

1. **Env override wins, unchanged.** If `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` is set, behave
   exactly as today (`derivedDataPath` only, caller owns semantics). Existing users see zero change.
2. Otherwise, use a **pure managed-products locator**. Compute the current key, taking the driver
   version from `resolveHeavyDepVersion` and the Xcode version from a shared probe helper extracted
   from Phase 2. Read `products.json`. On a valid hit, touch the `last-used` stamp and set **both**
   `appium:derivedDataPath`, the keyed DerivedData, **and** `appium:usePrebuiltWDA: true`. On any
   miss or unusable-cache condition, return null and change nothing, per ADR 01049 degradation
   semantics. That includes a driver version outside the locator's **supported floor**, described
   below. A keyed miss after a driver or Xcode bump is exactly today's behavior, where the session
   builds WDA itself. It's never an error.
3. `usePrebuiltWDA` makes sessions **read-only** consumers, apart from the sidecar stamp. That's
   the concurrency answer. If a prebuilt-WDA session creation fails, the existing ADR 01033 retry
   ([tests.ts:4868-4915](../../src/core/tests.ts)) applies, and a persistent failure surfaces
   normally. **Compatibility gate, an implementation checkpoint:** prebuilt-WDA handling is
   driver-version-sensitive. `usePrebuiltWDA` with `derivedDataPath` differs from the newer
   `appium:prebuiltWDAPath` and `useXctestrunFile` paths, and `.xctestrun` handling differs across
   versions. Pin a minimum supported `appium-xcuitest-driver` version during red→green against
   the live macOS leg. Record it as the locator's floor, and pick the capability pair there.
   Unsupported combinations get null, meaning a plain fallback, never a guess.
4. The Xcode-version probe result is memoized per run (one `xcodebuild -version` spawn max).

Unit tests: locator hit/miss/stale-key/marker-absent; env-override precedence; capability-shape
assertions for both builders.

## Phase 4: CI adoption

- **cache-warmer.yml (macOS leg):** add `node ./bin/doc-detective.js install ios --yes` after
  `install all`. The dd-cache action already persists the whole cache dir, so `ios/wda/**` rides
  the existing weekly key; keyed subdirs absorb the mixed-Xcode-image runner pool.
- **fixtures.yml:** the `apps-ios` and `mobile-web-ios` legs run `install ios --yes` after cache
  restore. That's seconds on a warm week, and one build on a cold one. Once proven, the action's
  `ios: auto` WDA cache and its stale-key failure mode become redundant for these legs. Retire it
  through a follow-up in `doc-detective/github-action`, tracked outside this repo's change.
- The expected effect: first-iOS-session cost drops from ~14 min to simulator boot plus launch on
  every warm-cache run. The ADR 01033 stale-cache 30-minute worst case also disappears, because the
  key now sees the driver version.

## Companions (repo policy)

- **ADR**, one with the Phase 2 and 3 PR. `install ios` performs a best-effort WDA prebuild.
  Sessions auto-consume managed products read-only, and the env var remains the override. The
  number is picked at merge time per the collision rule.
- **Fixtures:** no new fixture *files*. The `apps-ios` and `mobile-web-ios` legs already exercise
  the full session path end-to-end, and now do so through the prebuilt products. The required-PASS
  gate on macOS is the assertion. The install-side permutations are hermetic unit tests by design,
  since fixtures can't assert installer internals cross-platform.
- **Docs impact: yes.** The `install ios` CLI reference changes from guidance-only to building.
  Add a CI-caching section too, for persona Priya and the P-series CUJs. Land it with the code.

## Non-goals

- Shipping prebuilt WDA binaries as per-Xcode artifacts hosted by us. That's maintenance-heavy and
  raises signing questions. The keyed local build achieves the win.
- Building WebDriverAgentMac, the macOS `apps` leg's cold cost. The same pattern could follow
  later, but it's out of scope here.
- An opt-out flag, deliberately omitted per decision 2. An escape hatch can be added later
  additively if a real need appears.
