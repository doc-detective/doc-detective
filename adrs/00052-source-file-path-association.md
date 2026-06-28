---
status: accepted
date: 2023-04-02
decision-makers: doc-detective maintainers
---

# Associate a source file path with specs and tests

## Context and Problem Statement

Once tests could be detected from documentation files and resolved into in-memory spec/test objects,
results lost their connection to the source document they came from. Reports and downstream tooling
could see a failing test but not which Markdown (or other) file authored it, making triage and
"docs as tests" round-tripping awkward. Should the spec and test schemas carry the originating source
file path, and if so, where?

## Decision Drivers

* Results must be traceable back to the documentation file that produced them.
* The association should live on the schema so every consumer (runner, reporter, resolver) sees it.
* It should be optional/string-typed so in-memory and synthetic specs without a file still validate.
* Minimal surface: a single field rather than a nested provenance object.

## Considered Options

* **A. Add a `file` string field to both the spec and test schemas** (chosen).
* **B. Track source paths only in the runner's in-memory state, outside the schema.**
* **C. Add a richer provenance object (path, line, range) on the test.**

## Decision Outcome

Chosen option: **A**, because a single `file` string on the spec and the test is the smallest change
that makes provenance a first-class, schema-visible part of the contract. Every spec and test may
carry a `file` string naming the source document it was detected from; consumers read it directly from
the validated object. A richer provenance object (option C) was deferred — line/range tracking arrived
much later in the detection refactor.

### Consequences

* Good: results, reports, and tooling can attribute every test to its source file.
* Good: schema-level field means all consumers share one contract.
* Neutral: synthetic/in-memory specs simply omit `file`.
* Bad: only a path, not a line/range — finer-grained provenance needed later work.

### Confirmation

Shipped in `common` `20d8b6b`. Confirmed by the `file` string appearing on the spec and test schemas
and surviving validation on detected tests.

## Pros and Cons of the Options

### A. `file` string on spec and test
* Good: minimal, schema-visible, universally consumable.
* Bad: path only; no line/range.

### B. Runner-only in-memory tracking
* Good: no schema change.
* Bad: provenance invisible to reporters and other consumers; drifts from the contract.

### C. Rich provenance object
* Good: enables precise source mapping.
* Bad: larger schema surface than needed at the time; premature.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commit `20d8b6b`. Inventory
ref: BACKFILL-INVENTORY.md Seq 76. Finer-grained line/location tracking was added later in the
detection refactor (ADR 00148).
