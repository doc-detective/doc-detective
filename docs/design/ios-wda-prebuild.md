# Design: managed WebDriverAgent prebuild

Status: **implemented (phases 1–4, ADR 01059).** The empirical checkpoints — the Xcode floor
(pinned at 14) and the locator's driver floor (pinned at major 10) — await confirmation from the
live macOS fixture legs; adjust the pins if the legs disagree. This document is the implementation
plan for building
WebDriverAgent (WDA) as part of `doc-detective install ios` and auto-consuming the build products in
iOS sessions. It was produced from the CI wall-clock investigation (2026-07-13); the companion plan
is [warm-phase.md](warm-phase.md), which front-loads provisioning (including this feature's
products check) into an inline warm phase.

## Problem

The first XCUITest session on a cold host compiles WebDriverAgent via `xcodebuild` — ~10 minutes of
the ~14-minute first-session cost that dominates the `apps-ios` / `mobile-web-ios` CI legs. The
mitigations that exist today are partial and live in the wrong places:

- The capability mapping already exists but is **opt-in via env var**:
  `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` → `appium:derivedDataPath`
  ([appSurface.ts:622-632](../../src/core/tests/appSurface.ts),
  [mobileBrowser.ts:193-196](../../src/core/tests/mobileBrowser.ts)), with the comment "e.g. a CI
  cache keyed by driver + Xcode version" — i.e. the caller owns correctness.
- The actual build cache lives in the **external** `doc-detective/github-action` (`ios: auto`, "ios
  WDA cache key v2"), whose key carries only OS + Xcode version. It cannot see the JIT-installed
  `appium-xcuitest-driver` version, and ADR 01033 documents the resulting failure: a stale restored
  cache produced a 15-minute session timeout plus a ceiling-length retry (~30 min worst case).
- `doc-detective install ios` ([iosInstaller.ts](../../src/runtime/iosInstaller.ts)) is
  guidance-only: it probes `xcode-select -p` and `simctl list devices`, downloads and builds
  nothing — despite its describe text promising WebDriverAgent/XCUITest preparation.

Every Doc Detective user running iOS tests in CI pays the cold compile or hand-rolls caching.

## Decisions (settled, 2026-07-13)

1. **Prebuild is part of `install ios`, default-on, no flag.** Check-and-skip on **build
   products** (not devices): WDA builds once per (Xcode version × driver version) against a generic
   simulator destination; device availability is neither necessary nor sufficient.
2. **No off-switch; best-effort instead.** The build is attempted and any failure (no full Xcode,
   signing issues, transient xcodebuild failure) degrades to a `skipped` report row with guidance —
   the command stays green, matching the ADR 01053 best-effort pattern
   ([installer.ts:240-264](../../src/runtime/installer.ts)).
3. **Concurrency by read-only consumption + a single locked writer.** Sessions consume the
   products via `appium:usePrebuiltWDA` (readers never mutate the derived data), so N concurrent
   runners share one path safely. Only the installer writes, behind a new advisory lock — **no
   cross-process lock primitive exists in the codebase today** (confirmed by sweep); one must be
   added.

## Cache layout and key

```text
<cacheDir>/ios/wda/<key>/           # e.g. ios/wda/xcode-16.4-16F6-driver-7.28.3/
  DerivedData/                      # xcodebuild -derivedDataPath target
  products.json                     # completeness marker — written LAST, after validation
  last-used                         # sidecar stamp touched by the session-time locator
<cacheDir>/ios/wda/.lock/           # advisory lock dir (writer only)
```

- **Key inputs.** Driver version: `resolveHeavyDepVersion("appium-xcuitest-driver", ctx)`
  ([loader.ts:216-240](../../src/runtime/loader.ts)) — already exists. Xcode version + build: a
  **new** `xcodebuild -version` probe in iosInstaller (nothing in `src/` reads the Xcode version
  today; `xcode-select -p` can't distinguish full Xcode from bare Command Line Tools, and only full
  Xcode can build WDA).
- **`products.json` marker.** Records key inputs, the validated
  `Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app` path, and a timestamp.
  **Published atomically** — written to a temp file in the same dir, then renamed (the
  `writeInstalledRecord` pattern, [cacheDir.ts:238-271](../../src/runtime/cacheDir.ts)) — so a
  lock-free reader never observes partial JSON. Readers require the marker; a crashed half-built
  dir has no marker and is invisible. This is the lock-free correctness story for readers.
- **Pruning.** Keyed by the `last-used` sidecar stamp, **not** directory mtime (reads inside a
  subtree don't bump a dir's mtime on APFS, so an actively-used key would look untouched). The
  session-time locator touches `last-used` on every valid hit; the installer, under the lock,
  deletes sibling key dirs whose stamp is >30 days old and updates the `installed.json` `ios` slot
  in the same pass so it never references a deleted key. Active-use safety follows: any key a live
  session consumes was stamped at that session's start, so a pruned key is provably 30 days unused
  (the residual cross-process race — a session that resolved a path and then idled 30 days before
  reading it — is not a real execution shape). Not "keep current only": CI macOS runner pools mix
  Xcode images ([test/AGENTS.md:86](../../test/AGENTS.md)), and a shared weekly cache legitimately
  accumulates one entry per image. Keyed subdirs make mixed images coexist instead of thrashing.
- **installed.json.** Add an optional `ios?` slot mirroring the `android?` pattern
  ([cacheDir.ts:39-46, 220-222](../../src/runtime/cacheDir.ts)) recording the built key(s).

## Phase 1 — advisory lock primitive (`src/runtime/lock.ts`)

A small cross-process lock: `mkdir`-as-lock with a metadata file (`pid`, `hostname`, ISO
timestamp), bounded wait with polling. **Staleness is a heartbeat lease, not age-since-acquire** —
lock age alone must never permit takeover, because a legitimate xcodebuild can hold the lock for
~20 minutes and a TTL long enough to cover it would make a crashed holder block the next build for
that whole window. Instead: the holder refreshes the metadata timestamp on a short interval
(~30 s); a contender may take over only when the **heartbeat** is stale (e.g. >5 min — many missed
refreshes) or, on the same host, the recorded pid is dead. A live slow build heartbeats and is
never stolen; a crashed holder is recovered within minutes. Injected fs/clock/sleep effects so
it's hermetically unit-testable per the installer-test house pattern (no real spawns/fs in unit
tests).

TDD sequence: acquire-when-free → contend-and-wait → heartbeat-keeps-lease (old lock, fresh
heartbeat, no takeover) → stale-heartbeat takeover → dead-pid takeover → release-on-throw. Pure
unit tests only; no ADR needed alone (it ships with Phase 2's ADR as an implementation detail).

## Phase 2 — the prebuild in `install ios`

Extend [iosInstaller.ts](../../src/runtime/iosInstaller.ts) after its existing probes. The
installer's `ctx: CacheDirContext` hook is already accepted-but-unused (`:44-45`) — this phase is
what it was reserved for. Pipeline, each step a report-visible outcome:

1. Existing probes unchanged (darwin, `--yes`, `xcode-select -p`, `simctl`). Dry-run gains a note
   that a WDA build would be verified/performed.
2. **New probe:** `xcodebuild -version` via the injected `run` dep. Failure ⇒ CLT-only host ⇒
   `skipped` row with "full Xcode required to prebuild WebDriverAgent" guidance. The probe also
   enforces a **minimum Xcode version floor**: `build-for-testing` against the generic
   `platform=iOS Simulator` destination requires a modern Xcode (pin the exact floor during
   red→green — verify empirically, likely 14+); below it, `skipped` with upgrade guidance rather
   than a doomed build. **Best-effort: never a non-zero exit.**
3. **Ensure the driver** via `ensureRuntimeInstalled(["appium-xcuitest-driver"])` — routed through
   the loader, never a raw `npm install`, so the npm-prune defenses stay engaged
   ([src/runtime/AGENTS.md](../../src/runtime/AGENTS.md), issue #501). This makes `install ios`
   heavier than today (driver download on a bare host) — acceptable and reportable.
4. **Resolve WDA source** from `resolveHeavyDepPathInCache("appium-xcuitest-driver", ctx)` →
   bundled `appium-webdriveragent/` package root (walk, don't hardcode nesting — hoisting varies).
5. **Check-and-skip (pre-lock fast path):** valid `products.json` for the current key ⇒
   `already-up-to-date`, no lock overhead.
6. **Acquire the lock** (`ios/wda/.lock`, bounded wait; on timeout report `skipped`, "another
   install is building"), then **re-check the marker before building**: a contender that waited
   out a concurrent build finds the now-valid `products.json`, releases, and reports
   `already-up-to-date` — closing the TOCTOU window between steps 5 and 6 that would otherwise
   double-build on a cold host with parallel CI jobs.
7. **Build:**
   `xcodebuild build-for-testing -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner
   -destination "generic/platform=iOS Simulator" -derivedDataPath <keyed>/DerivedData`
   with a generous timeout (~20 min; the android installer's transient-retry shape,
   [androidInstaller.ts:454-479](../../src/runtime/androidInstaller.ts), applies with
   xcodebuild-specific transient signatures). No `-destination` device dependency: no simulator
   needs to exist or be booted.
8. **Validate** the Runner .app exists → write `products.json` (atomic temp+rename) → record in
   `installed.json` → prune stale siblings → release lock. Report `installed` when no key existed
   before, `updated` when a **new** key was built while a different key was previously recorded —
   keys are additive subdirs, never replaced in place, so "updated" means "the current toolchain
   moved", not "rebuilt in place".

Structure it as the android installer does: a **pure plan builder** (inputs: probe results,
existing marker, key) driving both `--dry-run` and execution, with the full effect surface
injected (`run`, `fs`, lock, `ensureRuntimeInstalled`, clock). Every branch above gets a red→green
unit test in `test/ios-installer.test.js` (stub `resolvePathInCache`/`ensureInstalled` per
[src/runtime/AGENTS.md](../../src/runtime/AGENTS.md) testing note), including the
**contend-and-lose** case (second contender acquires the lock, finds the completed marker, skips
the build); `test/cli-install.test.js` covers the dry-run wiring cross-platform.

Expect the new `xcodebuild` spawn from a cache-derived path to trip CodeQL's
`js/command-line-injection` false-positive class ([test/AGENTS.md:108-124](../../test/AGENTS.md));
the resolution is alert dismissal with justification, not code contortions. The cache path is
already shell-meta-guarded by `assertSafeRuntimePath` ([cacheDir.ts:122-131](../../src/runtime/cacheDir.ts)).

## Phase 3 — runtime consumption in iOS sessions

In the two capability builders — [appSurface.ts:602-633](../../src/core/tests/appSurface.ts) (iOS
apps) and [mobileBrowser.ts:173-197](../../src/core/tests/mobileBrowser.ts) (mobile web):

1. **Env override wins, unchanged.** If `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` is set, behave
   exactly as today (`derivedDataPath` only, caller owns semantics). Existing users see zero change.
2. Otherwise, **pure managed-products locator**: compute the current key (driver version via
   `resolveHeavyDepVersion`, Xcode version via a shared probe helper extracted from Phase 2), read
   `products.json`, and on a valid hit touch the `last-used` stamp and set **both**
   `appium:derivedDataPath` (the keyed DerivedData) **and** `appium:usePrebuiltWDA: true`. On any
   miss/unusable-cache condition — including a driver version outside the locator's **supported
   floor** (see below) — return null and change nothing: ADR 01049 degradation semantics. A keyed
   miss after a driver or Xcode bump is exactly today's behavior (session builds WDA itself),
   never an error.
3. `usePrebuiltWDA` makes sessions **read-only** consumers (except the sidecar stamp) — the
   concurrency answer. If a prebuilt-WDA session creation fails, the existing ADR 01033 retry
   ([tests.ts:4868-4915](../../src/core/tests.ts)) applies; a persistent failure surfaces
   normally. **Compatibility gate (implementation checkpoint):** prebuilt-WDA handling is
   driver-version-sensitive (`usePrebuiltWDA`+`derivedDataPath` vs the newer
   `appium:prebuiltWDAPath` / `useXctestrunFile` paths, and `.xctestrun` handling differs across
   versions). Pin a minimum supported `appium-xcuitest-driver` version during red→green against
   the live macOS leg, record it as the locator's floor, and pick the capability pair there —
   unsupported combinations get null (plain fallback), never a guess.
4. The Xcode-version probe result is memoized per run (one `xcodebuild -version` spawn max).

Unit tests: locator hit/miss/stale-key/marker-absent; env-override precedence; capability-shape
assertions for both builders.

## Phase 4 — CI adoption

- **cache-warmer.yml (macOS leg):** add `node ./bin/doc-detective.js install ios --yes` after
  `install all`. The dd-cache action already persists the whole cache dir, so `ios/wda/**` rides
  the existing weekly key; keyed subdirs absorb the mixed-Xcode-image runner pool.
- **fixtures.yml:** the `apps-ios` / `mobile-web-ios` legs run `install ios --yes` after cache
  restore (seconds on a warm week; one build on a cold one). Once proven, the action's `ios: auto`
  WDA cache and its stale-key failure mode become redundant for these legs — retire via a
  follow-up in `doc-detective/github-action` (tracked, not part of this repo's change).
- Expected effect: first-iOS-session cost drops from ~14 min to simulator-boot-plus-launch on every
  warm-cache run, and the ADR 01033 stale-cache 30-minute worst case disappears (the key now sees
  the driver version).

## Companions (repo policy)

- **ADR** (one, with the Phase 2+3 PR): `install ios` performs a best-effort WDA prebuild;
  sessions auto-consume managed products read-only; env var remains the override. Number picked at
  merge time per the collision rule.
- **Fixtures:** no new fixture *files* — the `apps-ios`/`mobile-web-ios` legs already exercise the
  full session path end-to-end and now do so through the prebuilt products (the required-PASS gate
  on macOS is the assertion). The install-side permutations are hermetic unit tests by design
  (fixtures can't assert installer internals cross-platform).
- **Docs impact: yes.** The `install ios` CLI reference (behavior change from guidance-only to
  building), plus a CI-caching section (persona Priya, CUJ P-series). Land with the code.

## Non-goals

- Shipping prebuilt WDA binaries (per-Xcode artifacts hosted by us) — maintenance-heavy, signing
  questions; the keyed local build achieves the win.
- Building WebDriverAgentMac (the macOS `apps` leg's cold cost) — same pattern could follow later;
  out of scope here.
- An opt-out flag — deliberately omitted (decision 2); an escape hatch can be added later
  additively if a real need appears.
