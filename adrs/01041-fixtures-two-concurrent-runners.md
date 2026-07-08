---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Run feature-fixture CI at `concurrentRunners: 2`

## Context and Problem Statement

The per-feature Doc Detective fixture jobs (`fixtures.yml`, one job per `group × OS`) all load the lean
[`test/core-artifacts/config.groups.json`](../test/core-artifacts/config.groups.json), which did not set
`concurrentRunners`, so every fixture group ran its specs **serially** (`concurrentRunners: 1`, the schema
default). The cross-platform mocha suite (`test/core-core.test.js`) has run at `concurrentRunners: 2` since
[ADR 01001](01001-resource-aware-concurrency-scheduler.md), but the fixture legs — which exercise the real
runner end-to-end across navigation, interactions, capture, recording, routing, http, process, sessions, and
the native app / mobile-web surfaces — never ran under parallel runners.

Two problems follow:

1. **Blind spot for concurrency defects.** Bugs that only manifest when two runners execute specs in the same
   process (shared display/driver contention, session bleed, port/resource races, scheduler edge cases) are
   invisible to a serial fixture grid. Several historical flakes trace to shared-resource contention, so the
   fixtures should routinely exercise the `> 1` path.
2. **Wall-clock.** Groups containing several independent specs pay full serial latency per OS job.

## Decision Drivers

* Exercise the resource-aware concurrency scheduler ([ADR 01001](01001-resource-aware-concurrency-scheduler.md))
  end-to-end in CI, so concurrency-only defects surface as fixture failures instead of escaping to users.
* No schema change: `concurrentRunners` is already a `config_v3` field (`type: [integer, boolean]`,
  default `1`, min `1`).
* Keep recordings safe — the scheduler already serializes shared-display recordings/driver contexts on the
  `"display"` mutex, so `2` does not make concurrent recordings unsafe.
* Single lever covering every fixture leg (Action-driven and `npx doc-detective runTests`-driven), since all
  of them load the same `config.groups.json`.

## Considered Options

* **A. Set `concurrentRunners: 2` in `config.groups.json`** (chosen).
* **B. Leave fixtures at `1`; rely on the mocha suite alone for concurrency coverage.**
* **C. Set `concurrentRunners: true`** (CPU-core count, capped at 4).

## Pros and Cons of the Options

### A. Set `concurrentRunners: 2` in `config.groups.json`

* Good — smallest change; one lever covers every fixture leg (Action-driven and
  `runTests`-driven) and every OS with no per-job edit.
* Good — deterministic (a fixed `2`, not runner-CPU-dependent), so coverage is reproducible across OSes.
* Good — surfaces latent concurrency-only defects as fixture FAILUREs instead of letting them escape to
  users (the intended signal).
* Neutral — `2` is enough to shake out shared-resource contention without maximizing throughput.

### B. Leave fixtures at `1`; rely on the mocha suite alone for concurrency coverage

* Good — zero risk; no change.
* Bad — leaves a blind spot: concurrency defects that only manifest in real end-to-end fixture runs
  (shared display/driver contention, session bleed) stay invisible until a user hits them.

### C. Set `concurrentRunners: true` (CPU-core count, capped at 4)

* Good — maximizes throughput on wider runners.
* Bad — the degree of parallelism varies by runner CPU count, so coverage is non-deterministic and
  uneven across OSes.
* Bad — widens the concurrency surface more than needed for a first step; `2` already exercises the
  `> 1` path.

## Decision Outcome

Chosen option: **A**. It is the smallest change that makes every fixture group exercise the `> 1` scheduler
path uniformly across the matrix, needs no schema change, and stays deterministic (a fixed `2`, not
runner-dependent). **B** keeps the blind spot. **C** makes the degree of parallelism vary by runner
CPU count, which trades reproducibility for marginal speed and widens the surface unevenly across OSes — not
worth it for a first step; `2` is enough to shake out shared-resource contention.

Mechanism: add `"concurrentRunners": 2` to `test/core-artifacts/config.groups.json`. Every `fixtures.yml`
leg — the `doc-detective/github-action` jobs (`config: test/core-artifacts/config.groups.json`) and the
`npx doc-detective runTests --config test/core-artifacts/config.groups.json ...` jobs — picks it up with no
per-job change.

## Consequences

* **Good** — fixture groups now run up to 2 specs concurrently, routinely exercising `runResourceAware` and
  the `"display"`-mutex serialization on real end-to-end runs across every OS. Concurrency-only defects now
  fail a fixture job instead of shipping.
* **Good** — multi-spec groups get a wall-clock reduction per OS job.
* **Trade-off / call-out** — a genuine concurrency incompatibility (e.g. two app/driver sessions contending
  for a single emulator/simulator) will now surface as a fixture FAILURE rather than passing serially. That is
  the intended signal: such a failure is a bug to fix, not a reason to revert to `1`. The before/after total
  Test-workflow wall-clock is recorded on the introducing PR so the parallelism cost/benefit is visible.
* **Neutral** — recordings remain serialized on the shared display; `2` does not change recording safety.

## Confirmation

* The full `Test` workflow (matrix + all `fixtures.yml` group×OS jobs) runs on the introducing PR and must be
  **all-green** — every fixture group resolves PASS/SKIPPED under 2 runners on Windows/macOS/Linux.
* Total Test-workflow wall-clock is captured before (at `concurrentRunners: 1`) and after (at `2`) and
  reported on the PR.
* The existing concurrency unit tests (`test/concurrency.test.js`, `test/ffmpeg-recorder.test.js`) continue
  to guard the scheduler's mutual-exclusion and over-approximation invariants unchanged.
