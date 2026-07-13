---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Decouple the doc-detective-common test run from its build

## Context and Problem Statement

`src/common`'s `build` script ended with `&& npm run test:coverage`, so building
the package also ran its full `c8 mocha` suite. Because the root `build`
(`build:common && compile && copy:schemas`) is invoked by **every** CI job that
needs the compiled artifacts — all ~40 fixture jobs, both mocha shards, and the
coverage jobs — every one of those jobs ran the src/common test suite purely as
a side effect of building. Two costs followed:

* **Flakiness.** `src/common/test/integration.test.js` does real module-load /
  fs work under a 10s timeout; on loaded macOS runners it intermittently
  exceeded it, failing the **build** step of otherwise-unrelated jobs (observed
  reruns on PRs #619, #620, #621). A flake in one small suite could red any of
  ~40 jobs.
* **Wasted wall-clock.** Those jobs need the built `dist/`, not a test run. The
  suite added ~1 minute to the build step of every macOS fixture job (where the
  build step is already ~3 min), on the scarce macOS pool.

The src/common suite is already run where it belongs: the dedicated
`coverage-ratchet` job and the cross-OS/node mocha matrix.

## Decision Drivers

* A build should produce artifacts; running tests as a build side effect couples
  unrelated jobs to an unrelated suite's flakiness and runtime.
* Don't lose the src/common coverage ratchet or the integration coverage.
* Minimal blast radius — exactly one CI job relied on the build running tests.

## Considered Options

* **A — Decouple** (chosen): `build` builds only; the one job that needs the
  coverage runs `test:coverage` explicitly.
* **B — Bump only the integration test's timeout** to 60s. Removes the flake but
  keeps every job paying to run the suite during build.
* **C — Status quo.**

## Decision Outcome

Chosen option: **A** (with B folded in as defense-in-depth).

* `src/common`'s `build` is now `dereferenceSchemas && generate:types &&
  compile` — no `test:coverage`. Every `npm run build` / `build:common`
  consumer builds artifacts without running the suite.
* The only consumer that relied on the side effect — the `Coverage ratchet
  (src/common)` job in [`test.yml`](../.github/workflows/test.yml) — now runs
  `npm run test:coverage` (in `src/common`) explicitly before the ratchet
  check, producing the `coverage-summary.json` the ratchet reads.
* Defense-in-depth: `integration.test.js`'s suite timeout is raised 10s → 60s,
  so the jobs that still run it (the ratchet + the mocha matrix) don't trip on a
  loaded runner.
* A regression guard (`test/common-build-contract.test.js`) asserts the build
  builds artifacts without invoking the suite (no `test:coverage`/`mocha`/`c8`),
  still runs `compile`, and keeps a separate `test:coverage` entry — red against
  the prior build script, green against the decoupled one.

### Consequences

* Good: the src/common suite no longer runs in ~40 fixture/shard jobs — one
  flaky suite can no longer red an unrelated build step, and each macOS fixture
  job's build step drops ~1 min.
* Good: coverage and the ratchet are unchanged — the suite still runs in the
  ratchet job (now explicitly) and the mocha matrix.
* Neutral: one extra `run:` step in the ratchet job (the explicit test run),
  replacing the implicit one — same total work there.
* Watch: anyone adding a new CI job that assumed `build:common` also runs the
  tests must run them explicitly. Documented in `src/common/AGENTS.md`.

### Confirmation

* `npm run build:common` produces `src/common/dist/` with **no** mocha output.
* The `Coverage ratchet (src/common)` job stays green (runs `test:coverage`
  then the ratchet).
* Fixture/shard build steps no longer show src/common test output, and the
  `integration.test.js` timeout flake stops recurring.
* `test/common-build-contract.test.js` fails against the prior build script and
  passes against the decoupled one.

## Pros and Cons of the Options

### A — Decouple (CHOSEN)

* Good: removes both the cross-job flake surface and the per-job waste at the
  root; tiny, contained change.
* Bad: one CI job needs an explicit test step added (done).

### B — Timeout bump only

* Good: one-line flake fix.
* Bad: leaves ~40 jobs running the suite during build — the waste and the
  coupling remain.

### C — Status quo

* Bad: recurring reruns and wasted macOS minutes.
