---
status: accepted
date: 2026-07-13
decision-makers: [hawkeyexl]
---

# Managed WebDriverAgent prebuild in `install ios`, auto-consumed read-only by iOS sessions

## Context and Problem Statement

The first XCUITest session on a cold host compiles WebDriverAgent (WDA) from source through
`xcodebuild`. That's ~10 minutes of the ~14-minute first-session cost dominating the `apps-ios` and
`mobile-web-ios` CI legs. Every Doc Detective user running iOS tests in CI pays it, or hand-rolls
caching for it. The mitigations that existed were partial and mis-placed. The
`DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` → `appium:derivedDataPath` mapping was opt-in, with the
caller owning correctness. And the actual cache lived in the external `doc-detective/github-action`,
under a key that cannot see the JIT-installed `appium-xcuitest-driver` version. ADR 01033 records
the resulting stale-cache failure, a 15-minute session timeout plus a ceiling-length retry, or ~30
minutes worst case. Meanwhile `doc-detective install ios` was guidance-only, despite promising
WebDriverAgent and XCUITest preparation. Where should the WDA build cost live, and how do sessions
consume the products safely under concurrency?

The full implementation plan this ADR records the decisions of is
[docs/design/ios-wda-prebuild.md](../docs/design/ios-wda-prebuild.md).

## Decision Drivers

- Eliminate the ~10-minute in-session compile for warm-cache runs, for every user, not only this
  repo's CI.
- The cache key must include the driver version (WDA source ships inside
  `appium-xcuitest-driver`), killing the ADR 01033 stale-cache mode structurally.
- N concurrent runners sharing one cache dir must be safe (fixture jobs and users' matrix builds).
- `install ios` must stay green on incapable hosts, meaning CLT-only, old Xcode, or transient
  xcodebuild failures. That's the ADR 01053 best-effort pattern.
- Existing `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` users must see zero behavior change.

## Considered Options

1. **Managed prebuild in `install ios` (default-on, best-effort) plus read-only session
   auto-consumption.** Build once per (Xcode version × build id × driver version) into
   `<cacheDir>/ios/wda/<key>/`. Publish an atomic `products.json` completeness marker, serialize
   the single writer behind a heartbeat-lease advisory lock, and have sessions set
   `appium:usePrebuiltWDA` plus `appium:derivedDataPath` on a locator hit.
2. **Keep or extend the github-action cache** (`ios: auto`), teaching the action the driver version.
3. **Ship prebuilt WDA binaries as hosted release assets**, issue #515's sketch. A publish
   pipeline attaches per-(driver × Xcode × arch) artifacts, and the action downloads them.

## Decision Outcome

Chosen option: **option 1**. It puts the build where the version knowledge lives, since the
runtime that JIT-installs the driver can key on it exactly. It works for every consumer, whether
CLI users, the action, or any CI, rather than only action users. And it needs no hosted-artifact
maintenance or signing story. Option 3 is recorded as a non-goal in the design doc. Option 2 leaves
the key correctness split across two repos, which is what caused ADR 01033.

Specifics settled here:

- **Prebuild is part of `install ios`, default-on, no flag.** Check-and-skip on build products
  (not devices): a generic `platform=iOS Simulator` destination build, no simulator needed.
- **Best-effort, never a non-zero exit.** Several conditions each degrade to a `skipped` report row
  with guidance. Those are missing full Xcode, an Xcode below the floor (`MIN_XCODE_MAJOR` = 14), a
  failed driver install, and a failed build. The session-time fallback is exactly today's
  build-in-session.
- **Readers are lock-free; the writer is locked.** Readers require the atomically-published
  (temp + rename) `products.json` marker, so a crashed half-build is invisible. Sessions consume
  it through `appium:usePrebuiltWDA`, read-only bar the `last-used` prune stamp. The single writer
  holds a new advisory lock (`src/runtime/lock.ts`): mkdir-as-lock with a **heartbeat lease**.
  Takeover happens only on a stale heartbeat or dead same-host pid, never on lock age. So a
  legitimate ~20-minute xcodebuild is never stolen, while a crashed holder recovers in minutes. The
  writer re-checks the marker after acquiring, which closes the check-then-lock TOCTOU double-build.
- **Keys are additive; pruning is stamp-based.** One subdir per (Xcode × driver) key absorbs mixed
  CI runner images. Siblings are pruned under the lock when they lack a marker, or when their
  reader-touched `last-used` stamp is >30 days old. Dir mtime doesn't track nested reads on APFS.
  `installed.json`'s new `ios` slot is rewritten in the same pass.
- **Env override wins, unchanged.** `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` behaves exactly as
  before and suppresses the managed locator. The locator also gates on a validated driver floor
  (`MIN_PREBUILT_WDA_DRIVER_MAJOR` = 10): older drivers get the plain fallback, never a guess.
- **CI adoption:** the Sunday warmer's macOS leg and the iOS fixture legs run `install ios --yes`.
  The fixture legs set the action's `ios: 'false'`, since its env-var path would override the
  managed products and double-build on cold weeks. Retiring the action-side cache is tracked in
  `doc-detective/github-action`.

### Consequences

- Good: warm-cache iOS runs skip the ~10-minute compile, and the first session cost drops to
  simulator boot plus launch. The stale-cache 30-minute worst case disappears, because the key sees
  the driver version.
- Good: concurrency is safe by construction, through read-only consumers, a single locked writer,
  and marker-gated visibility, rather than by caller discipline.
- Bad: `install ios` is heavier, with a driver download plus a ~10-minute build on a bare macOS
  host. That's accepted and report-visible, and incapable hosts skip cleanly.
- Bad: ~1–2 GB of DerivedData per key in the cache, bounded by stamp-based pruning.
- Neutral: a driver or Xcode bump is a keyed miss. The next `install ios` builds the new key, while
  sessions fall back to in-session builds in the interim, never an error.

### Confirmation

Hermetic unit suites cover three areas. The first is the lock lease semantics
(`test/runtime-lock.test.js`). The second is every installer pipeline branch, including
contend-and-lose and prune (`test/ios-installer.test.js`). The third covers the locator and both
capability builders. Those tests pin env-precedence and read-only consumption shapes
(`test/app-surface.test.js`, `test/mobile-browser.test.js`).
End-to-end, the `apps-ios` and `mobile-web-ios` fixture legs run the real prebuild-then-consume
path. They use the macOS required-PASS gate (`DD_FIXTURES_REQUIRE_PASS`), so an environment
regression cannot hide as all-SKIPPED.

## Pros and Cons of the Options

### Option 1: managed prebuild plus read-only auto-consumption

- Good: single source of truth for the key (the runtime that installs the driver).
- Good: benefits every consumer, not only action users; no hosted artifacts to maintain.
- Good: best-effort degradation preserves today's behavior on every miss path.
- Bad: heavier `install ios`; disk cost per key; new lock primitive to maintain.

### Option 2: extend the github-action cache

- Good: no doc-detective code change.
- Bad: the action cannot see the JIT-resolved driver version without duplicating runtime logic.
  That's the split-brain that produced ADR 01033, and it helps only action users.

### Option 3: hosted prebuilt binaries (issue #515 sketch)

- Good: makes even the *first* run fast for all users.
- Bad: it needs an artifact publish pipeline per (driver × Xcode × arch) combo, with ongoing
  rebuild maintenance and portability or signing risk. It's rejected as a non-goal in the design
  doc, since the keyed local build achieves the win once per cache lifetime.
