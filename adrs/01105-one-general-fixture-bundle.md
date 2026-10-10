---
status: proposed
date: 2026-10-10
decision-makers: doc-detective maintainers
---

# Run the fast fixture groups as one `general` bundle

## Context and Problem Statement

ADR 01048 bundled the fast fixture groups into four jobs per OS (`nav-capture`, `interactions`,
`web-plumbing`, `proc-sessions`) and kept the heavy groups solo. Since then, the PR gate's wall
clock has settled at a median of **26.9 min**. That median covers the 13 most recent green
full-matrix PR runs.
The middle half spans 23.4–30.5 min, and the slowest run took 43.0. In 12 of those 13 runs, the
last job to finish was an iOS fixture leg on macOS (`apps-ios` or `mobile-web-ios`).

Those legs are long (16–19 min of run time), but they also start late. On run 38078490340, macOS
ran 11 jobs totaling 84 job-minutes against a pool that runs about 5 at once. `apps-ios` started at
4.3 min and `mobile-web-ios` at 6.9 min, behind short fixture jobs that had taken the slots first.
The worst macOS queue wait per run ranged from 8 to 23 min. GitHub doesn't assign queued jobs to
runners in matrix order. Moving the iOS bundles to the front of the list doesn't reliably help.

Each fixture job pays about 3–4 min of fixed setup (`dd-cache` restore, `npm ci`, build, link)
before its first spec. Each of the four fast bundles runs only 2–4 min of fixtures, so most of
their macOS job-minutes are setup.

## Decision Drivers

* PR feedback latency: wall clock is the metric (ADR 01048).
* Keep every gate guarantee. Every spec runs on every OS it ran on. The required-PASS legs and the
  PASS/SKIPPED-only policy don't change.
* Fewer macOS jobs, so the iOS legs stop queueing behind short jobs.

## Considered Options

* **A. Merge the four fast bundles into one `general` bundle** (chosen).
* **B. Reorder `BUNDLES` so the iOS bundles come first.** No job-count change. GitHub doesn't
  dispatch in matrix order: `apps-ios` was 8th of 9 and started 4th, `recording` was 5th and
  started last.
* **C. Make the fast macOS jobs `needs:` the iOS jobs.** `needs:` waits for completion, not start,
  so the fast jobs would finish after the ~19-min iOS legs and become the new critical path.

## Decision Outcome

Chosen option: **A**. `scripts/select-fixture-bundles.cjs` defines one `general` bundle with a
30-min timeout. It covers `navigation`, `capture`, `interactions`, `routing`, `http`, `guards`,
`reporters`, `process`, and `sessions`. The general fixture matrix drops from 9 bundles × 3 OSes to
6 × 3. Each PR now runs 8 macOS jobs instead of 11. Windows and Ubuntu each shed 3 jobs too.

### Consequences

* Good: about 9–12 macOS job-minutes of duplicated setup are gone per PR. Also, 3 fewer macOS jobs
  compete with the iOS legs for the 5 slots.
* Bad: the zero-spec blind spot from ADR 01048 widens. A typo'd directory in a nine-directory
  `input` is easier to miss, and the gate fails only a fully empty run. The
  "covers every fixture group directory on disk exactly once" test still catches a missing or
  misspelled directory.
* Bad: path-filtered narrowing (ADR 01055) is coarser. A PR touching only `http/` fixtures now runs
  all nine fast groups instead of four.
* Bad: one flaky fast group fails the whole `general` leg, and a rerun repeats all nine groups.
* Neutral: on Windows, the slowest OS for these groups, the merged job runs the sum of the four
  fixture steps. That sum is still well under the iOS critical path and the 30-min timeout.

### Confirmation

* Three green full-matrix runs of this change's PR, with a median wall clock at least 4 min below
  the 26.9-min baseline. 4 min is the smallest difference a median of 3 runs can separate from
  queue noise on the shared macOS pool.
* The `general` legs' `fixture-output-*` artifacts contain specs from all nine directories.
* No `general` leg comes within 10 min of its 30-min timeout.

## Pros and Cons of the Options

### A. One `general` bundle

* Good: cuts macOS demand no matter what order GitHub dispatches jobs in.
* Good: removes setup overhead on all three OSes, not just macOS.
* Bad: coarser failure isolation and path narrowing, and a wider zero-spec blind spot.

### B. Reorder the bundle list

* Good: a one-line change with no loss of isolation.
* Bad: no measurable effect, since dispatch order isn't matrix order.

### C. Chain the fast jobs behind the iOS jobs

* Good: guarantees the iOS legs get slots first.
* Bad: moves the critical path to the chained fast jobs, so wall clock gets worse.
