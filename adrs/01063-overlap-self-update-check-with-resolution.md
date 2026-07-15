---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# Overlap the self-update check with detection/resolution, join before the first test

## Context and Problem Statement

On the default `doc-detective` run, `runTestsHandler` (`src/cli.ts`) performs a startup self-update:
it calls `checkForUpdate(currentVersion)` (an npm-registry GET, bounded at 3 s) and, if a newer
version exists, `selfUpdate(...)` — which `npm install -g`s the new version and re-execs the process.
This ran **serially, awaited before any other startup work**, so a run paid up to ~3 s of registry
latency up front, doing nothing else, before it even began detecting and resolving tests
(`docs/design/run-performance.md`, item 2.3).

Detection and resolution (`detectAndResolveTests` inside `runTests`) execute **no tests** — they read
and validate spec files and resolve contexts. That is exactly the kind of unavoidable work the
registry round-trip could hide behind. The question is how to overlap the check with resolution
**without weakening the guarantee that an available update is applied before the run executes** —
the whole point of a startup self-update is that you don't run the old version's tests when a new
version is one command away.

## Decision Drivers

* Hide the up-to-3 s registry latency behind work that has to happen anyway (detection/resolution).
* Preserve the ordering guarantee exactly: if a newer version is found, `selfUpdate` still re-execs
  **before the first test runs** (and before any dry-run output is emitted).
* No new configuration surface: `config.autoUpdate` (and `DOC_DETECTIVE_SKIP_AUTO_UPDATE`, `CI`)
  already gate the check from resolved config; don't add a flag.
* Correctness of concurrency: the network check may overlap resolution, but the *re-exec decision*
  must be a synchronous barrier before execution — never run tests in the parent while a child
  re-exec also runs them.

## Considered Options

* **A. Start `checkForUpdate` concurrently; join (and conditionally `selfUpdate`) inside `runTests`
  before the first test** (chosen). The CLI kicks off the registry check without awaiting it and
  hands `runTests` an `updateJoin` closure; `runTests` awaits `updateJoin` after resolution and
  before the dry-run/preflight/execution.
* **B. Run the whole check *and* `selfUpdate` concurrently** with resolution, without a join barrier.
* **C. Leave it serial** — accept the latency.

## Decision Outcome

Chosen option: **A**. The CLI starts only the **registry check** concurrently (`updateCheck`
promise), so its latency overlaps `getResolvedTestsFromEnv` and the detection/resolution `runTests`
does. The **decision to re-exec is deferred** into an `updateJoin` closure that `runTests` awaits at
a single barrier: immediately after `detectAndResolveTests` resolves and **before** the dry-run JSON
print, the JIT preflight, and `runSpecs`. On a newer version, `selfUpdate` re-execs (`process.exit`)
at that barrier — so no test (and no dry-run output) is ever produced by the parent when an update is
pending. When auto-update is gated off, `updateJoin` is `undefined` and the barrier is a no-op.

Option **B** was rejected as **incorrect**: `selfUpdate`'s re-exec path (`runChild` in
`src/runtime/selfUpdate.ts`) spawns the new version with inherited stdio and **awaits the child
running the entire command to completion** before `process.exit`. Running that concurrently with the
parent's own detection→execution would double-execute the run (child *and* parent both run tests) and
race on `process.exit`. Only the *check* is safe to overlap; the *re-exec* must be a barrier.

Option **C** keeps today's cost for no benefit.

### The ordering guarantee (what is preserved)

* The registry check *starts* earlier (concurrent with resolution) but its result is *joined* before
  execution.
* If `newer && latest`, `selfUpdate` runs at the join and re-execs before the first test — identical
  observable outcome to the old serial code, minus the latency.
* Because the re-exec's child sets `DOC_DETECTIVE_SKIP_AUTO_UPDATE=1`, no update loop is possible
  (unchanged from before).
* One deliberate ordering shift: `getResolvedTestsFromEnv` (the DOC_DETECTIVE_API fetch) now runs in
  the parent *before* the join, where previously the whole update ran first. If an update is pending,
  the parent may perform that fetch and then re-exec — harmless (the child re-fetches); the "update
  before any test executes" guarantee is unaffected because that fetch executes no tests.

### Consequences

* Good: up to ~3 s of registry latency is hidden behind resolution on every auto-updating run.
* Good: no new config/preference plumbing — the existing `autoUpdate`/`SKIP`/`CI` gate is unchanged.
* Neutral: the update's *effect* (re-exec on newer) is unchanged and still precedes the run; only its
  *latency* moved.
* Bad (accepted, negligible): on a pending-update run the parent may do slightly more work before
  re-execing (the API fetch above) than the old serial path did. The child re-does it; no test runs
  twice.

### Confirmation

* Red→green unit test in `test/cli-index-adapters-coverage.test.js`
  (`awaits options.updateJoin before dry-run output / test execution`): a stub `updateJoin` records
  that it was awaited exactly once and that no dry-run stdout had yet been emitted at join time —
  proving the barrier precedes both dry-run output and execution. On the pre-change code the option
  was ignored (never called), so the test fails.
* The `runTestsHandler` guard combinations (`autoUpdate`/`SKIP`/`CI`) remain covered offline by the
  existing `cli.ts — runTestsHandler branches` describe. The network/`process.exit` bodies of
  `checkForUpdate`/`selfUpdate` remain covered by `runtime/selfUpdate.ts`'s own module tests.

## Pros and Cons of the Options

### A. Concurrent check, deferred re-exec barrier inside runTests
* Good: hides latency; preserves the guarantee exactly; correct under concurrency.
* Bad: threads one `updateJoin` option from CLI into `runTests` (small surface addition).

### B. Fully concurrent check + selfUpdate, no barrier
* Good: maximal overlap.
* Bad: incorrect — `selfUpdate` runs the child to completion, so parent+child double-execute the run
  and race on exit.

### C. Leave serial
* Good: simplest; no change.
* Bad: keeps the up-to-3 s fixed startup latency for no reason.

## More Information

Design: `docs/design/run-performance.md` (Phase 2, item 2.3, and Decision 3). The re-exec mechanics
this decision depends on live in `src/runtime/selfUpdate.ts` (`selfUpdate` → `runChild` →
`process.exit`).
