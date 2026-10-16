---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Run the Windows mocha cell as three shards, packed by measured time

## Context and Problem Statement

Each test-matrix cell splits the mocha suite into two shard jobs
(`scripts/run-test-shard.cjs`), packed greedily by hand-set `WEIGHTS`. On `windows-latest`
the mocha step is the slowest in the grid: 6–11 min per shard, with shard jobs of 9–15 min.

Two things limit it. First, the weights don't track reality. `runTests.test.js` weighs 1 but
takes 35–130 s, and `core-screenshot.test.js` weighs the same as `appium-port-conflict.test.js`
at about twice the time. So the heavy files pile onto one shard. Second, `core-core.test.js`
alone is ~250 s on Windows, about a quarter of the suite. No packing can get a shard below it
while it's one unit.

The required checks name `Test (ubuntu-latest, node 22, shard 1|2)`, and the coverage-merge
job unions every shard's raw-coverage artifact. Both must keep working, and every test must
still run on every OS/node cell it runs on today.

## Decision Drivers

* Cut the slowest cell without dropping or editing any test.
* Don't move the 2-shard layout of the other cells. Its pairings encode known flake
  avoidance, such as keeping `detecttests-coverage` away from `core-core`.
* macOS runners are a 5-slot pool shared with the iOS fixture legs. A job costs ~2 min of
  setup, so an extra macOS job costs more than it saves.
* Coverage must still union to the full suite's.

## Considered Options

* **A. Three shards on Windows only, packed by measured seconds, with `core-core` split by
  top-level describe** (chosen).
* **B. Three shards on every cell.** It adds a job on the capped macOS pool for ~2 min saved
  there, and on Linux, where shards are already 3–5 min.
* **C. Re-weight `WEIGHTS` for every cell.** It fixes the packing everywhere, but it reshuffles
  the 2-shard layout that the other cells' flake history is built on.

## Decision Outcome

Chosen option: **A**.

* `test.yml` gives the Windows cell `shards: 3` and a third shard job. Every other cell runs
  `shards || 2`, which is unchanged.
* `run-test-shard.cjs` keeps `partition()` and `WEIGHTS` exactly as they were for 2 shards. At
  3+ shards a new `planShard()` packs by a measured-seconds table (`SECONDS`, from Windows CI
  logs), with unlisted files at 2 s. It also splits each `SPLITS` file into two pieces: one
  top-level describe (`--grep '^<title> '`), and the rest of the file (the same grep with
  `--invert`). For `core-core.test.js` that's `getRunner() function` (~110 s) and the rest
  (~140 s).
* A piece runs in its own mocha process after the shard's whole-file run, because `--grep`
  applies to a whole process. The shard fails if any run fails, and every run executes.
  `NODE_V8_COVERAGE` is inherited by each process, so the coverage union is unchanged.

### Consequences

* Good, measured on PR #745 (run 38581264149): the three Windows shards ran 235 s, 232 s,
  and 234 s of mocha. Two `main`-equivalent runs took 371–676 s per shard. The
  Windows shard jobs took 5.1–6.2 min, down from 8.4–15.3 min.
* Good: other cells' layouts are byte-for-byte what they were. The required contexts still
  exist under the same names.
* Bad: one more Windows job per run, ~3–4 min of setup on a runner slot.
* Bad: `SECONDS` and the split weights are measurements that age. A renamed file or describe
  fails `test/run-test-shard-pieces.test.js`. Drift in timings only costs balance.
* Neutral: on Windows, the `getRunner()` describe now runs without the rest of `core-core`
  before it in the same process. It provisions its own sessions, and CI pre-warms the browser
  cache with `install all`.

### Confirmation

* `test/run-test-shard-pieces.test.js` checks the following. The 2-shard plan equals
  `partition()`. At 3 and 4 shards every file runs exactly once, and each split file runs as two
  complementary pieces. No run is empty. The split describes exist at the top level. The three
  heaviest units land on different shards.
* The unchanged `test/run-test-shard.test.js` still passes.
* In CI the three Windows shard jobs pass, and the root coverage ratchet still passes on the
  merged union.

## Pros and Cons of the Options

### A: Windows-only 3 shards, measured packing, describe split

* Good: targets the one slow cell. Other cells are untouched.
* Bad: two packing tables to keep honest.

### B: 3 shards everywhere

* Good: one rule.
* Bad: it loads the macOS pool, which already sets the PR gate's wall clock.

### C: re-weight `WEIGHTS`

* Good: one table.
* Bad: it moves every cell's 2-shard layout and risks re-pairing suites known to interfere.
