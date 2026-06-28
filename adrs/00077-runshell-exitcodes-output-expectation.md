---
status: accepted
date: 2024-03-16
decision-makers: doc-detective maintainers
---

# runShell exitCodes / output expectation and capture-into-variables

## Context and Problem Statement

`runShell` could fail on a non-zero exit (`00074` had already stopped it failing on stderr), but it
could not assert *which* exit codes count as success, nor check the command's textual output, nor
feed that output into a variable for later steps. Documentation often shows a command and its
expected output, so the step needed to assert on output and capture values. Likewise `find` had no
way to capture an element's text into a variable. What expectation and capture contract should
`runShell` (and `find`) expose?

## Decision Drivers

* A documented command may legitimately succeed with a non-zero exit code.
* Docs show expected command output, so the step should assert it (literal or regex).
* Captured output/element text must flow into variables for chained steps.
* Capture mechanism should reuse the existing env-var model rather than invent a new one.

## Considered Options

* **A. Add `exitCodes`, `output`/`stdio` expectations, and `setVariables` (env from output) to
  runShell, plus `find.setVariables` (env from element text)** (chosen).
* **B. Only assert the exit code; leave output checking to a downstream matchText.**
* **C. Add output capture but no expectation assertion.**

## Decision Outcome

Chosen option: **A** (`common` `1ea040a`, `370dac7`, `9c96fde`, `4bcd256`; `core` `2a65d013`,
`37d86cee`):

1. **`exitCodes`** — array of acceptable exit codes, default `[0]`.
2. **`output` / `stdio`** — an expectation matched against the command's output, given as a literal
   string or a `/regex/`.
3. **`setVariables`** — captures from the command output into environment variables for later steps.
4. **`find.setVariables`** — symmetrically, captures a found element's text into an environment
   variable.

## Pros and Cons of the Options

### A. exitCodes + output expectation + setVariables (chosen)
* Good: documented commands with non-zero success codes pass; output is asserted and capturable.
* Bad: more fields on `runShell`; two capture sites (runShell + find) to keep consistent.

### B. Exit-code only
* Good: minimal.
* Bad: can't verify the output a doc actually shows; needs a separate matchText step.

### C. Capture without assertion
* Good: enables chaining.
* Bad: silently passes even when output is wrong.

### Consequences

* Good: commands with intentional non-zero exits pass; output is verified; values chain via vars.
* Good: `find.setVariables` brings the same capture model to element text.
* Bad: larger `runShell` surface to document and validate.
* Neutral: `setVariables` is later renamed `loadVariables`/`variables` under the v3 schema.

### Confirmation

`exitCodes`/`output`/`stdio`/`setVariables` schema in `doc-detective-common` (`1ea040a`, `370dac7`,
`9c96fde`, `4bcd256`); runtime handling and `find.setVariables` in `doc-detective-core` (`2a65d013`,
`37d86cee`).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `1ea040a`, `370dac7`,
`9c96fde`, `4bcd256`; doc-detective-core `2a65d013`, `37d86cee`. Inventory ref:
BACKFILL-INVENTORY.md Seq 110. Related: `00019` (runShell action), `00074` (runShell stderr verdict
fix), `00082` (runShell/httpRequest timeout + output-save diff).
