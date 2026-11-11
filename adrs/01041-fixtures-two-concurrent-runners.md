---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Run feature-fixture CI at `concurrentRunners: 2`

## Context and Problem Statement

The per-feature Doc Detective fixture jobs (`fixtures.yml`, one job per `group × OS`) all load the lean
[`test/core-artifacts/config.groups.json`](../test/core-artifacts/config.groups.json). That config did not
set `concurrentRunners`. So every fixture group ran its specs **serially**, at the schema default of
`concurrentRunners: 1`. The cross-platform mocha suite (`test/core-core.test.js`) has run at
`concurrentRunners: 2` since [ADR 01001](01001-resource-aware-concurrency-scheduler.md). But the fixture
legs never ran under parallel runners. They exercise the real runner end-to-end across navigation,
interactions, capture, recording, routing, http, process, sessions, and the native app and mobile-web
surfaces.

Two problems follow:

1. **Blind spot for concurrency defects.** Some bugs only appear when two runners execute specs in the same
   process. That covers shared display and driver contention, session bleed, port and resource races, and
   scheduler edge cases. All of them are invisible to a serial fixture grid. Several historical flakes trace
   to shared-resource contention, so the fixtures should routinely exercise the `> 1` path.
2. **Wall-clock.** Groups containing several independent specs pay full serial latency per OS job.

## Decision Drivers

* Exercise the resource-aware concurrency scheduler end-to-end in CI, per
  [ADR 01001](01001-resource-aware-concurrency-scheduler.md). Then concurrency-only defects surface as
  fixture failures, instead of escaping to users.
* No schema change: `concurrentRunners` is already a `config_v3` field (`type: [integer, boolean]`,
  default `1`, min `1`).
* Keep recordings safe. The scheduler already serializes shared-display recordings and driver contexts on
  the `"display"` mutex, so `2` does not make concurrent recordings unsafe.
* Single lever covering every fixture leg (Action-driven and `npx doc-detective runTests`-driven), since all
  of them load the same `config.groups.json`.

## Considered Options

* **A. Set `concurrentRunners: 2` in `config.groups.json`** (chosen).
* **B. Leave fixtures at `1`; rely on the mocha suite alone for concurrency coverage.**
* **C. Set `concurrentRunners: true`** (CPU-core count, capped at 4).

## Pros and Cons of the Options

### A. Set `concurrentRunners: 2` in `config.groups.json`

* Good: it's the smallest change. One lever covers every fixture leg, Action-driven and
  `runTests`-driven, and every OS, with no per-job edit.
* Good: it's deterministic, a fixed `2` rather than runner-CPU-dependent, so coverage is reproducible
  across OSes.
* Good: it surfaces latent concurrency-only defects as fixture FAILUREs, instead of letting them escape to
  users. That's the intended signal.
* Neutral: `2` is enough to shake out shared-resource contention without maximizing throughput.

### B. Leave fixtures at `1`; rely on the mocha suite alone for concurrency coverage

* Good: zero risk, and no change.
* Bad: it leaves a blind spot. Concurrency defects that only appear in real end-to-end fixture runs stay
  invisible until a user hits them. Those include shared display and driver contention, and session bleed.

### C. Set `concurrentRunners: true` (CPU-core count, capped at 4)

* Good: it maximizes throughput on wider runners.
* Bad: the degree of parallelism varies by runner CPU count, so coverage is non-deterministic and
  uneven across OSes.
* Bad: it widens the concurrency surface more than needed for a first step. `2` already exercises the
  `> 1` path.

## Decision Outcome

Chosen option: **A**. It is the smallest change that makes every fixture group exercise the `> 1` scheduler
path uniformly across the matrix. It needs no schema change, and stays deterministic, at a fixed `2` rather
than runner-dependent. **B** keeps the blind spot. **C** makes the degree of parallelism vary by runner
CPU count. That trades reproducibility for marginal speed, and widens the surface unevenly across OSes. It
isn't worth it for a first step, and `2` is enough to shake out shared-resource contention.

Mechanism: add `"concurrentRunners": 2` to `test/core-artifacts/config.groups.json`. Every `fixtures.yml`
leg picks it up with no per-job change. That covers the `doc-detective/github-action` jobs, which pass
`config: test/core-artifacts/config.groups.json`, and the
`npx doc-detective runTests --config test/core-artifacts/config.groups.json ...` jobs.

## Consequences

* **Good.** Fixture groups now run up to 2 specs concurrently, routinely exercising `runResourceAware` and
  the `"display"`-mutex serialization on real end-to-end runs across every OS. Concurrency-only defects now
  fail a fixture job instead of shipping.
* **Good.** Multi-spec groups get a wall-clock reduction per OS job.
* **Trade-off and call-out.** A genuine concurrency incompatibility will now surface as a fixture FAILURE,
  rather than passing serially. Say two app or driver sessions contending for a single emulator or
  simulator. That is the intended signal. Such a failure is a bug to fix, not a reason to revert to `1`. The
  before and after total Test-workflow wall-clock is recorded on the introducing PR, so the parallelism
  cost and benefit are visible.
* **Neutral.** Recordings remain serialized on the shared display, and `2` does not change recording safety.

## Confirmation

* The full `Test` workflow runs on the introducing PR and must be **all-green**. That's the matrix plus all
  `fixtures.yml` group×OS jobs. Every fixture group resolves PASS or SKIPPED under 2 runners, on Windows,
  macOS, and Linux.
* Total Test-workflow wall-clock is captured before (at `concurrentRunners: 1`) and after (at `2`) and
  reported on the PR.
* The existing concurrency unit tests (`test/concurrency.test.js`, `test/ffmpeg-recorder.test.js`) continue
  to guard the scheduler's mutual-exclusion and over-approximation invariants unchanged.
