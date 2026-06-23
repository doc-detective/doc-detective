---
status: accepted
date: 2026-06-22
decision-makers: doc-detective maintainers
---

# Long-running background processes for runShell/runCode

## Context and Problem Statement

`runShell` and `runCode` are blocking: each spawns a command, waits for it to exit, then asserts on
the exit code / stdio / saved output. There is no way to start a **long-lived** process — a Docker
container, a dev server, a database — keep it running while many tests execute against it, and tear
it down at cleanup.

Authors work around this today with external scripts or `beforeAny`/`afterAll` shell steps that
background a process with `&` and `disown`, but the runner then has no handle on it: nothing waits
for it to become ready (so the first test races startup), nothing tears it down (so it orphans), and
on Ctrl-C the process leaks. How do we let a test run own a long-lived process end-to-end —
start → ready-gate → reuse → guaranteed teardown — without a breaking change to the step model?

## Decision Drivers

* Generic: any long-running process, not Docker-specific.
* Readiness must be explicit — "the port is bound" / "the log says ready" / "HTTP 200" / a delay —
  so tests don't race a half-started process.
* Teardown must be guaranteed: explicit (a step) **and** automatic (run end, and on Ctrl-C/SIGTERM).
* No breaking changes to existing `runShell`/`runCode` behavior; blocking mode stays byte-identical.
* Fit the existing run lifecycle (`beforeAny`/`afterAll`, the Appium-style run-owned resource that is
  started once and torn down once).

## Considered Options

* **A. `background` object + `waitUntil` gate + run-level registry + `stopProcess` step** (chosen).
* **B. A dedicated `service`/`daemon` step type** separate from `runShell`/`runCode`.
* **C. Config-level `services` block** declaring long-lived processes outside the step stream.

## Decision Outcome

Chosen option: **A**, because it reuses the two step types authors already know, places start/stop in
the step stream (so `beforeAny` start / `afterAll` stop reads naturally), and models the process as a
run-owned resource exactly like Appium. B duplicates all of `runShell`/`runCode`'s command/option
surface in a third step type. C moves process lifecycle out of the visible test flow and couples it
to config, which is harder to reason about per-spec and doesn't compose with routing.

Mechanism:

1. **`background` object** on `runShell`/`runCode` (`src/core/tests/runShell.ts`,
   `runCode.ts`): a `background: { name, waitUntil? }` object whose *presence* signals background
   mode (there is no `background: false` — omit it for a normal blocking run). Spawn non-blocking via
   `spawnBackgroundCommand` and return as soon as the process is ready. In background mode the
   exit-code / stdio / saved-output assertions don't apply, and step-level `timeout` is reinterpreted
   as the **readiness deadline**. `name` is required inside `background` and keys the process in the
   registry; a duplicate name FAILs rather than double-spawning. (An earlier iteration used a boolean
   `background: true` with sibling `name`/`readyWhen`; collapsing the three into one cohesive object
   keeps the related fields together and makes "is this backgrounded?" a single presence check.)
2. **`waitUntil`** (inside `background`, optional) gate with AND-combinable conditions
   (`src/core/utils.ts`), borrowing goTo's `waitUntil` terminology: `port` (TCP connect, an integer),
   `stdio` (substring-or-`/regex/` over combined stdout+stderr, mirroring runShell's `stdio` field),
   `httpGet` (a URL string, ready on any 2xx), and `delayMs` (a fixed minimum wait). Any combination
   may be given; every condition present must pass. The fields are flat (no `host`/`pollIntervalMs`/
   `statusCodes`/`stream` knobs) to match runShell's other fields. Readiness is raced against process
   exit, so a process that dies during startup FAILs fast instead of waiting the whole deadline.
3. **Run-level process registry** owned by `runSpecs` (`src/core/tests.ts`): a `Map` threaded
   through `runContext`/`runRoutedSpec` → `runStep` → the step handlers, so a process started in one
   spec/test survives for the whole run (e.g. start in `beforeAny`, use across `main`, stop in
   `afterAll`).
4. **`stopProcess` step** (`src/core/tests/stopProcess.ts`, new `stopProcess_v3` schema): tree-kills
   a process by `name` and deregisters it; accepts a string shorthand or `{ name, ignoreMissing }`.
   `ignoreMissing: true` makes stopping an already-gone process a PASS.
5. **Guaranteed teardown** (`src/core/tests.ts`): the existing Appium-teardown `finally` also sweeps
   any still-registered process (run-end auto-cleanup), and new `SIGINT`/`SIGTERM` handlers tear
   down background processes, Appium, and Xvfb on interrupt — the handlers are removed in the same
   `finally` so repeated programmatic `runSpecs` calls don't accumulate listeners. (This also fixes
   the pre-existing Appium-leak-on-Ctrl-C.)
6. **`runCode` temp-script lifetime**: a backgrounded script is still being read by the interpreter
   after `runShell` returns, so its temp file deletion is deferred to teardown instead of the
   immediate `finally` used in blocking mode.

## Consequences

* **Good** — a single run can stand up shared infrastructure once, run many tests against it, and
  tear it down deterministically, with an explicit readiness contract instead of `sleep` guesses.
* **Good** — teardown is guaranteed on success, failure, run-end, and interrupt; the interrupt path
  also closes the prior Appium leak.
* **Trade-off** — a process that forks a daemon and then exits (some Docker images, some databases)
  trips the "exited before ready" path and FAILs; documented in the `waitUntil` schema with the
  guidance to use `port`/`httpGet`/`delayMs` for those rather than relying on the parent staying
  alive.
* **Trade-off** — `waitUntil.stdio` searches both streams as a single combined buffer (stdout then
  stderr), not a true temporal interleave; a match that depends on the cross-stream ordering of
  output may not behave as expected. Matches runShell's existing `stdio` semantics.
* **Neutral / out of scope** — cross-runner *shared* processes under `concurrentRunners` are not
  modeled: the registry is run-owned and start/stop are single-owner. Per-runner instances and
  start-or-attach semantics are deferred; the run-owned placement is forward-compatible with them.
* **Neutral** — `waitUntil` lives inside the `background` object, so it can't be set on a
  non-background step; an empty or omitted `waitUntil` means "ready as soon as spawned."

## Confirmation

* Unit (`test/background-process.test.js`): `spawnBackgroundCommand` returns immediately and buffers
  output; each condition (`port`/`httpGet`/`stdio`/`delayMs`) resolves and times out correctly,
  and combined conditions all gate together; readiness
  fails fast on early exit; `stopProcess` kills + deregisters + honors `ignoreMissing`; the real
  `runShell`/`runCode` background branches (readiness, outputs, name collision, timeout-deregister,
  deferred temp cleanup).
* Schema (`src/common/test/validate.test.js`): positive + negative cases for `background`/`name`/
  every `waitUntil` condition (and combined conditions) and both `stopProcess` forms (non-object
  `background`, unknown key in `background`/`waitUntil`, old object-shaped port, missing name,
  out-of-range port, whitespace name).
* End-to-end: `test/background-runner.test.js` drives `runTests()` for explicit-stop and run-end
  auto-sweep; `test/core-artifacts/background-processes.spec.json` exercises every permutation
  through the canonical `test/core-core.test.js` fixture gate (all `waitUntil` conditions, combined
  conditions, `stopProcess` string/object, `ignoreMissing`, auto-sweep, `runShell` and `runCode`
  background) and must resolve
  PASS/SKIPPED across the CI matrix (macOS / Linux / Windows × node 22/24).
