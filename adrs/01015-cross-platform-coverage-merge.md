---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Ratchet root coverage on the cross-platform union, not a single OS

## Context and Problem Statement

The root `doc-detective` coverage ratchet measured a single `ubuntu-latest` run of the full suite
(`coverage-ratchet-root`). Two problems followed:

1. **Single-OS blind spots.** The runner has genuinely OS-specific branches (Windows path handling,
   macOS/Linux recording and driver paths). Measured only on Ubuntu, those branches are *unreachable*
   by construction, so an honest 100% is impossible and real Windows/macOS regressions go uncounted.
2. **A duplicate heavy run.** `coverage-ratchet-root` re-ran the entire end-to-end suite (browsers +
   `install all` + E2E) purely to measure coverage — a second ~45–90 min job on top of the six-cell
   test matrix that already runs that same suite on every OS/node combination.

We want the ratchet to enforce the **true cross-platform union** of coverage, and to stop paying for
a duplicate full-suite run.

## Decision Drivers

* Count OS-gated branches — the union across Windows/macOS/Linux, so 100% is attainable and
  platform-specific regressions are caught.
* Don't add a second (third, …) full E2E run; reuse the matrix that already runs the suite per OS.
* Keep the *measurement semantics* identical to today (same c8 config, same sourcemap remap to
  `src/**`, same `coverage-summary.json` shape the ratchet reads) so only the coverage set widens.
* No new production/dev dependencies (avoid the cross-platform lockfile-regeneration hazard).

## Considered Options

* **A — Instrument the existing matrix cells + a merge job.** Each cell collects raw V8 coverage via
  `NODE_V8_COVERAGE`, prunes it to the repo's `dist` with OS-agnostic paths, and uploads it; a
  `coverage-merge` job re-roots every cell's paths to its own `dist` and runs `c8 report` over the
  union, then ratchets.
* **B — Keep the single-OS job, add advisory multi-OS reporting.** Two coverage numbers; only Ubuntu
  gates. Doesn't fix the blind spot in the gate and keeps the duplicate run.
* **C — Merge Istanbul `coverage-final.json` per cell with a hand-rolled counter merger.** Avoids
  raw-V8 path issues but reimplements Istanbul's summarizer (line/branch counting) by hand, risking
  divergence from the numbers the ratchet compares against.

## Decision Outcome

Chosen: **Option A**. It reuses the matrix (no duplicate run), yields the true union, and reuses
c8's own reporting so the summary is byte-for-byte the same kind the single-OS job produced —
mapped back to `src/**` through sourcemaps. The single-OS `coverage-ratchet-root` job is removed;
`coverage-merge` replaces it as the gate. Both callers (`npm-test.yaml`, `release.yml`) wait on the
whole reusable `test.yml`, so the new job gates merges and releases just as the old one did.

The one non-obvious part — merging raw V8 coverage across machines whose `file://` urls are absolute
and OS-specific — is handled by two small, dependency-free scripts:

* [scripts/prune-coverage.cjs](../scripts/prune-coverage.cjs) (per cell): keep only entries under the
  repo's own `dist/` (drop node internals, `node_modules`, and the separately-ratcheted
  `dist/common/**`), and rewrite each kept `url` to a path **relative to `dist`**
  (e.g. `/core/expressions.js`). This shrinks the artifact and makes it portable.
* [scripts/merge-coverage.cjs](../scripts/merge-coverage.cjs) (merge job): re-root every relative
  `url` to the merge machine's absolute `dist` `file://` path and collect all cells' raw files into
  one temp directory. `c8 report` then aggregates duplicate script entries into the union natively —
  the same aggregation it already does across a single run's subprocesses.

### Consequences

* Good: OS-gated branches count; the ratchet enforces the honest cross-platform union.
* Good: no separate full-suite coverage run — the matrix cells double as collectors; net CI time
  drops (a ~20 min merge job replaces a ~45–90 min duplicate E2E run).
* Good: no new dependencies; c8 (already pinned) does the reporting.
* Neutral: the matrix `test` step now runs under `NODE_V8_COVERAGE` (low overhead; the old single-OS
  job already ran the suite under c8, which does the same).
* Neutral: the baseline rises to the union number; `coverage-thresholds.json` is re-baselined from
  the first CI run of this job.
* Caveat: the gating check's name changes from `Coverage ratchet (root)` to
  `Coverage ratchet (root, cross-platform)`. If it was added as a **required status check** in branch
  protection, the maintainer must update the required-check name (a repo setting, outside this PR).
* Requirement: raw V8 coverage encodes character offsets into the emitted `dist/**/*.js`, so the
  merge only maps correctly if every cell's `dist` is **byte-identical** to the merge machine's.
  `tsc` defaults to CRLF on Windows, which would shift every Windows offset; `tsconfig.json` now
  pins `newLine: "lf"` so `dist` is LF on all platforms. (`.gitattributes` normalizes checked-in
  sources, but `dist` is built, not committed, so the compiler setting is what guarantees this.)

### Confirmation

The prune → merge → `c8 report` pipeline was verified locally by treating two disjoint unit-test runs
as two "cells": each produced raw V8 coverage, was pruned (Windows absolute paths → dist-relative),
merged/re-rooted, and reported. The merged total line coverage (24.03%) was strictly greater than
either cell alone (cell A: 4.61%), and every file remapped to its `src/**` `.ts` source via
sourcemap — proving the union aggregates rather than concatenates and that cross-OS path
normalization round-trips. In CI, the `coverage-merge` job's uploaded `root-coverage` artifact shows
the union percentage, and `check-coverage-ratchet.cjs` enforces it against `coverage-thresholds.json`.

## Docs impact

None — internal CI/coverage tooling only. No user-facing step type, option, flag, output, or default
changes.

## Pros and Cons of the Options

### A — Matrix collection + merge job
* Good: true union; no duplicate run; reuses c8's summarizer; no new deps.
* Bad: needs the two path-normalization scripts and artifact plumbing.

### B — Single-OS gate + advisory multi-OS
* Good: smallest change.
* Bad: the gate keeps its blind spot; the duplicate run remains.

### C — Hand-rolled Istanbul merge
* Good: avoids raw-V8 path handling.
* Bad: reimplements Istanbul's line/branch summarization — easy to diverge from the numbers the
  ratchet compares, and more code to maintain than the two thin V8 scripts.
