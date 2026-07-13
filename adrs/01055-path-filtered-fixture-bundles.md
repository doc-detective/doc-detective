---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Narrow the PR fixture matrix to the bundles a change set can affect

## Context and Problem Statement

Every PR-gate run executes all 27 general fixture jobs (9 bundles × 3 OSes, ADR 01048) plus the
android legs, regardless of what changed. For a PR that only edits fixture specs in one group —
a common shape when authoring feature fixtures per the CLAUDE.md policy — the other bundles burn
~25 jobs of runner time and queue pressure to re-verify code the PR cannot have touched. ADR 01048
deliberately deferred this lever ("option C") because a wrong path→bundle mapping fails silent: the
gate a change needed simply doesn't run, and green means nothing.

## Decision Drivers

* Cut wasted runner time and queue pressure for narrow PRs without weakening the gate.
* A mapping gap must fail LOUD or fail SAFE (run everything) — never silently skip coverage.
* The release gate must keep running everything, always.
* Skipped work must be visible in the run UI, not invisible.

## Considered Options

* **A — Conservative selector, fallback-to-all** (chosen): the only narrowing case is a change set
  confined entirely to fixture group directories; anything else selects "all".
* **B — Full path map (source files → bundles)**: map product source areas to affected bundles
  (e.g. `src/core/tests/httpRequest.ts` → web-plumbing). Maximum savings, but the map is a living
  artifact whose staleness silently unguards exactly the code being changed.
* **C — Status quo**: run everything, always.

## Decision Outcome

Chosen option: **A**, implemented as a **dynamic matrix** so only the selected bundles ever
materialize as jobs.

* [`scripts/select-fixture-bundles.cjs`](../scripts/select-fixture-bundles.cjs) (zero-dependency)
  is the **single source of truth** for the bundle definitions (name, group dirs, and the
  per-bundle `timeout`/`android`/`prebootIos` CI attributes). Its `--matrix` mode emits the JSON
  array of bundle objects to run: every bundle unless the change set is confined entirely to
  fixture group directories, in which case only the owning bundles. Shared fixture infrastructure
  inside `core-artifacts` (`env`, `config.groups.json`, the mocha-owned `ordering/`/`output/`
  dirs) and empty change sets yield the full matrix.
* [`fixtures.yml`](../.github/workflows/fixtures.yml) computes its own matrix: a `select` job
  reads the PR's changed files (GitHub API; non-PR triggers and every error path fall back to the
  full matrix) and runs the script's `--matrix`; the `fixtures` job's
  `matrix.bundle: ${{ fromJSON(needs.select.outputs.matrix) }}` expands to exactly the selected
  bundles. A **deselected bundle produces no job at all** — cleaner than a skipped one.
* **Why a dynamic matrix, not a per-job `if:`.** The `matrix` context is not available in a
  job-level `if:` (only `github`/`needs`/`vars`/`inputs` are), so a bundle can't gate itself on
  its own matrix value — an `if:` referencing `matrix.bundle.name` is a workflow-compile
  (startup) failure. Emitting only the selected bundles into the matrix sidesteps that entirely.
* Self-contained in the reusable workflow, so both callers benefit with no plumbing:
  [`npm-test.yaml`](../.github/workflows/npm-test.yaml) just calls `fixtures.yml` (and grants
  `pull-requests: read`, which a reusable workflow can't hold unless the caller does), and
  [`release.yml`](../.github/workflows/release.yml) is unchanged — its push context has no PR, so
  the `select` job falls back to the full matrix and the release gate re-verifies everything.
* Drift guards (`test/select-fixture-bundles.test.js`): the script's bundle dirs must match the
  on-disk `test/core-artifacts/` group directories **exactly, one bundle each** (ties the source
  of truth to the filesystem, not to a second copy), and fixtures.yml must consume
  `fromJSON(needs.select.outputs.matrix)` from a `select` job that runs `--matrix`.

### Consequences

* Good: fixture-authoring PRs run only their own bundles (e.g. one group → 3 jobs instead of 27),
  with the mocha matrix unchanged as a cross-cutting backstop.
* Good: every failure direction is safe — selector bug, API failure, empty/degenerate output all
  fall back to the **full** matrix (waste, not lost coverage). The one dangerous state, an empty
  matrix (which would run zero fixtures), is impossible: the `select` job never emits `[]`.
* Good: no second copy of the bundle list to drift — the workflow's matrix is generated from the
  script, and the coverage guard is against the actual filesystem.
* Neutral: most PRs touch product code and still run `all` — by design. This ADR buys the narrow
  case cheaply; option B's larger savings remain available later, with this selector as the base.
* Cost: one more always-on job (`select`, seconds).
* Scope: the matrix narrowing gates only the general `fixtures` jobs. The three heavy Android KVM
  jobs (`fixtures-android-reuse`/`-managed`/`-action`) are NOT gated here and run on every PR —
  the safe direction (Android coverage is never skipped), but a cost this ADR does not address.
  Gating those legs by Android relevance is a separate decision (ADR 01056).

### Confirmation

* A PR touching only `test/core-artifacts/http/**` materializes only the `web-plumbing` bundle
  jobs (3) — the other bundles produce no jobs — plus the mocha matrix and the three always-on
  Android KVM jobs.
* A PR touching any `src/**` file runs all bundle jobs.
* Adding/renaming a `test/core-artifacts/<group>/` dir without updating the script, or unwiring
  the fixtures matrix from the `select` job, fails `test/select-fixture-bundles.test.js`.
* A release-branch push runs the full matrix (no `bundles` input in release.yml).

## Pros and Cons of the Options

### A — Conservative selector, fallback-to-all (CHOSEN)

* Good: silent-skip-proof by construction; trivial to reason about; zero-dependency selector.
* Good: unit-tested pure function; drift guard ties it to the matrix definition.
* Bad: no savings for product-code PRs (deliberate).

### B — Full source→bundle path map

* Good: biggest savings (most PRs would run a small subset).
* Bad: the map ages with the codebase, and a stale entry silently skips exactly the coverage the
  change needed; requires discipline no gate enforces. Rejected for now; can layer on top of A.

### C — Status quo

* Good: nothing to maintain.
* Bad: ~25 wasted jobs per fixture-authoring PR, and continued queue pressure on the shared
  Windows/macOS pools.
