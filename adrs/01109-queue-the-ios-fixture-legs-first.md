---
status: proposed
date: 2026-10-10
decision-makers: doc-detective maintainers
---

# Queue the macOS iOS fixture legs ahead of the other legs

## Context and Problem Statement

The macOS legs of `apps-ios` and `mobile-web-ios` are the PR gate's critical path. Each runs
16–19 min, and one of them finished last in 12 of the 13 baseline runs (ADR 01105). The macOS pool
runs about 5 jobs at once, and fewer when other workflows hold slots. Every fixture leg queues the
moment the `select` job finishes. GitHub doesn't assign queued jobs to runners in matrix order, so
the iOS legs often wait behind shorter legs from the same run.

ADR 01105 cut the run's macOS jobs from 11 to 8 and didn't fix this. In its third measured run,
`recording`, `general`, and `apps` took macOS slots at 0.5–1.8 min. `apps-ios` waited until
6.5 min, finished at 25.5 min, and set the run's wall clock. Its first measured run had the same
problem, with both iOS legs starting after 12 min.

## Decision Drivers

* PR feedback latency: wall clock is the metric (ADR 01048).
* The fix must work whatever order GitHub assigns runners in.
* Keep one definition of the fixture steps and one source of truth for the legs.
* Every spec still runs on every OS, and the required-PASS legs don't change.

## Considered Options

* **A. Queue the iOS legs first** (chosen). Split the macOS iOS legs into their own job that queues
  when `select` finishes. Hold the other legs behind a 60-second `stagger` job.
* **B. Make the other legs `needs:` the iOS job.** `needs:` waits for completion, not start. The
  other legs would finish after the iOS legs and become the critical path.
* **C. Cut macOS jobs to 5 or fewer** so nothing queues. That means merging the heavy groups or
  dropping a mocha shard, and it still loses to slots held by other workflows.

## Decision Outcome

Chosen option: **A**.

* `scripts/select-fixture-bundles.cjs` now owns the OS list. It emits two `{"include": [...]}`
  leg lists: `--legs-ios` (the macOS legs of `prebootIos` bundles) and `--legs-rest` (all
  others). Its old `--matrix` mode had no other caller and is removed.
* `fixtures-ios` runs the `--legs-ios` legs and needs only `select`. It skips itself when
  narrowing drops both iOS bundles, since an empty matrix is an error.
* `fixtures` runs the `--legs-rest` legs and needs `select` and `stagger`. `stagger` is an ubuntu
  job that sleeps 60 seconds.
* Both jobs share one step list through a YAML anchor. A test asserts they stay identical.

Job names, artifact names, and the required-PASS conditions don't change.

### Consequences

* Good: the iOS legs reach the macOS queue about a minute before the other legs. They take free
  slots first and sit ahead of the other legs when the pool is full.
* Bad: every non-iOS leg starts about 1–1.5 min later. The slowest of them (`recording` and `apps`
  on macOS, about 10 min) still ends well before the iOS legs.
* Bad: the stagger is a fixed sleep, not a real priority. It costs about a minute of ubuntu time
  per run. If the pool is busy for longer than that minute, it can still put the iOS legs behind
  another workflow's jobs.
* Neutral: when narrowing drops the iOS bundles, the stagger still runs and delays the remaining
  legs by about a minute.

### Confirmation

* Three green full-matrix runs of this change's PR. Their median wall clock is at least 4 min
  below round 1's median of 25.5 min.
* In each run, both macOS iOS legs start before any other macOS fixture leg.
* A PR narrowed to a non-iOS group skips `fixtures-ios` and still runs its other legs.

## Pros and Cons of the Options

### A. Queue the iOS legs first

* Good: attacks the measured cause (late iOS start) without merging or dropping any coverage.
* Bad: a sleep-based ordering, and a second job definition held together by an anchor and a test.

### B. Chain the other legs behind the iOS job

* Good: strict ordering.
* Bad: makes wall clock worse.

### C. Cut macOS jobs to 5 or fewer

* Good: no queueing within the run.
* Bad: coarser failure isolation, and it still loses slots to other workflows.
