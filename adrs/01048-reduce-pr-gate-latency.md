---
status: accepted
date: 2026-07-12
decision-makers: doc-detective maintainers
---

# Reduce PR-gate latency: cached installs, 4-cell matrix, sharded mocha, bundled fixture jobs

## Context and Problem Statement

The PR gate ([`npm-test.yaml`](../.github/workflows/npm-test.yaml) → [`test.yml`](../.github/workflows/test.yml)
+ [`fixtures.yml`](../.github/workflows/fixtures.yml)) took ~35–40 minutes wall clock. Measured on a
representative green run (29197151761):

* **Critical path**: the Windows node-24 mocha cell at 26.1 min — `npm test` 18.4 min (serial mocha
  over ~120 files) + `doc-detective install all` 5.0 min (browsers/drivers re-downloaded every run,
  every cell) + ~2 min build/ci. `coverage-merge` waits on the whole matrix.
* **Queueing**: 54 jobs per PR contend for hosted-runner concurrency (15 jobs each on the scarce
  Windows and macOS pools); ~9 min of wall clock was queue time, not work.

ADR 01022 already fanned the fixture specs out per feature to kill a 90-minute Windows monolith;
this decision tunes the resulting shape: the mocha half is now the long pole, and the fan-out's job
count is itself a latency cost via runner-pool contention.

## Decision Drivers

* PR feedback latency: wall clock is the metric, not runner minutes.
* Preserve every gate guarantee that matters: cross-OS execution, PASS/SKIPPED-only fixtures,
  required-PASS legs, coverage ratchets, dog-fooding the GitHub Action against the PR's own build.
* Keep ADR 01022's invariant: no job anywhere near a monolithic timeout.
* Don't regress the cold paths that CI deliberately exercises (android lazy bootstrap, `install
  android`, WDA build caching).

## Considered Options

* **A — Four coordinated levers** (chosen): (1) persist the Doc Detective install cache across runs,
  (2) trim the node matrix to the full OS grid on node 24 + one ubuntu node-22 cell, (3) split each
  matrix cell's mocha suite into two weighted shards, (4) bundle fast fixture groups into shared
  jobs.
* **B — Pay for larger/more runners.** Zero engineering, ongoing cost; doesn't fix the serial mocha
  pass.
* **C — Path-filter the fixture matrix per PR** (only run affected groups). Highest per-PR savings
  but a wrong source-path→group mapping fails silently; deferred, not rejected.

## Decision Outcome

Chosen option: **A**, landed as three PRs (workflow caching + matrix trim; mocha sharding; fixture
bundling — this file).

1. **Cached installs.** `DOC_DETECTIVE_CACHE_DIR` is pinned to `~/.dd-cache` and persisted with
   `actions/cache` in the test matrix and the general fixture matrix, making `install all` and the
   per-job JIT installs check-and-skip. The key rotates on ISO week because browser channels float
   (`stable`/`latest`) and a present-but-outdated browser is warn-only — it never re-downloads — so
   a cache restored across weeks would pin old browsers forever. The whole dir is one cache unit so
   `runtime/node_modules` always travels with `runtime/package.json` + `installed.json` (the
   npm-prune hazard, [`src/runtime/AGENTS.md`](../src/runtime/AGENTS.md)). The three android jobs
   stay uncached on purpose — they exist to prove the cold bootstrap paths.
2. **4-cell matrix.** Node-line behavior is OS-independent (the fixture jobs already pin node 24 on
   that basis), so the full OS grid runs node 24 only, plus a single ubuntu node-22 cell. **This
   narrows the coverage union's inputs**: Windows/macOS node-22 slices no longer feed
   `coverage-merge`. Node-24 slices from those OSes still cover the OS-specific branches, so the
   honest-union policy (ADR 01017 as amended by ADR 01022) is intact; if the measured union dips,
   `coverage-thresholds.json` is re-baselined per the established procedure.
3. **Sharded mocha.** [`scripts/run-test-shard.cjs`](../scripts/run-test-shard.cjs)
   deterministically partitions `test/*.test.js` into two weighted buckets per cell (greedy
   bin-packing; known-heavy browser/Appium/recording suites carry explicit weights, everything else
   defaults to 1 so new files auto-include). Each shard self-provisions the 8092/8093 servers via
   mocha's root hooks and uploads a shard-suffixed `raw-coverage-*` artifact; the merge job unions
   shards, and shard₁ ∪ shard₂ equals the unsharded cell's coverage, so the ratchet is unaffected.
   [`test/run-test-shard.test.js`](../test/run-test-shard.test.js) asserts the partition is
   deterministic, complete, disjoint, balanced, and rename-rot-proof.
4. **Bundled fixture jobs (amends ADR 01022's one-job-per-group shape).** Groups keep their own
   `test/core-artifacts/<group>/` directories, but the CI matrix maps **bundles** → jobs: heavy or
   special-cased groups stay solo (`interactions`, `recording`, `apps`, `apps-ios`,
   `mobile-web-ios`), fast groups share a job via a comma-joined `input` (`nav-capture`,
   `web-plumbing` = routing+http+guards, `proc-sessions`, `android-skip` = the two skip-tolerant
   android groups). The action passes `input` verbatim to `--input`, which splits on commas. iOS
   groups must stay solo: the action's `ios: auto` spec-scan resolves the input as one literal path,
   and a comma-joined value resolves to a nonexistent path (scan returns false), which would skip
   the WDA cache. 42 general fixture jobs become 27; total gate ~40 jobs instead of 54.

### Consequences

* Good: critical path drops from ~26 min to a projected ~12–13 min (cached install + half-suite
  shard); queue pressure drops with ~14 fewer jobs and faster fixture setup.
* Good: every fixture spec still runs on every OS, on the PR's own linked build, through the GitHub
  Action; PASS/SKIPPED policy and the required-PASS legs are unchanged.
* **Cost/watch — bundled zero-spec blind spot.** `check-fixture-results.cjs` fails only a *fully*
  empty run. In a multi-directory bundle, one typo'd directory contributes zero specs while the
  others still produce results, so a typo can pass silently. Mitigation: reviewers check bundle
  `input` paths; the fixture-output artifact shows which spec files actually ran.
* Cost: browser versions are up to one ISO week stale in CI (cold refresh weekly per OS). A
  brand-new stable Chrome regression can land up to a week late; acceptable for a PR gate — the
  release gate re-runs the same workflows and can be dispatched after a cache-key rollover.
* Cost: node-22 execution narrows to ubuntu (mocha matrix). The published package still declares
  `engines: >=22.12` and node-22 unit coverage remains in the gate.
* Neutral: `npm test` is unchanged locally; sharding is a CI-only concern.

### Confirmation

* A green PR-gate run shows: 8 mocha shard jobs + 27 general fixture jobs + 3 android jobs + 2
  ratchets; no job near its timeout; wall clock ≤ ~20 min.
* Second run on a warm cache: the `install all` step completes in seconds and fixture-job JIT
  installs report already-up-to-date.
* Each bundle's `fixture-output-*` artifact contains specs from **every** directory in its `input`.
* `coverage-merge` downloads 8 shard artifacts and the ratchet passes at the pre-shard percentage
  (or is explicitly re-baselined for the node-22 narrowing).

## Pros and Cons of the Options

### A — Four coordinated levers (CHOSEN)

* Good: attacks all three latency sources (serial suite, repeated downloads, queue contention) while
  keeping every gate guarantee.
* Good: each lever is independently revertable (drop the shard dimension, drop the cache step,
  re-split a bundle) without disturbing the others.
* Bad: more workflow machinery (shard script + weights to maintain, bundle sizing to re-check as
  groups grow).
* Bad: the bundled zero-spec blind spot above.

### B — Larger runners / higher concurrency

* Good: zero engineering; helps every job at once.
* Bad: recurring cost; does nothing about the 18-minute serial mocha pass on the critical path;
  orthogonal (can still be added later).

### C — Path-filtered fixture matrix

* Good: biggest per-PR savings for narrow PRs (most PRs touch one feature area).
* Bad: a stale/wrong path→group mapping silently skips the exact gate a change needed; requires
  careful mapping plus a full-matrix fallback trigger. Deferred until the simpler levers prove
  insufficient.
