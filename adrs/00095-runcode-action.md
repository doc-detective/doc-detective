---
status: accepted
date: 2025-01-20
decision-makers: doc-detective maintainers
---

# runCode action

## Context and Problem Statement

Documentation frequently shows code snippets the reader is meant to run — Python, Bash, or JavaScript. Doc Detective could run a shell command (`runShell`), but had no first-class way to take a block of source in a known language, materialize it, and execute it through the right interpreter while asserting on the exit code. How should a `runCode` step express the language, the code, and the success condition?

## Decision Drivers

* Snippets in docs are written in a specific language, not as raw shell lines.
* The runner must dispatch to the correct interpreter per language.
* Success/failure must be assertable via exit codes, like `runShell`.
* The mechanism should reuse the existing step/runStep plumbing.

## Considered Options

* **A. A `runCode` action: language enum, code → temp script, interpreter dispatch, exitCodes** (chosen).
* **B. Require authors to wrap every snippet in a `runShell` invocation themselves.**
* **C. Per-language step types (`runPython`, `runBash`, …).**

## Decision Outcome

Chosen option: **A**. `runCode` carries a `language` enum (`python` / `bash` / `javascript`) and a `code` string; the runner writes the code to a temporary script and dispatches it to the matching interpreter, asserting against `exitCodes`. It is wired into `runStep` alongside the other actions. (The same v2-era batch also adjusted viewport resize sizing, set `wdio:enforceWebDriverClassic`, and made crop scroll the target into view.)

### Consequences

* Good: doc code snippets run as-authored, in their own language.
* Good: one step covers multiple languages via the enum.
* Neutral: language support is bounded to the enum members.
* Bad: temp-script materialization adds filesystem I/O per step.

### Confirmation

Shipped in common commits `65ee3f5f`, `cf9d95dc`, `41048407` and core commits `54c4010`, `9666276`, `25468b8`, `0484726`, `26cb7a8`, `b3d113f`.

## Pros and Cons of the Options

### A. Single runCode with language enum
* Good: one step, interpreter dispatch, exit-code assertions.
* Bad: requires writing a temp script.

### B. Author wraps snippets in runShell
* Good: no new step.
* Bad: pushes interpreter plumbing onto every author.

### C. Per-language step types
* Good: explicit names.
* Bad: N near-identical steps to maintain.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `65ee3f5f`, `cf9d95dc`, `41048407`; doc-detective-core commits `54c4010`, `9666276`, `25468b8`, `0484726`, `26cb7a8`, `b3d113f`. Inventory ref: BACKFILL-INVENTORY.md Seq 138. Related: `00019` (runShell).
