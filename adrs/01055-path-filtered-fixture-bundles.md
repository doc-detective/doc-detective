---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Narrow the PR fixture matrix to the bundles a change set can affect

## Context and Problem Statement

Every PR-gate run executes all 27 general fixture jobs (9 bundles × 3 OSes, ADR 01048), plus the
android legs, regardless of what changed. Take a PR that only edits fixture specs in one group,
a common shape when authoring feature fixtures per the CLAUDE.md policy. The other bundles then burn
~25 jobs of runner time and queue pressure, re-verifying code the PR cannot have touched. ADR 01048
deliberately deferred this lever, as "option C", because a wrong path→bundle mapping fails silent.
The gate a change needed simply doesn't run, and green means nothing.

## Decision Drivers

* Cut wasted runner time and queue pressure for narrow PRs without weakening the gate.
* A mapping gap must fail LOUD, or fail SAFE by running everything. It must never silently skip
  coverage.
* The release gate must keep running everything, always.
* Skipped work must be visible in the run UI, not invisible.

## Considered Options

* **A. Conservative selector, fallback-to-all** (chosen). The only narrowing case is a change set
  confined entirely to fixture group directories. Anything else selects "all".
* **B. Full path map, from source files to bundles.** Map product source areas to affected bundles,
  such as `src/core/tests/httpRequest.ts` → web-plumbing. Maximum savings, but the map is a living
  artifact whose staleness silently unguards exactly the code being changed.
* **C. Status quo.** Run everything, always.

## Decision Outcome

Chosen option: **A**, implemented as a **dynamic matrix** so only the selected bundles ever
materialize as jobs.

* [`scripts/select-fixture-bundles.cjs`](../scripts/select-fixture-bundles.cjs) (zero-dependency)
  is the **single source of truth** for the bundle definitions (name, group dirs, and the
  per-bundle `timeout`/`android`/`prebootIos` CI attributes). Its `--matrix` mode emits the JSON
  array of bundle objects to run. That's every bundle, unless the change set is confined entirely to
  fixture group directories, in which case only the owning bundles. Shared fixture infrastructure
  inside `core-artifacts` (`env`, `config.groups.json`, the mocha-owned `ordering/`/`output/`
  dirs) and empty change sets yield the full matrix.
* [`fixtures.yml`](../.github/workflows/fixtures.yml) computes its own matrix. A `select` job
  reads the PR's changed files through the GitHub API, then runs the script's `--matrix`. Non-PR
  triggers and every error path fall back to the full matrix. The `fixtures` job's
  `matrix.bundle: ${{ fromJSON(needs.select.outputs.matrix) }}` expands to exactly the selected
  bundles. A **deselected bundle produces no job at all**, which is cleaner than a skipped one.
* **Why a dynamic matrix, not a per-job `if:`.** The `matrix` context is not available in a
  job-level `if:`, where only `github`, `needs`, `vars`, and `inputs` are. So a bundle can't gate
  itself on its own matrix value. An `if:` referencing `matrix.bundle.name` is a workflow-compile,
  or startup, failure. Emitting only the selected bundles into the matrix sidesteps that entirely.
* It's self-contained in the reusable workflow, so both callers benefit with no plumbing.
  [`npm-test.yaml`](../.github/workflows/npm-test.yaml) just calls `fixtures.yml`, and grants
  `pull-requests: read`, which a reusable workflow can't hold unless the caller does.
  [`release.yml`](../.github/workflows/release.yml) is unchanged. Its push context has no PR, so
  the `select` job falls back to the full matrix and the release gate re-verifies everything.
* Drift guards live in `test/select-fixture-bundles.test.js`. The script's bundle dirs must match
  the on-disk `test/core-artifacts/` group directories **exactly, one bundle each**. That ties the
  source of truth to the filesystem, not to a second copy. And fixtures.yml must consume
  `fromJSON(needs.select.outputs.matrix)` from a `select` job that runs `--matrix`.

### Consequences

* Good: fixture-authoring PRs run only their own bundles, so one group means 3 jobs instead of 27.
  The mocha matrix is unchanged as a cross-cutting backstop.
* Good: every failure direction is safe. A selector bug, an API failure, and empty or degenerate
  output all fall back to the **full** matrix, which is waste rather than lost coverage. The one
  dangerous state is an empty matrix, which would run zero fixtures. It is impossible, because the
  `select` job never emits `[]`.
* Good: there's no second copy of the bundle list to drift. The workflow's matrix is generated from
  the script, and the coverage guard is against the actual filesystem.
* Neutral: most PRs touch product code and still run `all`, by design. This ADR buys the narrow
  case cheaply. Option B's larger savings remain available later, with this selector as the base.
* Cost: one more always-on job (`select`, seconds).
* Scope: the matrix narrowing gates only the general `fixtures` jobs. The three heavy Android KVM
  jobs (`fixtures-android-reuse`/`-managed`/`-action`) are NOT gated here, and run on every PR.
  That's the safe direction, since Android coverage is never skipped, but it's a cost this ADR does
  not address. Gating those legs by Android relevance is a separate decision (ADR 01056).

### Confirmation

* A PR touching only `test/core-artifacts/http/**` materializes only the 3 `web-plumbing` bundle
  jobs, and the other bundles produce no jobs. The mocha matrix and the three always-on Android KVM
  jobs still run.
* A PR touching any `src/**` file runs all bundle jobs.
* Adding/renaming a `test/core-artifacts/<group>/` dir without updating the script, or unwiring
  the fixtures matrix from the `select` job, fails `test/select-fixture-bundles.test.js`.
* A release-branch push runs the full matrix (no `bundles` input in release.yml).

## Pros and Cons of the Options

### A: conservative selector, fallback-to-all (CHOSEN)

* Good: silent-skip-proof by construction; trivial to reason about; zero-dependency selector.
* Good: unit-tested pure function; drift guard ties it to the matrix definition.
* Bad: no savings for product-code PRs (deliberate).

### B: full source→bundle path map

* Good: biggest savings (most PRs would run a small subset).
* Bad: the map ages with the codebase, and a stale entry silently skips exactly the coverage the
  change needed; requires discipline no gate enforces. Rejected for now; can layer on top of A.

### C: status quo

* Good: nothing to maintain.
* Bad: ~25 wasted jobs per fixture-authoring PR, and continued queue pressure on the shared
  Windows/macOS pools.
