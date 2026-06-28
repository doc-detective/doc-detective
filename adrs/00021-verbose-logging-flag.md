---
status: accepted
date: 2022-05-29
decision-makers: doc-detective maintainers
---

# Verbose logging flag

## Context and Problem Statement

Early Doc Detective gated diagnostic output behind hardcoded debug branches inside the runner, so a
user could not turn detailed logging on or off without editing source. The runner needed a single,
user-controllable switch — exposed both as a config field and a CLI flag — that decided whether the
tool emitted verbose progress and diagnostic logs. How should that switch be named and wired so that
config files and the command line both reach the same logging behavior?

## Decision Drivers

* Users need to opt into detailed logs when debugging tests without recompiling.
* The switch must be reachable from both `config.json` and the command line.
* A short alias keeps interactive CLI use ergonomic.
* The change must replace the existing hardcoded debug gating rather than add a parallel path.

## Considered Options

* **A. A `verbose` boolean config field plus a `--verbose`/`-v` CLI flag** (chosen).
* **B. A multi-level `logLevel` string from the start.**
* **C. Keep an environment-variable-only debug toggle.**

## Decision Outcome

Chosen option: **A**, because a single boolean was the smallest change that removed the hardcoded
gating and gave users an obvious on/off control reachable from both config and CLI. A `verbose`
boolean was added to `config.json` and a `--verbose` flag (short alias `-v`) was added to the CLI in
`utils.js`; the flag overrides the config value, and the runner reads the merged setting instead of
its old hardcoded debug branches.

This boolean was deliberately the simplest contract that worked; it was later **superseded by a
multi-level `logLevel` enum** (see `00027`) once a single on/off proved too coarse.

### Consequences

* Good: users control diagnostic verbosity from config or CLI without editing source.
* Good: removed scattered hardcoded debug gating in favor of one merged setting.
* Bad: a single boolean cannot express intermediate levels (info vs. debug), forcing the later enum
  rewrite.
* Neutral: establishes the file-config-overridden-by-CLI precedence pattern for logging knobs.

### Confirmation

Shipped in commit `9d9f21c` touching `config.json` and `utils.js`; the runner consumes the merged
`verbose` value at its logging call sites. Superseded behavior is confirmed by `00027`.

## Pros and Cons of the Options

### A. `verbose` boolean + `--verbose`/`-v`
* Good: minimal, obvious, dual-surface (config + CLI).
* Bad: boolean is too coarse; needs a later enum.

### B. `logLevel` enum from the start
* Good: future-proof granularity.
* Bad: more design surface than the immediate need justified in 2022.

### C. Env-var-only debug toggle
* Good: no schema/CLI change.
* Bad: not discoverable; not reachable from config files.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `9d9f21c`. Inventory ref:
BACKFILL-INVENTORY.md Seq 25. Superseded by `00027` (logLevel enum).
