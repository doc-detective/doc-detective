# Design: inline warm phase (resolve → warm → run → sweep)

Status: **B1 + B2 + B3 shipped** ([ADR 01060](../../adrs/01060-inline-warm-phase.md),
[ADR 01061](../../adrs/01061-standalone-warm-command-ownership-handoff.md)) — the always-on
inline phase (planner + executor, `src/core/warmPhase.ts`) and the `report.warm` timing block are
live, including `wda-check` (enabled by the ADR 01059 managed WDA prebuild landing first) and
`chromedriver-prefetch` (implemented as a chained throwaway session — the one task that awaits
device readiness, scoped to runs with android mobile-web contexts). The standalone
`doc-detective warm` CLI (**B3**) is live with the manifest ownership handoff
(`src/core/warmManifest.ts`); retiring the fixtures.yml iOS pre-boot step in favor of it is
tracked as a follow-up CI change. This document is the
implementation plan for an always-on provisioning phase that runs between test resolution and test
execution: it concurrently resolves, repairs, and warms everything the run will need — driver
installs, browser installs, device boots, WDA availability, chromedriver prefetch — and only then
runs tests. Produced from the CI wall-clock investigation (2026-07-13); companion plan:
[ios-wda-prebuild.md](ios-wda-prebuild.md).

## Problem

Provisioning costs are paid serially at first use, buried inside per-context execution:

- Native app drivers JIT-install inside `appSurfacePreflight`, invoked per-context in `runContext`
  ([appSurface.ts:922-991](../../src/core/tests/appSurface.ts), [tests.ts:3354](../../src/core/tests.ts)).
- Simulators/emulators boot at first `startSurface`; a boot (1–5+ min) serializes ahead of the
  first test instead of overlapping other setup.
- Chromedriver for mobile-web-android downloads at session time
  ([mobileBrowser.ts:150-172](../../src/core/tests/mobileBrowser.ts)).
- The existing warm-up, `warmUpContexts` ([tests.ts:2514-2640](../../src/core/tests.ts)), probes
  driver/browser combinations — but only when `concurrentRunners > 1`
  ([tests.ts:1848](../../src/core/tests.ts)), and it doesn't touch devices or mobile toolchains.
- CI hand-rolls what this phase should own: the iOS simulator pre-boot step in
  [fixtures.yml:148-181](../../.github/workflows/fixtures.yml) duplicates iosSimulator.ts's
  newest-device selection logic and carries an explicit must-track-the-product hazard comment
  ([docs/maintenance/ci-ios-preboot.md](../maintenance/ci-ios-preboot.md)).

The insight: warm-phase parallelism is **independent of runner concurrency**. Even a fully serial
test run benefits, because boot ∥ npm install ∥ browser download overlap *each other* during warm.

## Decisions (settled, 2026-07-13)

1. **Always-on, inline, no flag.** The phase derives strictly from resolved needs, so a pure-web
   run warms only what it already JIT-installs today — baseline latency is unchanged by
   construction.
2. **Warm is an accelerator, never a new failure mode.** Every warm task is best-effort: a failure
   logs a warning and the run proceeds; the per-context paths retry/fail with exactly today's
   semantics. (Warm *pre-pays* work; it never *gates* work.)
3. **Teardown reuses the ownership ledger.** Anything warm boots is recorded in the same run
   registries with `bootedByUs: true`, so the existing run-end sweep tears it down whether or not
   any test used it. No new lifecycle concept for the inline phase.

## Where it lives

`runSpecs` already has the exact seams:

- After Phase 1, `sizingJobs` ([tests.ts:1597](../../src/core/tests.ts)) enumerates **every**
  context/surface the run needs — the first point the full provisioning set is known.
- Registries (`deviceRegistry`, `simulatorRegistry`, `processRegistry`) and the appium pool are
  created at [tests.ts:1695-1778](../../src/core/tests.ts); `warmUpContexts` runs at `:1848`.
- The warm phase replaces/generalizes the `:1848` call: **always** run (drop the `limit > 1`
  gate), over a broader task set, executed concurrently.
- Run-end teardown is already centralized in the `finally` block
  ([tests.ts:2008-2057](../../src/core/tests.ts)): `teardownDeviceRegistry`,
  `teardownSimulatorRegistry`, appium/Xvfb/process sweeps. Warm-booted devices land in those
  registries and are swept for free — including the warmed-but-unused case, because ownership is
  established at provision time, not first use.

The `runTests`-level JIT block ([core/index.ts:96-241](../../src/core/index.ts) —
`inferRuntimeNeeds` → `ensureRuntimeInstalled`/`ensureBrowserInstalled`) stays where it is; it is
effectively warm step zero and already runs before `runSpecs`.

## Phase B1 — warm planner + executor

**Planner (pure).** `planWarmTasks(sizingJobs, runnerDetails, config) → WarmTask[]`, a pure
derivation unit-testable without drivers. Task kinds, deduplicated across jobs:

| kind | derived from | pre-pays |
|---|---|---|
| `driver-install` | app/mobile contexts per platform | `ensureRuntimeInstalled([driverPackage])` — the body of `appSurfacePreflight`'s install half |
| `browser-install` | browser contexts | `ensureContextBrowserInstalled` (already memoized via `installAttempts`, [tests.ts:5036-5101](../../src/core/tests.ts)) |
| `device-boot` | ios/android contexts + explicit `device` descriptors, normalized via the same `normalizeDeviceDescriptor` path `runContext` uses ([tests.ts:3567](../../src/core/tests.ts)) | `acquireSimulator` / `acquireDevice` into the run registries |
| `wda-check` | ios contexts | managed-products locator from [ios-wda-prebuild.md](ios-wda-prebuild.md) Phase 3 (memoized probe; never builds — building stays with `install ios`) |
| `chromedriver-prefetch` | mobile-web-android contexts | the autodownload the first session pays today |
| `session-probe` | what `selectWarmUpTargets` picks today ([tests.ts:2460](../../src/core/tests.ts)) | folded-in existing `warmUpContexts` probes — **kept `limit > 1`-gated**: a throwaway probe session is only worth paying when it prevents concurrent first-session races |

**Device selection is not the planner's job.** `planWarmTasks` normalizes descriptors exactly as
`runContext` would and hands them to `acquireSimulator`/`acquireDevice`; the selection heuristics
(newest-iPhone plan, default AVD) stay solely in
[iosSimulator.ts](../../src/core/tests/iosSimulator.ts) /
[androidEmulator.ts](../../src/core/tests/androidEmulator.ts) — the single source of truth whose
duplication in the fixtures.yml pre-boot step is precisely the hazard this phase exists to retire.
Deduplication is the registries' existing behavior: entries are keyed by device name, so N
contexts needing the same device produce one boot and N `ready` awaiters, and warm's acquire and a
context's later acquire meet on the same entry.

**Executor.** Run tasks through the existing primitives — `runResourceAware` with the run's
`ResourceRegistry` ([utils.ts:121-212](../../src/core/utils.ts)) and the same exclusivity tags
jobs use (`jobDisplayResources`, [tests.ts:466-568](../../src/core/tests.ts)): device boots for the
same device serialize, `native-app-driver`-bound tasks respect ADR 01038, independent tasks
overlap. **Cache-mutating tasks get a dedicated `runtime-install` exclusivity tag** —
`driver-install`, `browser-install`, and `chromedriver-prefetch` all write the shared runtime/app
cache, which is exactly why today's `warmUpContexts` runs its combinations serially
([tests.ts:2505-2512](../../src/core/tests.ts)) and why the npm-prune hazard exists
([src/runtime/AGENTS.md](../../src/runtime/AGENTS.md)); they serialize among themselves while
overlapping device boots. Warm concurrency limit: a small constant (e.g. 4) independent of
`concurrentRunners`, since tasks are I/O-heavy, not display-heavy. The two constraints compose:
the pool is the **outer ceiling**, and tag exclusivity further serializes within it (two tasks
sharing a tag queue even when fewer than 4 tasks are running — the pool never bypasses the
registry).

**Failure semantics.** Each task resolves to `{name, kind, outcome: warmed|skipped|failed,
durationMs, note?}`. `failed` → `logger warn` + proceed. Memo-map effects follow
`warmUpContexts`' existing **mirror contract** ([tests.ts:2510-2512](../../src/core/tests.ts)):
warm leaves `installAttempts`/`warmUpResults` in *exactly the state a serial first-consuming
context would have produced* — no more, no less. Concretely: install tasks record their outcome in
`installAttempts` just as the first context's on-demand install would (so N contexts don't retry
a failed install in parallel — that recorded-once semantics is today's behavior, not a new
suppression), and the folded-in `session-probe` keeps its existing recorded-skip semantics
([tests.ts:2621, 3753](../../src/core/tests.ts) — a combination that can't start a driver is
skipped by later contexts; that's the established fast-fail, which would have happened per-context
anyway, just slower). The **"never gates"** contract is therefore precise: the *new* task kinds
(`device-boot`, `wda-check`, `chromedriver-prefetch`) record nothing any gate reads — their
failures are warm-report entries only — and warm introduces **no gating that doesn't already
exist** for installs/probes. Keeping `session-probe` behind `limit > 1` also preserves the
documented byte-identical serial-run behavior ([tests.ts:1845-1847](../../src/core/tests.ts)).

**Device-boot ownership detail.** `acquireSimulator`/`acquireDevice` already return registry
entries with correct `bootedByUs` (`reuse-booted` → `false`, boot/create → `true`,
[iosSimulator.ts:438-521](../../src/core/tests/iosSimulator.ts),
[androidEmulator.ts:313-428](../../src/core/tests/androidEmulator.ts)) and an in-flight `ready`
promise — warm kicks off the boot and does **not** await readiness; the first consuming context
awaits `ready` as it does now. Warm's job is to start the clock early, not to block on it.

TDD sequence (each red→green): planner derivation per task kind (including dedup and the empty
web-only plan) → executor failure-isolation (one failed task, run proceeds) → ownership test
(warm-booted, unused device is swept — assert via injected shutdown effect) → memo-sharing test
(warm install attempt visible to `ensureContextBrowserInstalled`) → integration: `runSpecs` on a
spec mix asserts warm ran before Phase 2 and the report carries warm results.

## Phase B2 — report timing

Attach `report.warm = { durationMs, tasks: [...] }` alongside the skeleton built at
[tests.ts:1394-1424](../../src/core/tests.ts). This is the first structured provisioning-timing
surface — it also serves the broader "per-phase timing" telemetry goal from the CI investigation,
and it's how CI legs verify the phase is actually overlapping (fixture-output artifacts include
it).

Schema note: `report_v3` gains an optional `warm` block — schema-first in
`src/common/src/schemas/src_schemas/`, positive+negative validation tests, `npm run build:common`,
per the CLAUDE.md schema workflow.

## Phase B3 (shipped — ADR 01061) — standalone `doc-detective warm` + ownership handoff

Sketch only; own ADR when picked up. `doc-detective warm --input <specs>` runs resolve + B1's
planner/executor and **exits with devices left up**, writing an ownership handoff manifest
(`<cacheDir>/warm-manifest.json`: UDIDs, AVD names, PIDs, timestamp). The next `runTests`
atomically claims it — rename to `warm-manifest.claimed-<runId>.json` **in the same directory**,
so exactly one of N concurrent runners adopts *and* the claimed state stays durable and
discoverable (a rename-to-nowhere would leave a crash window: adopter dies post-claim,
pre-adoption, and the devices are up with no record). The adopter merges the resources into its
registries as `bootedByUs: true`, deletes the claimed file only after its run-end sweep, and
cleanup (`--down`, or the next warm/run) scans for `claimed-*` files whose owning run is dead and
sweeps their resources. Staleness guard: any manifest older than TTL or with dead PIDs/UDIDs is
cleaned, not adopted.
`doc-detective warm --down` for manual teardown. This is what finally deletes the
[fixtures.yml](../../.github/workflows/fixtures.yml) pre-boot step and its device-selection
coupling. Hosted-runner VM disposal remains the backstop; the manifest matters most on self-hosted
runners and dev machines.

## Companions (repo policy)

- **ADR** (one, with the B1+B2 PR): the always-on warm phase, its best-effort/never-gates
  semantics, and the provision-time ownership rule. Number picked at merge time per the collision
  rule.
- **Fixtures:** PASS/SKIPPED semantics of every existing fixture are unchanged (warm never fails a
  run) — the existing matrix is the regression net. The observable new surface is `report.warm`,
  asserted via a focused `it(...)` in [test/core-core.test.js](../../test/core-core.test.js) per
  the precise-assertion rule; no new fixture files.
- **Docs impact: yes, modest.** The run-lifecycle/report reference gains the `warm` block; CI
  guidance (persona Priya) gains "what warm pre-pays and how to read its timings". Land with the
  code.

## Interplay and sequencing

- **After** [ios-wda-prebuild.md](ios-wda-prebuild.md) Phases 1–3 land: warm's `wda-check` task
  consumes that locator. (B1 can land first with `wda-check` absent — the plans are independent
  except for that one task.)
- The Android image question from the same investigation was settled as **keep `google_apis`** —
  now recorded as its own decision in
  [ADR 01057](../../adrs/01057-keep-google-apis-emulator-images.md) (device Chrome required for
  mobile-web; ATD images strip preinstalled apps).

## Non-goals

- A `warm: false` config key — deliberately omitted (decision 1); additive later if a real need
  appears.
- Warming across runs / a device-pool daemon — B3's manifest is the bounded version of this;
  anything longer-lived is out of scope.
- Blocking the run on warm completion — warm starts work; consumers await readiness exactly where
  they do today.
