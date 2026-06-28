---
status: accepted
date: 2026-04-30
decision-makers: doc-detective maintainers
---

# --test / --spec regex filters (testFilter / specFilter)

## Context and Problem Statement

A run executed every detected spec and test; there was no way to run a subset by identifier.
Authors iterating on one failing test, or CI sharding a large suite, had to either point at
narrower input paths or run everything. The audit needed `--test` and `--spec` CLI flags that
filter the resolved run by `testId`/`specId`, flowing through the merged `config` object as
`config.testFilter`/`config.specFilter` (the repo's required CLI-flag-to-config pattern). What
shape should these filters take, and how should they be matched?

## Decision Drivers

* Authors and CI need to run a subset of tests/specs without changing input paths.
* Identifiers should match flexibly (regex), not require exact string equality.
* Matching should be case-insensitive for ergonomic identifier filtering.
* Flags must flow through `config` (not be read from `args`), per the CLI-flag-to-config rule.
* The schema must defend against whitespace-only entries that compile to accidental matches.

## Considered Options

* **A. `--test`/`--spec` → `config.testFilter`/`config.specFilter` as case-insensitive regex arrays matched on `testId`/`specId`, with `config_v3` strict-array fields** (chosen).
* **B. Exact-string identifier match only (no regex).**
* **C. A single combined `--filter` flag matching either id.**

## Decision Outcome

Chosen option: **A**, because regex matching on stable identifiers gives both pinpoint
selection and prefix/group selection, and the strict-array schema shape (`minLength`, `\S`
pattern) is the established convention for new multi-value flags. `--test` and `--spec`
populate `config.testFilter` and `config.specFilter` — case-insensitive regex arrays matched
against `testId` and `specId` respectively. The `config_v3` array fields use the strict shape
(`items: {minLength, pattern: "\\S"}`) so whitespace-only entries can't compile into
accidentally-matching regexes; the runner gates which tests/specs execute by these filters.

### Consequences

* Good: run a single test, a group (by regex), or filter specs without changing input paths.
* Good: case-insensitive regex is flexible for identifier selection.
* Good: filters reach runtime via `config`, so config-file/env users get the same behavior.
* Good: `\S` pattern + `minLength` block whitespace-only filters that would match everything.
* Neutral: a filter matching nothing yields an empty run.
* Bad: regex filters are more powerful than exact match, so a broad pattern can over-select.

### Confirmation

Shipped with `config_v3` array fields (`testFilter`/`specFilter`), filter helpers in
`core/utils.ts`, and runner gating in `tests.ts` (commit `b19ac228`, PR #286). Confirmed by
schema validation of the strict arrays and the runner's id-regex gating. PR #286 is the
worked example referenced in the repo's CLI-flags-to-config guidance.

## Pros and Cons of the Options

### A. Regex arrays via config (testFilter/specFilter)
* Good: flexible, case-insensitive, config-routed, schema-defended.
* Bad: broad patterns can over-select.

### B. Exact-string match
* Good: predictable.
* Bad: no group/prefix selection; verbose for many ids.

### C. Single combined --filter
* Good: one flag.
* Bad: ambiguous which id it matches; conflates spec/test scopes.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `b19ac228` (PR #286).
Inventory ref: BACKFILL-INVENTORY.md Seq 223. Related: `00099` (config_v3 restructure),
`00161` (dry-run flag). PR #286 is cited in CLAUDE.md as the canonical multi-value
CLI-flag-to-config example.
