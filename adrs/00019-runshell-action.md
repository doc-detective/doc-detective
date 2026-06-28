---
status: accepted
date: 2022-05-22
decision-makers: doc-detective maintainers
---

# runShell action

## Context and Problem Statement

Many documented procedures involve running a command in a terminal, not just interacting with a
browser. The runner could only drive a page; it had no way to execute a shell command as a test step,
supply environment variables, or assert on the command's exit status. Should the runner be able to
execute arbitrary shell commands as a first-class action?

## Decision Drivers

* CLI/setup procedures in docs need to be executed and verified, not just browser steps.
* Commands frequently depend on environment variables.
* The verdict must reflect whether the command succeeded (its exit code).

## Considered Options

* **A. Add a `runShell` action that executes a command with env support and exit-code checking**
  (chosen).
* **B. Keep the runner browser-only and document shell steps as manual.**

## Decision Outcome

Chosen option: **A**. The `runShell` action executes a shell command, supports loading environment
variables from an env file, and checks the command's `exitCode` to determine PASS/FAIL. This makes
mixed browser-and-CLI procedures testable end to end. The action is the seed of a long evolution:
later ADRs add `exitCodes`/`output`/`stdio` expectations (Seq 110), `timeout`/`workingDirectory`
(Seq 123), running through a shell for pipes/redirects (Seq 129), and the stderr-no-longer-fails fix
(Seq 107).

### Consequences

* Good: shell-driven documentation (installs, CLI walkthroughs) becomes testable.
* Good: env-file support keeps secrets/config out of the test body.
* Neutral: the initial exit-code-only contract broadens substantially in later ADRs.

### Confirmation

Shipped 2022-05-22 (`710de40`): `src/lib/tests.js` adds the `runShell` action with exec, env-file
support, and exit-code checking.

## Pros and Cons of the Options

### A. First-class runShell action
* Good: unifies browser and CLI procedures in one test; verifiable via exit code.
* Bad: executes arbitrary commands — later gated by the `unsafe`/`allowUnsafeSteps` controls.

### B. Browser-only runner
* Good: smaller threat surface.
* Bad: leaves a large class of documented procedures untestable.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit 710de40. Inventory ref:
BACKFILL-INVENTORY.md Seq 23. Related: ADR 00077 (runShell exitCodes/output expectation), ADR 00082
(runShell/httpRequest timeout and output-save diff), ADR 00087 (runShell via shell), ADR 00116
(unsafe step gating).
