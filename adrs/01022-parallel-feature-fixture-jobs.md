---
status: accepted
date: 2026-07-03
decision-makers: doc-detective maintainers
---

# Run core fixtures as parallel per-feature CI jobs instead of one combined mocha pass

## Context and Problem Statement

The core Doc Detective `*.spec.json` fixtures were all executed by a single mocha test — the
"All core specs pass under concurrentRunners=2" case in [`test/core-core.test.js`](../test/core-core.test.js) —
which ran the **entire** `test/core-artifacts` directory in one `runTests()` pass on every matrix
cell. On Linux and macOS that pass finished inside the job budget (~22–28 min for the whole
`npm test`). On Windows it did not: browser/Appium startup, driver installs, and ffmpeg recording are
all markedly slower there, and the combined `test` job hit its `timeout-minutes: 90` cap and
**failed** (observed on [#491](https://github.com/doc-detective/doc-detective/pull/491): both Windows
cells at 1h30m12s). Because the matrix is `fail-fast: false`, every run also waited on that slowest
cell.

The fixtures are the long pole, and they are embarrassingly parallel: each feature (navigation,
recording, routing, http, …) is independent. Running them as one serial monolith wastes the
parallelism CI could exploit and couples unrelated features into a single 90-minute failure.

## Decision Drivers

* Kill the Windows timeout: no single job should be a 90-minute monolith.
* Exploit the natural parallelism of independent features.
* Keep exercising the **PR's own build**, not the published npm package — this is a pre-merge gate.
* Keep the fixtures policy intact: every spec resolves to PASS or SKIPPED, `runOn`-gated permutations
  land as SKIPPED where they can't run.
* Preserve a fast mocha smoke so a gross pipeline breakage still fails quickly and locally.

## Considered Options

* **A — Per-feature subdirectories + one CI job per (group × OS), running the local build directly.**
  Move the specs into `test/core-artifacts/<group>/`, add a reusable `fixtures.yml` that fans out a
  small job per group per OS, each building the PR and running `node ./bin/doc-detective.js` against
  its group directory. Trim the mocha pass to a single broad smoke spec.
* **B — Keep the combined mocha pass, just raise the Windows timeout / shard within mocha.** Sharding
  inside one mocha process still serializes on a shared Appium session and doesn't give per-feature
  isolation or independent OS fan-out.
* **C — Drive the groups through `doc-detective/github-action` against the linked local build.** By
  default the action runs `npx doc-detective@<version>` (default `latest`) — the **published**
  package, not the code under review. [github-action#70](https://github.com/doc-detective/github-action/pull/70)
  adds an empty-`version` mode that runs bare `npx doc-detective`, which — with the freshly-built
  package exposed via `npm link` — resolves the PR's own build. Keeps the action's ergonomics and is
  the maintainer's preferred delivery vehicle. (Bare-`npx` local resolution is verified in CI by a
  diagnostic step; `npm link` is what makes it deterministic rather than a registry fetch.)

## Decision Outcome

Chosen option: **C** — the per-feature subdirectory + `group × OS` fan-out of option A, delivered
through the GitHub Action (enabled by github-action#70).

* Fixtures live in `test/core-artifacts/<group>/` — `navigation`, `interactions`, `capture`,
  `recording`, `routing`, `guards`, `http`, `process`, `sessions`.
* [`.github/workflows/fixtures.yml`](../.github/workflows/fixtures.yml) is a reusable workflow with a
  `group × {ubuntu, windows, macos}` matrix (`fail-fast: false`, `timeout-minutes: 20`). Each job:
  `npm ci` → `npm run build` → `npm link` (expose the build) → start the test servers (via
  [`test/server/start.js`](../test/server/start.js) + `wait-ready.js`) → run the group through the
  Doc Detective GitHub Action with `version: ''` (bare `npx doc-detective` → the linked build) → gate
  on the action's `$RUNNER_TEMP/doc-detective-output.json` with
  [`scripts/check-fixture-results.cjs`](../scripts/check-fixture-results.cjs).
* Both the PR gate (`npm-test.yaml`) and the release gate (`release.yml`) call it.
* The mocha "combined pass" becomes a single smoke over `test.spec.json` (the broad "Do all the
  things!" spec). All the focused programmatic `it()` tests in `core-core.test.js` stay.
* **Exit-on-fail lives in CI, not the CLI.** The doc-detective CLI exits 0 even when specs FAIL (the
  exit-on-fail decision historically lived in the GitHub Action layer). `check-fixture-results.cjs`
  reproduces `exit_on_fail`: any `result === "FAIL"` — or an empty run (usually a mis-pointed
  `--input`) — fails the job.
* **Group config.** Group jobs use a lean [`config.groups.json`](../test/core-artifacts/config.groups.json)
  — identical to `config.json` minus the live `reqres.in` openApi integration, which would otherwise
  hit an external service 27× per run. That integration still runs once, in the mocha smoke, under the
  full `config.json`.

### Consequences

* Good: Windows fixture work fans out across ~9 short jobs instead of one 90-minute cell; no job
  approaches the old timeout. Unrelated feature failures are isolated to their own job.
* Good: the gate runs the PR's own build — the action executes the `npm link`-exposed local build via
  bare `npx doc-detective` (github-action#70), not the published package.
* **Neutral/Cost — coverage.** The root coverage ratchet ([ADR 01015](01015-cross-platform-coverage-merge.md),
  policy in [ADR 01017](01017-honest-100-percent-coverage-policy.md)) measured the cross-platform
  union of the **full E2E suite** collected under `NODE_V8_COVERAGE` during `npm test`. With the
  fixtures moved out of `npm test`, their E2E execution no longer feeds that union, so measured root
  coverage drops to what the mocha unit/integration tests + the single smoke spec cover. **This ADR
  amends ADR 01017**: fixture-driven E2E execution is no longer a coverage source, and the root
  thresholds in `coverage-thresholds.json` are re-baselined downward to the new honest union (the
  fixture group jobs do not collect coverage). The `src/common` ratchet is unaffected. Re-baselining
  follows the repo's established procedure: observe the new union from a CI run of the
  `coverage-merge` job, then set thresholds just below it (same as PR #493's Tier-2 re-baseline).
* Cost: more, smaller jobs (group × OS). Runner minutes rise; wall-clock and reliability improve. Node
  is pinned to one line for the fixture jobs (node 22 and 24 are still both exercised by the mocha
  smoke/unit matrix).

### Confirmation

* `npm-test.yaml` shows a green `fixtures` matrix with no job near its 20-minute budget, and no
  Windows job at the old 90-minute cap.
* Every group job is PASS or SKIPPED; a deliberately-broken spec makes exactly its group's job fail
  (via `check-fixture-results.cjs`), not the whole suite.
* The mocha `test` job still runs the smoke + all programmatic `it()` tests and both node lines.
* `coverage-thresholds.json` is re-baselined and the `coverage-merge` ratchet is green at the new
  union.

## Pros and Cons of the Options

### A — Per-feature subdirs + job per (group × OS), running the local build directly (`node ./bin`)

* Good: real parallelism, per-feature isolation, no monolithic timeout, unambiguously the PR's build.
* Good: keeps a fast mocha smoke and all programmatic assertions.
* Bad: bypasses the GitHub Action, so it forgoes the action's ergonomics (results object, issue
  creation) that the maintainer wants in the loop.
* Bad: loses fixture-driven E2E coverage from the ratchet (accepted; thresholds re-baselined).

### B — Keep combined mocha pass, raise timeout / shard in mocha

* Good: minimal change.
* Bad: still one shared Appium session; no independent OS fan-out; the Windows monolith persists.

### C — Drive groups through the GitHub Action against the linked local build (CHOSEN)

* Good: reuses the action's ergonomics and keeps the repo dog-fooding its own action; same subdir /
  fan-out benefits as A.
* Good: with github-action#70 (empty `version` → bare `npx`) + `npm link`, the action runs the PR's
  build, not the published package.
* Bad: adds a cross-repo dependency (the action must ship the empty-`version` fix). Until it's
  released, `fixtures.yml` pins the action to the fix commit.
* Watch: bare-`npx` resolution must land on the linked build, not a registry fetch. `npm link` makes
  it deterministic; a diagnostic step logs what resolved so a silent fallback is visible. Loses
  fixture-driven E2E coverage from the ratchet (accepted; thresholds re-baselined).
