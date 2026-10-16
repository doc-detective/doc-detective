---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Split the longest fixture jobs across runners

## Context and Problem Statement

The PR gate's wall clock is set by its longest jobs. On a recent `main`-based run
(38516518765) two fixture jobs sat near the top. The managed-boot Android job took ~17 min:
the `apps-android` group (~11 min), then `mobile-web-android` (~3 min), back to back.
`recording (windows-latest)` took 11–15 min, of which ~510 s is the fixtures step.

Neither can go faster inside one job. Recordings serialize on a display mutex within a
run, so the recording specs run one after another however many runners the config
allows. The managed-boot steps are sequential by construction. A second runner is the
only parallelism left.

The bundle definitions in `scripts/select-fixture-bundles.cjs` are tied to the
filesystem: every `test/core-artifacts/<group>/` dir belongs to exactly one bundle
(ADR 01055). Any split has to keep that guard, and keep every spec running on the same
OS legs, with the same gates.

## Decision Drivers

* Shorten the longest jobs without dropping, moving, or editing any fixture spec.
* A new spec must land in some job without anyone remembering to list it.
* Keep the per-group guard, dir-based narrowing (ADR 01055), and the zero-spec and
  require-a-PASS gates working unchanged.
* Every extra job costs setup time (~2–4 min) and a runner slot. macOS slots are capped at
  5. So split only where the job is long enough to pay for it.

## Considered Options

* **A. Spec-file shards for `recording`, gate-based legs for managed-boot** (chosen).
* **B. Move specs into new group dirs** (e.g. `recording-2/`). This makes the split
  dir-based with no selector change, but it moves fixture files, which breaks their
  history and every doc link to them.
* **C. A generic N-way automatic split** of every bundle by file count. It balances
  badly, because one spec (`recording-permutations`, ~165 s) outweighs most others put
  together, and it multiplies jobs on the capped macOS pool.

## Decision Outcome

Chosen option: **A**.

* **Recording.** A bundle can now be a *shard* of another (`shardOf`): it owns no dir
  and claims named spec files from its owner's dir. The owner's input becomes every
  entry in the dir *not* claimed, read from disk when the matrix is computed. A new spec
  therefore lands in the owner by default. `recording-2` claims
  `recording-permutations`, `annotate-timeout`, `above-variation`, and
  `stale-headless`, which balances CI timings to ~250 s per job on Windows and macOS.
  `selectMatrix` runs a shard whenever its owner is selected. `selectBundles`, the
  name-level view, still reports only the owner.
* **Managed-boot Android.** The job becomes a three-leg matrix (`apps-android`,
  `apps-android-multidevice`, `mobile-web-android`), one runner each. The legs split by
  the two-device spec's own `requires.env` gate rather than by a file list. The
  `apps-android` leg runs the whole group dir with `DD_FIXTURE_MULTIDEVICE` empty, which
  `requires.env` treats as unset, so the two-device spec lands SKIPPED there. The
  `multidevice` leg runs only that spec, with the gate set. Every leg keeps
  `DD_FIXTURE_PROVISION` and still requires a PASS.
* **Not split:** the Android reuse leg (~6 min since ADR 01117) and the lazy action leg
  (~7 min). Each leg pays its own emulator boot, so a split would add more than it
  saves.

### Consequences

* Good, measured on PR #745 (run 38581264149) against two `main`-equivalent runs
  (38516518765, 38567811852):
  * Managed-boot: one 15.6–17.0 min job became legs of 8.3 min (`apps-android`), 6.6 min
    (`multidevice`), and 6.2 min (`mobile-web-android`). The two-device spec took 180 s
    alone, against ~310 s inside the serial run.
  * Recording, fixtures step: Windows 514–540 s became 258 s + 243 s, and macOS ~600 s
    became 222 s + 289 s. Job time on Windows went from 11.1–11.6 min to 6.1 and 5.7 min.
  * Every spec kept its PASS/SKIPPED/WARNING outcome.
* Good: no fixture file moves or changes, and every spec still runs on the same OS
  legs. New recording specs, and new `apps-android` specs, need no selector edit.
* Bad: four more jobs per full run (one recording job per OS, two managed-boot legs),
  each paying setup. On macOS that's one more job on a 5-slot pool, traded for a shorter
  tail.
* Bad: the claimed spec list is hand-balanced and can drift as specs grow. A renamed or
  deleted claimed spec fails `test/select-fixture-bundles-shards.test.js` (and would
  fail its job loudly, not silently).

### Confirmation

* `test/select-fixture-bundles-shards.test.js`: a shard owns no dir, its claimed specs
  exist, owner plus shard cover the dir exactly once, and a recording-only change
  selects both jobs.
* The unchanged `test/select-fixture-bundles.test.js` still passes, including the
  one-bundle-per-dir guard and the Android-leg gating checks.
* In CI, `recording` and `recording-2` both run on every OS and pass the gate, and each
  managed-boot leg passes with at least one PASS.

## Pros and Cons of the Options

### A: spec-file shards and gate-based legs

* Good: no file moves; new specs need no edits; existing guards hold.
* Bad: the shard list needs occasional rebalancing.

### B: new group dirs

* Good: no selector changes.
* Bad: moves fixture files, which this change must not do, and leaves two dirs for one
  feature area.

### C: automatic N-way split

* Good: no hand-maintained list.
* Bad: poor balance with one dominant spec, and more jobs on the capped macOS pool.
