---
status: accepted
date: 2026-06-14
decision-makers: doc-detective maintainers
---

# Concurrent test runners (parallel context execution)

## Context and Problem Statement

Doc Detective executes each resolved test context (a browser/platform pairing) sequentially, so a
suite with many contexts pays the full driver-startup-plus-run cost once per context, end to end. An
earlier worker-pool/`TestRunner` parallelism attempt in the standalone `core` repo (commits
`2f31442`, `43251a8`) was **added and then reverted** — no parallelism shipped on that branch. With
the repos merged into one monorepo, the question returned: should the runner execute contexts in
parallel, and under what configuration knob?

## Decision Drivers

* Large multi-context suites are dominated by serial per-context startup/run latency.
* Parallelism must be opt-in and bounded so it does not exhaust drivers/Appium/display resources.
* The default (serial) behavior and report shape must remain unchanged.
* The earlier reverted attempt showed parallelism needs a controlled re-land, not a branch experiment.

## Considered Options

* **A. Re-land parallel context execution behind a `concurrentRunners` config knob** (chosen).
* **B. Leave execution serial (keep the revert).**
* **C. Unbounded parallelism (one runner per context, no cap).**

## Decision Outcome

Chosen option: **A**, because parallel context execution is the right scaling answer for large
suites, and gating it behind an explicit, bounded `concurrentRunners` setting keeps the default safe
while letting users dial in throughput. This is the monorepo re-land of the reverted Seq 180 attempt,
done as a controlled change with the Appium configuration and post-run hints reworked to suit.

Contract decided:

* `concurrentRunners` config controls how many test runners execute contexts in parallel; the
  default preserves serial behavior.
* The large `tests.ts` rework drives contexts through the concurrent path; Appium configuration is
  adjusted to support multiple concurrent drivers, and new post-run hints surface the concurrency.

Implementation in `src/core/tests.ts`; config field `concurrentRunners`.

### Consequences

* Good: large suites complete substantially faster via parallel contexts.
* Good: opt-in and bounded — the default run is unchanged.
* Neutral: shared-resource ordering (recordings, advanced ordering fields) now needs explicit gating
  under concurrency — addressed separately (see `01000`).
* Bad: concurrency adds scheduling/resource-contention complexity that the serial path never had.

### Confirmation

Shipped in `dd248197` (PR #332); `concurrentRunners` config and the concurrent execution path in
`src/core/tests.ts`.

## Pros and Cons of the Options

### A. `concurrentRunners`-gated parallel execution
* Good: bounded, opt-in throughput; default unchanged.
* Bad: introduces scheduling and resource-contention concerns.

### B. Stay serial
* Good: simplest; no contention.
* Bad: leaves large suites slow; ignores a real scaling need.

### C. Unbounded parallelism
* Good: maximum theoretical throughput.
* Bad: exhausts drivers/Appium/display; unstable on real machines.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `dd248197` (PR #332); monorepo
re-land of the reverted core attempt (`2f31442`, `43251a8`). Inventory ref: BACKFILL-INVENTORY.md
Seq 242 (antecedent: dropped Seq 180). Related: `00119` (`concurrentRunners` schema contract),
`01000` (gating advanced ordering under `concurrentRunners`), `00171` (Appium warm-up guard).
