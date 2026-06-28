---
status: accepted
date: 2024-06-29
decision-makers: doc-detective maintainers
---

# runShell/httpRequest timeouts, output-save with Levenshtein diff, and workingDirectory

## Context and Problem Statement

`runShell` and `httpRequest` could hang indefinitely on a slow command or endpoint, and there
was no way to persist their output to a file or to tolerate small, expected variation in that
output. `runShell` also always executed in the process's current working directory. How should
these two steps bound their execution time, save and compare their output with a variation
tolerance, and let a test choose where the command runs?

## Decision Drivers

* A runaway command or unresponsive endpoint must not stall a run forever.
* Test output (logs, response bodies) often needs to be saved as an artifact.
* Output comparison must tolerate minor, expected drift instead of failing on every byte change.
* `runShell` commands sometimes need a specific working directory.
* Response matching should be strict by default but allow extra fields when desired.

## Considered Options

* **A. Add `timeout` to both steps, an output-save block (`savePath`/`saveDirectory`/`maxVariation`/
  `overwrite`) compared with a Levenshtein variation diff, `allowAdditionalFields` for response
  matching, and a `workingDirectory` for runShell** (chosen).
* **B. Rely on the OS/process default timeouts and exact-match comparison only.**
* **C. Push output capture and diffing to an external wrapper script.**

## Decision Outcome

Chosen option: **A**, because bounded execution, persisted output, and a tolerance-based diff are
all first-class testing needs. The contract added `timeout` (default `60000`) to `runShell` and
`httpRequest`; an output-save block (`savePath`/`saveDirectory`/`maxVariation`/`overwrite`) that
writes output and compares against a saved baseline using a Levenshtein-distance variation diff;
`allowAdditionalFields` (default `true`) governing strict response matching; and `workingDirectory`
(default `"."`) for runShell (common `d196a560`, `da53d5b2`, `dbf80a01`, `a09a3fea`, `8a3ac5cd`;
core `4bf886`, `1e4a1c`, `19c72d`, `95426e23`, `e2c48af0`, `4a15af63`, Seq 123).

### Consequences

* Good: runs are bounded; a stuck command/endpoint fails rather than hangs.
* Good: output is persisted and diffable with a variation tolerance (`maxVariation`).
* Good: `workingDirectory` makes runShell relocatable per test.
* Bad: more fields on two already-large steps; output-save semantics overlap saveScreenshot's diff model.
* Neutral: `maxVariation` here is the same comparison family later unified to a 0–1 fractional contract.

### Confirmation

Shipped across common `d196a560`/`da53d5b2`/`dbf80a01`/`a09a3fea`/`8a3ac5cd` and core
`4bf886`/`1e4a1c`/`19c72d`/`95426e23`/`e2c48af0`/`4a15af63`. The new fields are part of the
runShell/httpRequest schemas; the Levenshtein diff runs in the step handlers.

## Pros and Cons of the Options

### A. timeout + output-save/diff + workingDirectory
* Good: bounded, persistable, tolerant comparison; relocatable runShell.
* Bad: field/semantic overlap with screenshot diffing.

### B. OS defaults + exact match
* Good: nothing to add.
* Bad: hangs persist; brittle exact comparison.

### C. External wrapper
* Good: keeps step code small.
* Bad: not integrated with the verdict/output model.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `d196a560`,
`da53d5b2`, `dbf80a01`, `a09a3fea`, `8a3ac5cd`; doc-detective-core commits `4bf886`, `1e4a1c`,
`19c72d`, `95426e23`, `e2c48af0`, `4a15af63`. Inventory ref: BACKFILL-INVENTORY.md Seq 123.
Related: `00019`/`00077` (runShell), `00030` (httpRequest), `00066` (saveScreenshot diff),
`00139` (fractional maxVariation).
