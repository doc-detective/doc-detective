---
status: accepted
date: 2024-08-08
decision-makers: doc-detective maintainers
---

# Run `runShell` commands through a shell to enable pipes and redirects

## Context and Problem Statement

`runShell` executed commands via `spawnCommand`, which split the command string into an
executable plus arguments and spawned that directly. Direct spawning does not interpret shell
syntax, so pipes (`|`), redirects (`>`), globbing, and command chaining did not work — yet
documentation routinely shows commands that use exactly those features. How should `runShell`
execute its command so that documented shell syntax behaves the way readers expect?

## Decision Drivers

* Documentation commands commonly use pipes, redirects, globs, and chaining.
* Arg-splitting a command string mangles those constructs.
* The behavior should match what a user typing the command into their shell would get.
* Cross-platform: the default shell differs between POSIX and Windows.

## Considered Options

* **A. Run everything through a shell (`bash -c` / `cmd /c`) instead of arg-splitting** (chosen).
* **B. Add an opt-in `shell` flag, defaulting to arg-splitting.**
* **C. Parse and emulate pipes/redirects in the runner.**

## Decision Outcome

Chosen option: **A**, because the whole point of `runShell` is to run shell commands, so shell
semantics should be the default, not an opt-in. `runShell`/`spawnCommand` was changed to run the
command through a shell (`bash -c` on POSIX, `cmd /c` on Windows) rather than splitting it into
executable + args, enabling pipes and redirects (core `79003c4`, Seq 129).

### Consequences

* Good: documented pipes, redirects, globbing, and chaining work as written.
* Good: behavior matches a user running the command in their own shell.
* Bad: running through a shell broadens what a `runShell` step can do (shell injection surface),
  which later motivates the `unsafe`/`allowUnsafeSteps` gating.
* Neutral: the shell differs by platform, so platform-specific syntax can diverge.

### Confirmation

Shipped in doc-detective-core commit `79003c4`. Confirmed by `spawnCommand` invoking the command
through `bash -c`/`cmd /c`.

## Pros and Cons of the Options

### A. Always run via a shell
* Good: full shell syntax; matches user expectation.
* Bad: larger execution surface (injection), platform-divergent syntax.

### B. Opt-in `shell` flag
* Good: conservative default.
* Bad: pipes/redirects silently fail until the flag is found.

### C. Emulate shell features
* Good: no real shell dependency.
* Bad: re-implementing a shell is large and error-prone.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `79003c4`. Inventory
ref: BACKFILL-INVENTORY.md Seq 129. Related: `00019`/`00077` (runShell), `00116` (unsafe-step gating).
