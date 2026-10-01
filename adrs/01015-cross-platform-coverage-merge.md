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
2. **A duplicate heavy run.** `coverage-ratchet-root` re-ran the entire end-to-end suite purely to
   measure coverage. That's browsers, `install all`, and E2E. It was a second ~45–90 min job. That
   sits on top of the six-cell test matrix, which already runs that same suite on every OS and node
   combination.

We want the ratchet to enforce the **true cross-platform union** of coverage, and to stop paying for
a duplicate full-suite run.

## Decision Drivers

* Count OS-gated branches, as the union across Windows, macOS, and Linux. Then 100% is attainable,
  and platform-specific regressions are caught.
* Don't add a second (third, …) full E2E run; reuse the matrix that already runs the suite per OS.
* Keep the *measurement semantics* identical to today (same c8 config, same sourcemap remap to
  `src/**`, same `coverage-summary.json` shape the ratchet reads) so only the coverage set widens.
* No new production/dev dependencies (avoid the cross-platform lockfile-regeneration hazard).

## Considered Options

* **A. Instrument the existing matrix cells, plus a merge job.** Each cell collects raw V8 coverage
  through `NODE_V8_COVERAGE`, prunes it to the repo's `dist` with OS-agnostic paths, and uploads it.
  A `coverage-merge` job re-roots every cell's paths to its own `dist` and runs `c8 report` over the
  union, then ratchets.
* **B. Keep the single-OS job, add advisory multi-OS reporting.** Two coverage numbers, and only
  Ubuntu gates. It doesn't fix the blind spot in the gate, and keeps the duplicate run.
* **C. Merge Istanbul `coverage-final.json` per cell with a hand-rolled counter merger.** It avoids
  raw-V8 path issues, but reimplements Istanbul's summarizer, meaning line and branch counting, by
  hand. That risks divergence from the numbers the ratchet compares against.

## Decision Outcome

Chosen: **Option A**. It reuses the matrix, so there's no duplicate run, and it yields the true
union. It also reuses c8's own reporting. So the summary is byte-for-byte the same kind the
single-OS job produced, mapped back to `src/**` through sourcemaps. The single-OS
`coverage-ratchet-root` job is removed, and `coverage-merge` replaces it as the gate. Both callers
(`npm-test.yaml`, `release.yml`) wait on the whole reusable `test.yml`, so the new job gates merges
and releases just as the old one did.

One part is non-obvious: merging raw V8 coverage across machines whose `file://` urls are absolute
and OS-specific. Two small, dependency-free scripts handle it:

* [scripts/prune-coverage.cjs](../scripts/prune-coverage.cjs) runs per cell. It keeps only entries
  under the repo's own `dist/`, dropping node internals, `node_modules`, and the
  separately-ratcheted `dist/common/**`. It then rewrites each kept `url` to a path **relative to
  `dist`**, such as `/core/expressions.js`. This shrinks the artifact and makes it portable.
* [scripts/merge-coverage.cjs](../scripts/merge-coverage.cjs) runs in the merge job. It re-roots
  every relative `url` to the merge machine's absolute `dist` `file://` path, and collects all
  cells' raw files into one temp directory. `c8 report` then aggregates duplicate script entries
  into the union natively. That's the same aggregation it already does across one run's
  subprocesses.

### Consequences

* Good: OS-gated branches count; the ratchet enforces the honest cross-platform union.
* Good: there's no separate full-suite coverage run, since the matrix cells double as collectors.
  Net CI time drops, as a ~20 min merge job replaces a ~45–90 min duplicate E2E run.
* Good: no new dependencies; c8 (already pinned) does the reporting.
* Neutral: the matrix `test` step now runs under `NODE_V8_COVERAGE` (low overhead; the old single-OS
  job already ran the suite under c8, which does the same).
* Neutral: the baseline rises to the union number; `coverage-thresholds.json` is re-baselined from
  the first CI run of this job.
* Caveat: the gating check's name changes from `Coverage ratchet (root)` to
  `Coverage ratchet (root, cross-platform)`. If it was added as a **required status check** in
  branch protection, the maintainer must update the required-check name. That's a repo setting,
  outside this PR.
* Requirement: raw V8 coverage encodes character offsets into the emitted `dist/**/*.js`. So the
  merge only maps correctly if every cell's `dist` is **byte-identical** to the merge machine's.
  `tsc` defaults to CRLF on Windows, which would shift every Windows offset. `tsconfig.json` now
  pins `newLine: "lf"`, so `dist` is LF on all platforms. `.gitattributes` normalizes checked-in
  sources, but `dist` is built, not committed, so the compiler setting is what guarantees this.

### Confirmation

The prune → merge → `c8 report` pipeline was verified locally. Two disjoint unit-test runs were
treated as two "cells". Each produced raw V8 coverage, was pruned from Windows absolute paths to
dist-relative ones, then re-rooted, merged, and reported. The merged total line coverage (24.03%)
was strictly greater than either cell alone (cell A: 4.61%). Every file remapped to its `src/**`
`.ts` source through sourcemaps. That proves the union aggregates rather than concatenates, and that
cross-OS path normalization round-trips. In CI, the `coverage-merge` job's uploaded `root-coverage`
artifact shows the union percentage, and `check-coverage-ratchet.cjs` enforces it against
`coverage-thresholds.json`.

## Docs impact

None. This is internal CI and coverage tooling only. No user-facing step type, option, flag, output,
or default changes.

## Pros and Cons of the Options

### A: matrix collection plus a merge job
* Good: true union; no duplicate run; reuses c8's summarizer; no new deps.
* Bad: needs the two path-normalization scripts and artifact plumbing.

### B: single-OS gate plus advisory multi-OS
* Good: smallest change.
* Bad: the gate keeps its blind spot; the duplicate run remains.

### C: hand-rolled Istanbul merge
* Good: avoids raw-V8 path handling.
* Bad: it reimplements Istanbul's line and branch summarization. That's easy to diverge from the
  numbers the ratchet compares, and more code to maintain than the two thin V8 scripts.
