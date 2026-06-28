---
status: accepted
date: 2026-05-06
decision-makers: doc-detective maintainers
---

# doc-detective-runner platform entrypoint

## Context and Problem Statement

The hosted doc-detective.com platform needs to run a user's tests inside an ephemeral worker:
fetch the spec and secrets for a job, lay out a workspace, invoke the CLI, stream logs back, and
finalize results — all with a hard time budget so a stuck run can't pin a worker forever. The
plain `doc-detective` CLI bin assumes a local filesystem and an interactive-ish lifecycle, so it
isn't the right shape for a platform worker. How should the platform launch and supervise a run?

## Decision Drivers

* The platform supplies spec/secrets out-of-band, not from a local config file.
* A worker must provision an isolated workspace and clean lifecycle per job.
* Logs must stream back to the platform during the run, and results must be finalized at the end.
* A run must self-terminate at a wall-clock ceiling so a hung run cannot leak a worker.
* This orchestration should be a separate entrypoint, not bolted onto the user-facing CLI.

## Considered Options

* **A. A dedicated `doc-detective-runner` bin that fetches inputs, provisions `/workspace`, spawns the CLI via `DOC_DETECTIVE_CONFIG`, streams logs, finalizes, and self-kills at a timeout** (chosen).
* **B. Add platform flags to the existing `doc-detective` bin.**
* **C. Drive the CLI from an external supervisor script outside the package.**

## Decision Outcome

Chosen option: **A**, because the platform lifecycle (fetch → provision → spawn → stream →
finalize → timeout) is distinct from the local CLI and benefits from owning its own process. The
entrypoint `bin/runner-entrypoint.js` fetches the job's spec/secrets, provisions `/workspace`,
spawns the CLI with the resolved config passed via the `DOC_DETECTIVE_CONFIG` env var, streams
logs, finalizes results, and self-kills at `DD_TIMEOUT_SECONDS` (commit `44ded942`, PR #302).

### Consequences

* Good: clean separation between the user-facing CLI and the platform worker entrypoint.
* Good: reuses the `DOC_DETECTIVE_CONFIG` env contract to hand config to the spawned CLI.
* Good: the self-kill timeout bounds worker occupancy.
* Neutral: this bin is platform-facing; local users still use `doc-detective`.
* Bad: a second bin to maintain and keep in sync with CLI behavior.

### Confirmation

`bin/runner-entrypoint.js` provides the `doc-detective-runner` bin with fetch/provision/spawn/
stream/finalize and a `DD_TIMEOUT_SECONDS` self-kill. Shipped in `44ded942` (PR #302).

## Pros and Cons of the Options

### A. Dedicated `doc-detective-runner` bin
* Good: owns the platform lifecycle; reuses `DOC_DETECTIVE_CONFIG`; bounded by timeout.
* Bad: an additional entrypoint to maintain.

### B. Flags on the existing CLI
* Good: one bin.
* Bad: pollutes the user CLI with platform-only concerns.

### C. External supervisor
* Good: keeps the package clean.
* Bad: orchestration lives outside the versioned package; harder to ship in lockstep.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `44ded942` (PR #302).
Inventory ref: BACKFILL-INVENTORY.md Seq 226. Related: `00127` (`DOC_DETECTIVE_CONFIG` env
override + Doc Detective API), `00129` (remote-runner API client).
