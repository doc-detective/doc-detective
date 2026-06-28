---
status: accepted
date: 2025-10-21
decision-makers: doc-detective maintainers
---

# DOC_DETECTIVE_CONFIG env override and Doc Detective API integration

## Context and Problem Statement

CI and containerized runs needed to supply configuration without writing a config file to disk, and some users wanted to delegate execution to a hosted Doc Detective service rather than run everything locally. Doc Detective had file config and CLI flags, but no environment-variable config channel and no remote-run integration. How should an env-supplied config slot into the existing precedence order, and how should a remote run be expressed in config?

## Decision Drivers

* CI/container runs want to inject config via environment, not a file.
* Env config must validate against the same `config_v3` contract as file config.
* Precedence must stay predictable: file < env < CLI.
* Some runs should be delegated to a hosted Doc Detective API.

## Considered Options

* **A. `DOC_DETECTIVE_CONFIG` env var (parsed JSON, AJV-validated `config_v3`, merged file < env < CLI) plus `integrations.docDetectiveApi` + `runViaApi()`** (chosen).
* **B. Env var as raw key/value overrides, no JSON.**
* **C. Local config only; no remote-run integration.**

## Decision Outcome

Chosen option: **A**, because a single JSON env var validated against `config_v3` reuses the existing schema contract exactly, and inserting it between file and CLI keeps the precedence rule a clean total order. Parse/validation failures `exit(1)` so a malformed env config fails loudly rather than silently running with defaults.

Contract decided:

* `DOC_DETECTIVE_CONFIG`: parsed as JSON, validated against `config_v3`, merged **over** file config; precedence is **CLI > env > file**.
* Parse or validation failure → `exit(1)`.
* Config `integrations.docDetectiveApi` plus a `runViaApi()` path for delegating runs to the hosted service.

### Consequences

* Good: file-free config injection for CI/containers, on the same schema contract.
* Good: clean, documented precedence (file < env < CLI).
* Good: optional delegation of runs to the Doc Detective API.
* Bad: a malformed `DOC_DETECTIVE_CONFIG` aborts the run (intentional fail-loud).

### Confirmation

Wrapper-side env merge in doc-detective `5cb04ed3` (#157); `integrations.docDetectiveApi` schema in common `03d3a45`; `runViaApi()` in core `44a28ebe`, `74aeee6`, `c0f39b2`, `8e7591c`.

## Pros and Cons of the Options

### A. JSON env config + API integration
* Good: reuses config_v3; clean precedence; remote-run option.
* Bad: whole-config JSON is more verbose than per-key vars.

### B. Key/value env overrides
* Good: terse for single values.
* Bad: bypasses schema validation; ambiguous merge semantics.

### C. Local only
* Good: less surface.
* Bad: no env injection; no hosted delegation.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective `5cb04ed3` (#157); common `03d3a45`; core `44a28ebe`, `74aeee6`, `c0f39b2`, `8e7591c`. Inventory ref: BACKFILL-INVENTORY.md Seq 187. Related: `00129` (`DOC_DETECTIVE_API` remote-runner client), `00099` (config_v3), `00115` (`DOC_DETECTIVE` env override).
