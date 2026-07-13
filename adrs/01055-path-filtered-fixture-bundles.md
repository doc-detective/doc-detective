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

Chosen option: **A**.

* [`scripts/select-fixture-bundles.cjs`](../scripts/select-fixture-bundles.cjs) (zero-dependency)
  returns `all` unless every changed file lives under `test/core-artifacts/<group>/` for a known
  bundle group; then it returns exactly the owning bundles. Shared fixture infrastructure inside
  `core-artifacts` (`env`, `config.groups.json`, the mocha-owned `ordering/` and `output/` dirs)
  and empty change sets also return `all`.
* The PR gate ([`npm-test.yaml`](../.github/workflows/npm-test.yaml)) runs a `changes` job that
  lists the PR's files (GitHub API; non-PR triggers select `all`) and feeds the selector; the
  `fixtures` call passes the result as the new `bundles` input of
  [`fixtures.yml`](../.github/workflows/fixtures.yml). Each bundle job carries a comma-guarded
  `if:` (bundle names are not substring-safe: `apps` vs `apps-ios`), so deselected bundles appear
  as **skipped jobs** — visible, auditable, never silent.
* [`release.yml`](../.github/workflows/release.yml) omits the input and gets the default `all`:
  the release gate is unchanged and re-verifies everything before publish.
* Drift guards: a mocha test (`test/select-fixture-bundles.test.js`) asserts the script's bundle
  map deep-equals the fixtures.yml matrix, so editing one without the other fails the unit suite;
  a `changes`-job failure fails the whole gate (`fixtures` `needs` it).

### Consequences

* Good: fixture-authoring PRs run only their own bundles (e.g. one group → 3 jobs instead of 27),
  with the mocha matrix unchanged as a cross-cutting backstop.
* Good: every failure direction is safe — selector bug, API failure, or empty output all default
  to `all` (waste, not lost coverage); drift between map and matrix breaks the unit suite. An
  empty `bundles` value is the one dangerous state (it would skip every leg, and a skipped
  required check counts as passing), so the `changes` job guards against emitting it.
* Neutral: most PRs touch product code and still select `all` — by design. This ADR buys the
  narrow case cheaply; option B's larger savings remain available later if wanted, with this
  selector as its fallback layer.
* Cost: one more always-on job (`changes`, seconds). Skipped bundle jobs still appear in the
  checks list (as skipped), which reviewers must read as "not applicable", not "passed".
* Scope: the `bundles` input gates only the general `fixtures` matrix. The three heavy Android
  KVM jobs (`fixtures-android-reuse`/`-managed`/`-action`) are NOT gated here and run on every
  PR — the safe direction (Android coverage is never skipped), but they remain a cost this ADR
  does not address. Gating those legs by Android relevance is a separate decision (ADR 01056).

### Confirmation

* A PR touching only `test/core-artifacts/http/**` runs the `web-plumbing` bundle jobs (3) plus
  the mocha matrix and the three always-on Android KVM jobs; every other bundle job shows as
  skipped.
* A PR touching any `src/**` file runs all bundle jobs.
* Renaming a bundle in fixtures.yml without updating the selector fails
  `test/select-fixture-bundles.test.js`.
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
