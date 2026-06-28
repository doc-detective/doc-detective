---
status: accepted
date: 2025-04-18
decision-makers: doc-detective maintainers
---

# 3.0.0 wrapper redesign (runTests-only, config_v3, YAML config, pluggable reporter)

## Context and Problem Statement

By early 2025 the upstream `common`/`core` had a complete v3 contract — `step_v3` action-as-key, `config_v3`, `context_v3`, the `compatibleSchemas` auto-transform, the v3 runner, and the expressions/outputs model. The `doc-detective` CLI wrapper still exposed the v2 surface: `runCoverage`/`suggestTests`/interactive-prompt commands, `--setup`/`--cleanup`/`--recursive` flags, `config_v2` validation, and the legacy default set. This single wrapper-side commit is where all of that flips to v3 and becomes the public 3.0.0 release. What does the breaking 3.0.0 CLI contract look like?

## Decision Drivers

* The wrapper must validate the same `config_v3` the upstream runner now consumes.
* The product is narrowing to `runTests` only (coverage/suggest removed upstream, `00103`).
* Authors increasingly want YAML config, not JSON-only.
* New defaults should match the v3 model (`relativePathBase:"file"`, `loadVariables:".env"`, multi-format `fileTypes`).
* Output should be pluggable rather than hardcoded.

## Considered Options

* **A. Breaking 3.0.0 redesign: `runTests` only, `config_v2`→`config_v3`, YAML config, new defaults, pluggable reporter** (chosen).
* **B. Add v3 alongside v2 in the wrapper (non-breaking, dual surface).**
* **C. Hold the wrapper at v2 and ship v3 only upstream.**

## Decision Outcome

Chosen option: **A**, because the wrapper is the public face of an already-v3 stack and a dual surface would keep the dead v2 commands alive. The 3.0.0 contract (commit `58496132`):

1. **Commands:** remove `runCoverage`/`suggestTests`/the interactive prompt — **`runTests` only**.
2. **Flags:** drop `--setup`/`--cleanup`/`--recursive`.
3. **Validation:** switch **`config_v2` → `config_v3`**.
4. **Config format:** add **YAML config** support.
5. **New defaults:** `relativePathBase:"file"`, `loadVariables:".env"`, `detectSteps:true`, `fileTypes:["markdown","asciidoc","html"]`, `telemetry.send:true`.
6. **Reporter:** pluggable reporter (`jsonReporter` + terminal summary).

`src/index.js` + `src/utils.js`; this is the wrapper-side re-exposure of the upstream v3 contract (Seq 139–149).

### Consequences

* Good: the public CLI matches the v3 stack; one config contract end to end.
* Good: YAML config and a pluggable reporter modernize the surface.
* Bad: breaking — removed commands/flags and a config-schema change require user migration.
* Neutral: later reporters (HTML `00153`, runFolder `00173`) plug into this same reporter seam.

### Confirmation

Shipped in `doc-detective` commit `58496132` as the 3.0.0 release; `config_v3` validation, `runTests`-only dispatch, YAML config, the new defaults, and the pluggable reporter are the confirming behavior.

## Pros and Cons of the Options

### A. Breaking 3.0.0 redesign
* Good: single v3 contract; modern config + reporter surface.
* Bad: breaking migration for users.

### B. Dual v2/v3 wrapper
* Good: non-breaking.
* Bad: keeps dead v2 commands and a second validation path indefinitely.

### C. Hold wrapper at v2
* Good: no wrapper churn.
* Bad: the public CLI lags the engine; v3 unreachable to users.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `58496132` (re-exposing upstream Seq 139–149). Inventory ref: BACKFILL-INVENTORY.md Seq 161. Related: `00096` (v3 schema redesign), `00099` (config_v3), `00100` (v3 runner adoption), `00103` (drop Edge/coverage/suggest), `00107` (default fileTypes), `00153` (HTML reporter).
