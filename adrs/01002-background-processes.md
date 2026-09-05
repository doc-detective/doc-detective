---
status: accepted
date: 2026-06-22
decision-makers: doc-detective maintainers
---

# Long-running background processes for runShell/runCode

## Context and Problem Statement

`runShell` and `runCode` are blocking. Each spawns a command, waits for it to exit, then asserts on
the exit code, stdio, or saved output. There is no way to start a **long-lived** process, keep it
running while many tests execute against it, and tear it down at cleanup. Think of a Docker
container, a dev server, or a database.

Authors work around this today with external scripts, or `beforeAny` and `afterAll` shell steps that
background a process with `&` and `disown`. But the runner then has no handle on it. Nothing waits
for it to become ready, so the first test races startup. Nothing tears it down, so it orphans. And
on Ctrl-C the process leaks. How do we let a test run own a long-lived process end-to-end? That
means start, ready-gate, reuse, and guaranteed teardown, with no breaking change to the step model.

## Decision Drivers

* Generic: any long-running process, not Docker-specific.
* Readiness must be explicit, so tests don't race a half-started process. That means "the port is
  bound", "the log says ready", "HTTP 200", or a delay.
* Teardown must be guaranteed: explicit (a step) **and** automatic (run end, and on Ctrl-C/SIGTERM).
* No breaking changes to existing `runShell`/`runCode` behavior; blocking mode stays byte-identical.
* Fit the existing run lifecycle (`beforeAny`/`afterAll`, the Appium-style run-owned resource that is
  started once and torn down once).

## Considered Options

* **A. `background` object + `waitUntil` gate + run-level registry + `stopProcess` step** (chosen).
* **B. A dedicated `service`/`daemon` step type** separate from `runShell`/`runCode`.
* **C. Config-level `services` block** declaring long-lived processes outside the step stream.

## Decision Outcome

Chosen option: **A**. It reuses the two step types authors already know. It also places start and
stop in the step stream, so a `beforeAny` start with an `afterAll` stop reads naturally. It models the
process as a run-owned resource exactly like Appium. B duplicates all of `runShell` and `runCode`'s
command and option surface in a third step type. C moves process lifecycle out of the visible test
flow, and couples it to config. That's harder to reason about per-spec, and doesn't compose with
routing.

Mechanism:

1. **`background` object** on `runShell` and `runCode`, in `src/core/tests/runShell.ts` and
   `runCode.ts`. A `background: { name, waitUntil? }` object signals background mode by its
   *presence*. There is no `background: false`; omit it for a normal blocking run. It spawns
   non-blocking through `spawnBackgroundCommand`, and returns as soon as the process is ready. In
   background mode the exit-code, stdio, and saved-output assertions don't apply. Step-level
   `timeout` is reinterpreted as the **readiness deadline**. `name` is required inside `background`,
   and keys the process in the registry. A duplicate name FAILs rather than double-spawning. An
   earlier iteration used a boolean `background: true` with sibling `name` and `readyWhen`.
   Collapsing the three into one cohesive object keeps the related fields together, and makes "is
   this backgrounded?" a single presence check.
2. **`waitUntil`** is an optional gate inside `background`, in `src/core/utils.ts`. Its conditions
   combine with AND, borrowing goTo's `waitUntil` terminology. `port` is a TCP connect on an
   integer. `stdio` is a substring or `/regex/` over combined stdout and stderr, mirroring
   runShell's `stdio` field. `httpGet` is a URL string, ready on any 2xx. And `delayMs` is a fixed
   minimum wait. Any combination may be given, and every condition present must pass. The fields are
   flat, with no `host`, `pollIntervalMs`, `statusCodes`, or `stream` knobs, to match runShell's
   other fields. Readiness is raced against process exit, so a process that dies during startup
   FAILs fast instead of waiting the whole deadline.
3. **Run-level process registry** owned by `runSpecs`, in `src/core/tests.ts`. It's a `Map` threaded
   through `runContext` or `runRoutedSpec` → `runStep` → the step handlers. So a process started in
   one spec or test survives for the whole run. Start in `beforeAny`, use across `main`, and stop in
   `afterAll`.
4. **`stopProcess` step**, in `src/core/tests/stopProcess.ts`, with a new `stopProcess_v3` schema.
   The value is the process `name`, a string. The step tree-kills the process and deregisters it.
   Stopping a process that isn't running is a no-op that still PASSes, whether it was already
   stopped or never started. There is no failure mode for a missing process, and no object form or
   `ignoreMissing` flag to configure.
5. **Guaranteed teardown**, in `src/core/tests.ts`. The existing Appium-teardown `finally` also
   sweeps any still-registered process, for run-end auto-cleanup. New `SIGINT` and `SIGTERM`
   handlers tear down background processes, Appium, and Xvfb on interrupt. The handlers are removed
   in the same `finally`, so repeated programmatic `runSpecs` calls don't accumulate listeners. This
   also fixes the pre-existing Appium-leak-on-Ctrl-C.
6. **`runCode` temp-script lifetime.** A backgrounded script is still being read by the interpreter
   after `runShell` returns. So its temp file deletion is deferred to teardown, instead of the
   immediate `finally` used in blocking mode.

## Consequences

* **Good.** A single run can stand up shared infrastructure once, run many tests against it, and
  tear it down deterministically. Readiness is an explicit contract, rather than `sleep` guesses.
* **Good.** Teardown is guaranteed on success, failure, run-end, and interrupt. The interrupt path
  also closes the prior Appium leak.
* **Trade-off.** A process that forks a daemon and then exits trips the "exited before ready" path
  and FAILs. Some Docker images and some databases do this. It's documented in the `waitUntil`
  schema, with guidance to use `port`, `httpGet`, or `delayMs` for those, rather than relying on the
  parent staying alive.
* **Trade-off.** `waitUntil.stdio` searches both streams as a single combined buffer, stdout then
  stderr, rather than a true temporal interleave. A match that depends on the cross-stream ordering
  of output may not behave as expected. It matches runShell's existing `stdio` semantics.
* **Neutral, and out of scope.** Cross-runner *shared* processes under `concurrentRunners` are not
  modeled. The registry is run-owned, and start and stop are single-owner. Per-runner instances and
  start-or-attach semantics are deferred, and the run-owned placement is forward-compatible with
  them.
* **Neutral.** `waitUntil` lives inside the `background` object, so it can't be set on a
  non-background step. An empty or omitted `waitUntil` means "ready as soon as spawned."

## Confirmation

* Unit tests live in `test/background-process.test.js`. `spawnBackgroundCommand` returns immediately
  and buffers output. Each condition, `port`, `httpGet`, `stdio`, and `delayMs`, resolves and times
  out correctly, and combined conditions all gate together. Readiness fails fast on early exit.
  `stopProcess` kills and deregisters, and no-ops with a PASS on a missing process. The real
  `runShell` and `runCode` background branches cover readiness, outputs, name collision,
  timeout-deregister, and deferred temp cleanup.
* Schema tests live in `src/common/test/validate.test.js`. Positive and negative cases cover
  `background`, `name`, every `waitUntil` condition, combined conditions, and the string-only
  `stopProcess`. Negatives include a non-object `background`, an unknown key in `background` or
  `waitUntil`, and an old object-shaped port. They also include an object-form `stopProcess`, a
  missing name, an out-of-range port, and a whitespace name.
* End-to-end, `test/background-runner.test.js` drives `runTests()` for explicit-stop and run-end
  auto-sweep. `test/core-artifacts/background-processes.spec.json` exercises every permutation
  through the canonical `test/core-core.test.js` fixture gate. That covers all `waitUntil`
  conditions, combined conditions, `stopProcess` by name, the missing-process no-op, auto-sweep, and
  `runShell` and `runCode` background. It must resolve PASS or SKIPPED across the CI matrix, on
  macOS, Linux, and Windows × node 22 and 24.

## Pros and Cons of the Options

### A. `background` object + `waitUntil` gate + run-level registry + `stopProcess` step

* Good, because it reuses the two step types authors already know, `runShell` and `runCode`. There's
  no new command or option surface to learn or maintain.
* Good, because start/stop live in the visible step stream, so `beforeAny` start / `afterAll` stop
  reads naturally and composes with routing.
* Good, because the process is a run-owned resource modeled exactly like Appium (started once, torn
  down once), reusing the existing teardown/finally machinery.
* Good, because `waitUntil` mirrors goTo's terminology and runShell's flat field conventions, so the
  readiness contract is familiar.
* Bad, because the lifecycle spans multiple steps and specs, starting here and stopping there. So a
  missing `stopProcess` relies on the run-end sweep, rather than being structurally impossible.
* Bad, because PID-based teardown can't guarantee cleanup on a hard kill (SIGKILL/power loss).

### B. A dedicated `service`/`daemon` step type

* Good, because the lifecycle could be self-contained in one declaration.
* Bad, because it duplicates all of `runShell`/`runCode`'s command/args/cwd/env surface in a third
  step type, doubling the schema and runtime maintenance.
* Bad, because authors must learn a separate step just to background a command they already know how
  to run.

### C. Config-level `services` block

* Good, because run-wide services are declared in one place.
* Bad, because it moves process lifecycle out of the visible test flow, and couples it to config.
  That's harder to reason about per-spec, and doesn't compose with routing or `beforeAny` and
  `afterAll` ordering.
* Bad, because it can't express a service scoped to a single spec without additional config
  machinery.
