---
status: accepted
date: 2023-03-31
decision-makers: doc-detective maintainers
---

# Config/runner rewrite: setConfig validates config_v2, runTests replaces test, telemetry dropped

## Context and Problem Statement

The original `core` engine validated config through an ad-hoc `utils.js` routine and shipped an
`analytics.js` module that emitted telemetry on every run. As the schema package matured into a
versioned `config_v2` contract (Seq 74), the engine needed a single, schema-backed entry point that
validated configuration once and failed loudly on bad input, rather than scattering field checks
through the runner. The public entry point was also named `test()`, which clashed with test-framework
globals and read poorly as a library API. Which validation, naming, and telemetry posture should the
rewritten config/runner layer adopt?

## Decision Drivers

* Configuration must be validated against the versioned `config_v2` schema in one place, not ad hoc.
* Invalid config should fail fast with a non-zero exit rather than running with silent defaults.
* The public run entry point should be clearly named and not collide with test-runner globals.
* Telemetry was a liability (privacy, maintenance) with little payoff; the analytics path was unused.
* Environment detection (CI/container) should be a first-class part of config resolution.

## Considered Options

* **A. Rewrite `setConfig()` to AJV-validate `config_v2` (exit 1 on failure), rename `test()`→`runTests()`, delete `analytics.js`** (chosen).
* **B. Keep `test()` and the ad-hoc validator; bolt `config_v2` validation on as an optional pass.**
* **C. Keep analytics behind an opt-out flag instead of removing it.**

## Decision Outcome

Chosen option: **A**, because a single schema-validated `setConfig()` is the smallest contract that
makes config behavior predictable and testable, and removing telemetry eliminates an unused
liability outright. The new `setConfig()` validates the merged config against `config_v2` and exits
with status 1 on failure, detects the runtime environment, and supports env-var substitution. The
public engine entry point becomes `runTests()`; `test()` is removed. The legacy `utils.js`
config-validation path and `analytics.js` are deleted, so no telemetry is emitted.

### Consequences

* Good: one validation contract; bad config fails fast and visibly.
* Good: no telemetry surface to maintain or disclose.
* Bad: callers using `test()` must migrate to `runTests()` (breaking for embedders).
* Neutral: environment detection now influences config resolution, observable only in edge cases.

### Confirmation

Shipped in `core` `11d97dd`, `ffb0750`, `75af7fa`. Confirmed by `setConfig()` rejecting invalid
config with exit 1, the `runTests()` export replacing `test()`, and the absence of `analytics.js`
in the engine.

## Pros and Cons of the Options

### A. Rewrite setConfig + rename + drop telemetry
* Good: single schema-backed validation; clean naming; no telemetry liability.
* Bad: breaking API rename for embedders.

### B. Optional config_v2 pass over the old validator
* Good: non-breaking.
* Bad: two validation paths drift; the old ad-hoc checks linger.

### C. Keep analytics opt-out
* Good: preserves usage signal.
* Bad: ongoing privacy/maintenance cost for an unused feature.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `11d97dd`, `ffb0750`,
`75af7fa`. Inventory ref: BACKFILL-INVENTORY.md Seq 75. Builds on the `config_v2` schema contract
(ADR 00050); the telemetry path was later confirmed fully removed by the config-v2 era.
