---
status: accepted
date: 2022-04-23
decision-makers: doc-detective maintainers
---

# Initial CLI flag surface and file-config-overridden-by-args precedence

## Context and Problem Statement

The tool needed a way for users to point it at their docs and tune its behavior from the command line, and a rule for how those flags interact with a config file. The earliest flag work (`c15c6d70`, `3121b69a`, `d5b07b3f`, `6b9f3a32`, 2022-04-23) introduced a yargs-based option surface (`--config/-c`, `--testFile/-f`, `--testDir/-d`, `--imageDir/-i`, `--videoDir/-v`, `--recursive/-r`, `--ext/-e`) plus an argument→config override block. The open question was the order of precedence: does a config file win, or do command-line flags win? How should the CLI surface be shaped and which source takes priority?

## Decision Drivers

* Users need to override file-config values for one-off runs without editing the file.
* A predictable, single precedence rule keeps behavior debuggable.
* Some flags (e.g. `--ext`) carry list values and need a parsing convention.
* yargs idioms (`.option(...)`) should drive the surface for free help/parsing.

## Considered Options

* **CLI flags override file config (file is the base, args overlay)** (chosen).
* **File config overrides CLI flags.**
* **No config file; CLI flags only.**

## Decision Outcome

Chosen option: **file config is the base, CLI flags overlay on top**, because the most common need is to take a stable file config and override individual values for a single invocation.

Behavior decided:

1. A yargs option surface declares `--config/-c`, `--testFile/-f`, `--testDir/-d`, `--imageDir/-i`, `--videoDir/-v`, `--recursive/-r`, `--ext/-e`.
2. File config is loaded first, then an argument→config override block overlays any flag the user passed.
3. List flags such as `--ext` are split on commas into arrays.

### Consequences

* Good: stable file config plus easy per-run overrides.
* Good: a single precedence rule that later flags inherit.
* Neutral: the flag names later evolve (e.g. `--imageDir`/`--videoDir` merge to `--mediaDir`; `--testFile`/`--testDir` give way to `--input`).
* Neutral: establishes the file→args precedence that the project still follows.

### Confirmation

Observable in the yargs `.option(...)` definitions and the arg→config override block, with the comma-split applied to `--ext`.

## Pros and Cons of the Options

### CLI flags override file config
* Good: matches user expectation for one-off overrides.
* Bad: a stray flag can silently mask a file value (mitigated by being explicit).

### File config overrides CLI flags
* Good: file is authoritative.
* Bad: makes ad-hoc overrides impossible from the command line.

### CLI-only
* Good: no precedence to reason about.
* Bad: no reusable, committed configuration.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `c15c6d70`, `3121b69a`, `d5b07b3f`, `6b9f3a32`. Inventory ref: BACKFILL-INVENTORY.md Seq 2. The precedence model is later formalized (env/default tiers) in ADR 00032.
