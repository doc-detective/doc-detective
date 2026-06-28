---
status: accepted
date: 2024-10-24
decision-makers: doc-detective maintainers
---

# Pre-run dependency check

## Context and Problem Statement

When a user clones the Doc Detective repository and runs the CLI from inside it before installing dependencies, the run fails deep in module resolution with an opaque error. The friendlier behavior is to detect the missing `node_modules` up front and offer to install. How should the CLI handle being run inside its own repo with dependencies not yet installed?

## Decision Drivers

* A missing-dependency failure should be actionable, not a cryptic require error.
* The check must only apply in-repo, not to normal installed usage.
* The user must be able to either install or abort, not be forced.
* A missing or unparseable `package.json` must not crash the check itself.

## Considered Options

* **A. A `checkDependencies` preflight that prompts to `npm install` or abort** (chosen).
* **B. Auto-run `npm install` silently before the run.**
* **C. Do nothing; let module resolution fail.**

## Decision Outcome

Chosen option: **A**. `src/checkDependencies.js` runs before the main flow: if executing inside the repo with no `node_modules`, it prompts via readline to run `npm install` or abort. It handles a missing or unparseable `package.json` gracefully rather than throwing. Normal installed usage (outside the repo) is unaffected.

### Consequences

* Good: clear, actionable prompt instead of a deep require failure.
* Good: user keeps control — install or abort.
* Neutral: adds an interactive prompt only on the in-repo no-deps path.
* Bad: relies on a TTY for the readline prompt.

### Confirmation

Shipped in doc-detective commits `a630b3d`…`0728668` (PR #98), `src/checkDependencies.js`.

## Pros and Cons of the Options

### A. Prompt to install or abort
* Good: actionable and non-destructive.
* Bad: needs an interactive terminal.

### B. Auto-install silently
* Good: zero friction.
* Bad: surprising side effect; mutates the tree without consent.

### C. Do nothing
* Good: simplest.
* Bad: opaque failure for a common first-run mistake.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `a630b3d`…`0728668` (PR #98). Inventory ref: BACKFILL-INVENTORY.md Seq 136.
