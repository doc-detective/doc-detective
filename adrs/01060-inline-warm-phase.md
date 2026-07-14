---
status: accepted
date: 2026-07-14
decision-makers: [hawkeyexl]
---

# Inline always-on warm phase in `runSpecs`

## Context and Problem Statement

Provisioning costs were paid serially at first use, buried inside per-context execution: native app
drivers JIT-install inside `appSurfacePreflight` (per context), simulators/emulators boot at first
`startSurface` (1–5+ minutes serialized ahead of the first test), the android mobile-web
chromedriver downloads at session time, and the existing `warmUpContexts` pre-pass ran only when
`concurrentRunners > 1` and touched neither devices nor mobile toolchains. CI hand-rolled what the
runner should own (the fixtures.yml iOS pre-boot step duplicating iosSimulator.ts's selection
logic). The key insight from the CI wall-clock investigation (2026-07-13): warm-phase parallelism
is independent of runner concurrency — even a fully serial test run benefits, because boot ∥ npm
install ∥ browser download overlap *each other* during warm.

The full implementation plan this ADR records the decisions of is
[docs/design/warm-phase.md](../docs/design/warm-phase.md) (phases B1 + B2).

## Decision Drivers

- Provisioning should overlap, not serialize ahead of the first test — for every run shape,
  including `concurrentRunners: 1`.
- Warm must be an accelerator, never a new failure mode: a pure-web run's baseline latency and a
  serial run's memoization semantics must be unchanged by construction.
- No new lifecycle concepts: teardown must reuse the existing launch-ownership ledger and run-end
  sweeps.
- The npm-prune hazard (issue #501) forbids concurrent installs into the shared runtime cache.
- Structured provisioning timing (the CI investigation's telemetry goal) needs a home in the report.

## Considered Options

1. **Always-on inline warm phase in `runSpecs`** — a pure planner derives tasks from the resolved
   sizing jobs; a resource-aware executor overlaps them between resolution and Phase 2 dispatch;
   results land in `report.warm`.
2. **Extend the existing `limit > 1` pre-pass** — add device/toolchain work to `warmUpContexts`,
   keeping the concurrency gate.
3. **Standalone `doc-detective warm` CLI only** — provision in a separate CI step overlapping the
   build, leave `runSpecs` untouched.

## Decision Outcome

Chosen option: **option 1**, because the phase derives strictly from resolved needs (a run warms
only what it already JIT-provisions today, so baseline latency is unchanged by construction),
serial runs benefit too (option 2 helps only concurrent runs), and it requires no workflow change
from users (option 3 — the design doc's phase B3 — remains deferred and complementary, not
competing).

Specifics settled here:

- **Always-on, inline, no flag.** `planWarmTasks` (pure, `src/core/warmPhase.ts`) derives the task
  set from `sizingJobs` (flat + routed contexts); `executeWarmTasks` runs it before Phase 2
  dispatch under the run's resource registry, bounded by a small fixed pool (4) independent of
  `concurrentRunners`. A run with nothing to warm reports `warm: { durationMs: 0, tasks: [] }`
  without executing anything.
- **Best-effort, never gates.** Every task resolves `warmed | skipped | failed`; `failed` logs a
  warning and the run proceeds — the per-context paths retry or skip with exactly their existing
  semantics. The new task kinds (`device-boot`, `wda-check`, `chromedriver-prefetch`) record
  nothing any gate reads; the install/probe kinds follow the established mirror contract:
  `warmBrowserInstall` (the install + first-attempt re-detect half of `warmUpContexts`, extracted
  and shared) leaves `installAttempts` / `runnerDetails.availableApps` exactly as the first
  same-browser consuming context would have serially.
- **Exclusivity via the run's one resource registry.** Every npm-cache-mutating task
  (`driver-install`, `browser-install`, `session-probe`, `chromedriver-prefetch`) serializes on a
  shared `runtime-install` tag — the npm-prune hazard structurally cannot recur — while device
  boots serialize per device (plus the shared `android-emulator` bound) and everything else
  overlaps. Tags never span phases: warm is awaited and `runResourceAware` releases in a
  `finally`, so Phase 2 starts with an empty registry (extends ADR 01038's tag vocabulary).
- **Ownership at provision time.** Device boots acquire into the existing run registries; the
  placeholder carries `bootedByUs: true` and the in-flight `ready` promise, so the existing
  run-end sweeps reclaim a warm-booted device **whether or not any test used it**. Boot tasks
  resolve at boot *initiation* (`raceBootInitiation`, with the failure path routed to a warning,
  never an unhandled rejection); consumers await `ready` exactly where they do today.
- **The session probe keeps its gate.** The folded-in `warmUpContexts` probe still runs only at
  `limit > 1` with a browser Appium pool — a throwaway driver session is only worth paying when it
  prevents concurrent first-session races — preserving the documented byte-identical serial-run
  behavior. The outer `limit > 1` gate on the *phase* is gone.
- **`chromedriver-prefetch` awaits readiness (the one exception).** On-device chromedriver is only
  downloadable through a live UiAutomator2 session, so the task chains idempotent steps
  (preflight → acquire → throwaway session on a dedicated short-lived server) instead of an
  executor dependency graph. Trade-off, stated plainly: the warm barrier now waits for a device
  boot plus one throwaway session — but **only** for runs containing android mobile-web contexts,
  which would pay exactly that cost at their first mobile context anyway; warm overlaps it with
  the other tasks. Because the phase is awaited before Phase 2, the throwaway session can never
  overlap the first real session on the device.
- **Warm never lazy-installs the android toolchain.** The light env probe skips instead — the loud
  multi-GB lazy install (and its report-visible warning) stays with the consuming context.
- **`wda-check` probes, never builds.** It consults the managed WDA locator (ADR 01059) for
  visibility and to pre-pay the memoized Xcode probe; building stays with `install ios`.
- **Report timing (B2).** `report.warm = { durationMs, tasks[] }` is the first structured
  provisioning-timing surface, added schema-first to `report_v3` as an optional `readOnly` block;
  the emitted report remains runtime-unvalidated (the `recordingSerialized` precedent).

### Consequences

- Good: provisioning overlaps itself and no longer serializes ahead of the first test; serial runs
  benefit; CI legs can read `report.warm` from fixture artifacts to verify the overlap.
- Good: warm-booted devices are swept for free (ownership at provision time), including the
  warmed-but-unused case.
- Bad: runs with android mobile-web contexts block on boot + one throwaway session before Phase 2
  (cost moved earlier, overlapped, and scoped to runs that already pay it).
- Bad: at `concurrentRunners: 1`, install log lines now appear during warm rather than inside the
  first consuming context — the memo end-state is identical.
- Neutral: `doc-detective warm` (standalone CLI + cross-run ownership handoff, design phase B3)
  stays deferred; the fixtures.yml iOS pre-boot step is only fully retired by B3.

### Confirmation

Hermetic unit suites: planner derivation per kind incl. dedup, host gating, and purity
(`test/warm-phase-plan.test.js` — real predicates via `buildWarmPlanDeps`), executor failure
isolation / tag exclusivity / pool ceiling (`test/warm-phase-executor.test.js`), boot-initiation +
unhandled-rejection guard + ownership sweep (`test/warm-phase-device-boot.test.js`), the
warmBrowserInstall mirror contract (`test/warm-phase-memo.test.js`), and the prefetch chain +
teardown-in-finally (`test/warm-phase-prefetch.test.js`). Integration: `test/core-core.test.js`
asserts `report.warm` on the browser smoke (browser-install/session-probe present) and the exact
empty block on a shell-only run. The existing fixture matrix is the regression net — warm never
fails a run, so every fixture's PASS/SKIPPED is unchanged.

## Pros and Cons of the Options

### Option 1 — always-on inline warm phase

- Good: benefits every run shape; derives from resolved needs so no-op by construction when
  there's nothing to warm; ownership and teardown reuse existing machinery.
- Good: one place (the planner) knows the full provisioning set the moment it's knowable.
- Bad: a new module + task vocabulary to maintain; the prefetch's await-readiness exception needs
  its trade-off documented (above).

### Option 2 — extend the `limit > 1` pre-pass

- Good: smallest diff.
- Bad: serial runs — the common local case — keep paying serialized provisioning; the pre-pass's
  serial loop would either stay serial (no overlap win) or need exactly the executor this option
  avoids building.

### Option 3 — standalone `doc-detective warm` only

- Good: overlaps provisioning with CI build steps (the biggest possible win in CI).
- Bad: requires every user to restructure their pipeline to benefit; needs a cross-run ownership
  handoff (manifest, staleness, adoption) before it's safe — deferred as design phase B3, to build
  on this phase's planner/executor.
