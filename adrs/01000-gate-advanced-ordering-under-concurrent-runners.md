---
status: accepted
date: 2026-06-22
decision-makers: doc-detective maintainers
---

# Gate advanced test ordering (beforeAny / setup / cleanup / afterAll) under concurrentRunners

## Context and Problem Statement

Doc Detective supports four advanced ordering fields: config-level `beforeAny` / `afterAll`
(setup/teardown specs that wrap the whole run) and test-level `before` / `after` (setup/cleanup
steps that wrap a single test). With `concurrentRunners > 1` the local runner flattens
`beforeAny` + `input` + `afterAll` specs into a single shared worker pool, so a setup spec, a main
test, and a teardown spec can execute at the same time — breaking the ordering contract these
fields exist to provide. Separately, test-level `after` (cleanup) steps are appended to a test's
step list with no marker, so when an earlier step fails the runner's skip-on-failure routing marks
the cleanup steps SKIPPED and they never run. How do we make these four fields behave
deterministically regardless of concurrency?

## Decision Drivers

* Ordering guarantees must hold identically at `concurrentRunners` 1 and N.
* `concurrentRunners: 1` (the default) must remain byte-identical in behavior and report output.
* Cleanup must be best-effort and run even after failures (it exists to restore environment state).
* Reports must keep input order and must not leak internal implementation markers.
* No breaking changes to public schemas or the report shape.

## Considered Options

* **A. Phase-gated barriers + hard-routed cleanup marker** (chosen).
* **B. Force `concurrentRunners: 1` whenever any ordering field is set.**
* **C. Encode ordering as job dependencies in a single pool (DAG scheduler).**

## Decision Outcome

Chosen option: **A**, because it preserves concurrency *within* each phase, keeps the default path
unchanged, and is the smallest change that satisfies every driver. B throws away the user's
requested parallelism. C is far more machinery than the three-phase structure requires.

Behavior decided:

1. **`beforeAny`** — all `beforeAny` specs complete before any other test starts.
2. **setup (`before`)** — steps prepend to the test; the report shows the base test starting with
   the setup spec's steps, under the base test's identifiers (single logical test).
3. **cleanup (`after`)** — steps run after the test no matter what, including after an earlier
   step failed; a failing cleanup step does not skip later cleanup steps; cleanup results still
   count toward the test verdict.
4. **`afterAll`** — all `afterAll` specs run after every test in every spec finishes.

Implementation: tag each detected spec with an internal `_phase`
(`beforeAny`/`main`/`afterAll`); in the runner, partition the flat job list by `_phase` and run
three sequential `runConcurrent` barriers (warm-up, recording-concurrency, and Appium-pool sizing
stay computed over the full job list). Tag appended cleanup steps with an internal `_fromAfter`
that reaches runtime; the skip-on-failure gate ignores `_fromAfter` steps, and a `_fromAfter`
failure does not set the cascade flag. `_phase` and `_fromAfter` are stripped before reporting.

### Consequences

* Good: deterministic ordering at any concurrency; default path unchanged; cleanup reliably runs.
* Good: concurrency preserved within a phase (multiple `beforeAny` specs still parallelize).
* Bad: a slow `beforeAny`/`afterAll` phase serializes against the rest of the run (inherent to
  the barrier guarantee).
* Neutral: `beforeAny` failures do not abort later phases (run-everything preserved); `afterAll`
  always runs. A future opt-in fail-fast is left as a follow-up.
* Exception: an `unsafe` cleanup step is still skipped when `allowUnsafeSteps` is false. The
  safety gate runs before the hard-routing check and intentionally wins — "cleanup runs no matter
  what" does not override the user's explicit refusal to run unsafe steps.

### Confirmation

Red→green unit tests in `test/core-ordering.test.js` (barrier ordering via a runShell log
side-channel under `concurrentRunners: 4`; cleanup-runs-on-failure; non-cascading cleanup;
setup-prepend; marker-leak guard) plus PASS/SKIPPED-only fixtures in
`test/core-artifacts/ordering/`. The combined core suite must still report zero spec failures.

## Pros and Cons of the Options

### A. Phase-gated barriers + cleanup marker
* Good: smallest change; preserves intra-phase concurrency; default path untouched.
* Bad: adds two internal markers that must be stripped from reports.

### B. Force serial when ordering fields are set
* Good: trivial to implement.
* Bad: silently discards requested parallelism; large perf regression for big suites.

### C. Dependency-graph scheduler
* Good: most general.
* Bad: large new scheduler surface for a three-bucket problem; higher risk and maintenance.

## More Information

Internal markers are intentionally absent from public schemas. See the runner phase loop in
`src/core/tests.ts` and phase tagging in `src/core/detectTests.ts`.
