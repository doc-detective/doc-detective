---
status: accepted
date: 2026-07-14
decision-makers: [hawkeyexl]
---

# Inline always-on warm phase in `runSpecs`

## Context and Problem Statement

Provisioning costs were paid serially at first use, buried inside per-context execution. Native app
drivers JIT-install inside `appSurfacePreflight`, per context. Simulators and emulators boot at the
first `startSurface`, taking 1–5+ minutes serialized ahead of the first test. The android mobile-web
chromedriver downloads at session time. And the existing `warmUpContexts` pre-pass ran only when
`concurrentRunners > 1`, touching neither devices nor mobile toolchains. CI hand-rolled what the
runner should own, with the fixtures.yml iOS pre-boot step duplicating iosSimulator.ts's selection
logic. The CI wall-clock investigation of 2026-07-13 found the key insight. Warm-phase parallelism
is independent of runner concurrency. Even a fully serial test run benefits, because boot, npm
install, and browser download overlap *each other* during warm.

The full implementation plan this ADR records the decisions of is
[docs/design/warm-phase.md](../docs/design/warm-phase.md) (phases B1 + B2).

## Decision Drivers

- Provisioning should overlap, rather than serialize ahead of the first test. That holds for every
  run shape, including `concurrentRunners: 1`.
- Warm must be an accelerator, never a new failure mode. A pure-web run's baseline latency, and a
  serial run's memoization semantics, must be unchanged by construction.
- No new lifecycle concepts: teardown must reuse the existing launch-ownership ledger and run-end
  sweeps.
- The npm-prune hazard (issue #501) forbids concurrent installs into the shared runtime cache.
- Structured provisioning timing (the CI investigation's telemetry goal) needs a home in the report.

## Considered Options

1. **An always-on inline warm phase in `runSpecs`.** A pure planner derives tasks from the resolved
   sizing jobs. A resource-aware executor overlaps them between resolution and Phase 2 dispatch.
   Results land in `report.warm`.
2. **Extend the existing `limit > 1` pre-pass.** Add device and toolchain work to `warmUpContexts`,
   keeping the concurrency gate.
3. **A standalone `doc-detective warm` CLI only.** Provision in a separate CI step overlapping the
   build, and leave `runSpecs` untouched.

## Decision Outcome

Chosen option: **option 1**. The phase derives strictly from resolved needs. A run warms only what
it already JIT-provisions today, so baseline latency is unchanged by construction. Serial runs
benefit too, where option 2 helps only concurrent runs. And it requires no workflow change from
users. Option 3, the design doc's phase B3, remains deferred and complementary, rather than
competing.

Specifics settled here:

- **Always-on, inline, with no flag.** `planWarmTasks` is pure, in `src/core/warmPhase.ts`. It
  derives the task set from `sizingJobs`, covering flat and routed contexts. `executeWarmTasks` runs
  it before Phase 2 dispatch, under the run's resource registry. It's bounded by a small fixed pool
  of 4, independent of `concurrentRunners`. A run with nothing to warm reports
  `warm: { durationMs: 0, tasks: [] }` without executing anything.
- **Best-effort, and never a gate.** Every task resolves `warmed`, `skipped`, or `failed`. A
  `failed` logs a warning and the run proceeds. The per-context paths retry or skip with exactly
  their existing semantics. The new task kinds record nothing any gate reads. Those are
  `device-boot`, `wda-check`, and `chromedriver-prefetch`. The install and probe kinds follow the
  established mirror contract. `warmBrowserInstall` is the install and first-attempt re-detect half
  of `warmUpContexts`, extracted and shared. It leaves `installAttempts` and
  `runnerDetails.availableApps` exactly as the first same-browser consuming context would have
  serially.
- **Exclusivity comes from the run's one resource registry.** Every npm-cache-mutating task
  serializes on a shared `runtime-install` tag, so the npm-prune hazard structurally cannot recur.
  Those tasks are `driver-install`, `browser-install`, `session-probe`, and
  `chromedriver-prefetch`. Device boots serialize per device, plus the shared `android-emulator`
  bound, and everything else overlaps. Tags never span phases. Warm is awaited, and
  `runResourceAware` releases in a `finally`, so Phase 2 starts with an empty registry. This extends
  ADR 01038's tag vocabulary.
- **Ownership at provision time.** Device boots acquire into the existing run registries. The
  placeholder carries `bootedByUs: true` and the in-flight `ready` promise. So the existing run-end
  sweeps reclaim a warm-booted device **whether or not any test used it**. Boot tasks resolve at
  boot *initiation*, through `raceBootInitiation`, with the failure path routed to a warning rather
  than an unhandled rejection. Consumers await `ready` exactly where they do today. A boot can now
  still be in flight at run end. So the teardown sweeps await an owned entry's `ready` before
  shutting it down. A mid-boot placeholder has no process or udid to kill yet, and sweeping it blind
  would orphan the device.
- **Warm plans only what the run's own gates would provision.** The planner applies the per-context
  `requires` capability gate, and an unmet gate provisions nothing, exactly like runContext. The
  mobile driver-install bodies re-check the host-capability probes before installing. Those cover
  the android SDK and acceleration, and the iOS toolchain. So warm never installs a driver the
  per-context preflight would have refused to install. Desktop driver installs don't re-run the
  macOS TCC probe, since an inconclusive probe never blocks installs in the preflight either. The
  worst case is a one-time cached install on a host whose contexts later skip.
- **The session probe keeps its gate.** The folded-in `warmUpContexts` probe still runs only at
  `limit > 1` with a browser Appium pool. A throwaway driver session is only worth paying when it
  prevents concurrent first-session races. That preserves the documented byte-identical serial-run
  behavior. The outer `limit > 1` gate on the *phase* is gone.
- **`chromedriver-prefetch` awaits readiness, the one exception.** On-device chromedriver is only
  downloadable through a live UiAutomator2 session. So the task chains idempotent steps, rather than
  building an executor dependency graph. Those steps are preflight → acquire → a throwaway session
  on a dedicated short-lived server. The trade-off, stated plainly: the warm barrier now waits for a
  device boot plus one throwaway session. But that's **only** for runs containing android
  mobile-web contexts. Those would pay exactly that cost at their first mobile context anyway, and
  warm overlaps it with the other tasks. The task holds only its device tag. Its cache-mutating
  half, the android preflight, runs once per run under a manually-acquired `runtime-install` lease
  inside the body. So the minutes-long device-ready await never blocks the install tasks queued on
  that mutex. The phase is awaited before Phase 2, so the throwaway session can never overlap the
  first real session on the device.
- **Warm never lazy-installs the android toolchain.** The light env probe skips instead. The loud
  multi-GB lazy install, and its report-visible warning, stay with the consuming context.
- **`wda-check` probes, never builds.** It consults the managed WDA locator (ADR 01059) for
  visibility and to pre-pay the memoized Xcode probe; building stays with `install ios`.
- **Report timing (B2).** `report.warm = { durationMs, tasks[] }` is the first structured
  provisioning-timing surface, added schema-first to `report_v3` as an optional `readOnly` block;
  the emitted report remains runtime-unvalidated (the `recordingSerialized` precedent).

### Consequences

- Good: provisioning overlaps itself, and no longer serializes ahead of the first test. Serial runs
  benefit. CI legs can read `report.warm` from fixture artifacts to verify the overlap.
- Good: warm-booted devices are swept for free (ownership at provision time), including the
  warmed-but-unused case.
- Bad: runs with android mobile-web contexts block on a boot plus one throwaway session before
  Phase 2. That cost is moved earlier, overlapped, and scoped to runs that already pay it.
- Bad: at `concurrentRunners: 1`, install log lines now appear during warm, rather than inside the
  first consuming context. The memo end-state is identical. But two serial-run edges shift to match
  today's concurrent-run behavior. A failed install's skip description uses the generic memo-hit
  wording, rather than the first-consumer "on-demand install failed" wording. And a browserless
  context ordered before a pinned-browser context can now resolve the warm-installed engine as its
  default. It runs where it previously skipped.
- Neutral: warm boots at most **one device per mobile platform**, the first. The android boot holds
  a manual `android-emulator` lease. It spans initiation to boot settle. Release happens in the
  background, past the task's resolution. The one-emulator-at-a-time bound therefore holds across
  warm and Phase 2 alike. Additional devices boot inside their consuming contexts as before. One CI
  run of this branch proved a hazard. Overlapping emulator boots starve a small KVM runner. Four
  concurrent boots timed out the sessions the tests needed.
- Neutral: `doc-detective warm` (standalone CLI + cross-run ownership handoff, design phase B3)
  stays deferred; the fixtures.yml iOS pre-boot step is only fully retired by B3.

### Confirmation

Hermetic unit suites cover several areas. `test/warm-phase-plan.test.js` covers planner derivation
per kind, including dedup, host gating, and purity, with real predicates through
`buildWarmPlanDeps`. `test/warm-phase-executor.test.js` covers executor failure isolation, tag
exclusivity, and the pool ceiling. `test/warm-phase-device-boot.test.js` covers boot initiation, the
unhandled-rejection guard, and the ownership sweep. `test/warm-phase-memo.test.js` covers the
warmBrowserInstall mirror contract. And `test/warm-phase-prefetch.test.js` covers the prefetch chain
and teardown-in-finally. For integration, `test/core-core.test.js` asserts `report.warm` on the
browser smoke, where browser-install and session-probe are present, and the exact empty block on a
shell-only run. The existing fixture matrix is the regression net. Warm never fails a run, so every
fixture's PASS or SKIPPED is unchanged.

## Pros and Cons of the Options

### Option 1: always-on inline warm phase

- Good: it benefits every run shape. It derives from resolved needs, so it's a no-op by construction
  when there's nothing to warm. Ownership and teardown reuse existing machinery.
- Good: one place (the planner) knows the full provisioning set the moment it's knowable.
- Bad: a new module + task vocabulary to maintain; the prefetch's await-readiness exception needs
  its trade-off documented (above).

### Option 2: extend the `limit > 1` pre-pass

- Good: smallest diff.
- Bad: serial runs, the common local case, keep paying serialized provisioning. The pre-pass's
  serial loop would either stay serial, with no overlap win, or need exactly the executor this
  option avoids building.

### Option 3: standalone `doc-detective warm` only

- Good: overlaps provisioning with CI build steps (the biggest possible win in CI).
- Bad: it requires every user to restructure their pipeline to benefit. It also needs a cross-run
  ownership handoff, covering manifest, staleness, and adoption, before it's safe. That's deferred
  as design phase B3, to build on this phase's planner and executor.
