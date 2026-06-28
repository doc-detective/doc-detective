---
status: accepted
date: 2022-05-03
decision-makers: doc-detective maintainers
---

# Test and result object contracts with generated UUID test ids

## Context and Problem Statement

The runner needed stable shapes for what a test *is* and what a run *produces*, plus a way to identify tests that authors did not name. The commits `8d16362a` and `c2656b66` (2022-05-03) introduced a `testDefinition` contract and a `testResult` contract (`ref/testDefinition.json`, `ref/testResult.json`), an enumerated set of actions (`open`/`find`/`click`/`sendKeys`/`wait`/`screenshot`/`recordStart`/`recordStop`/`imageDiff`), and a `setTest` step that generates a UUID id for any test lacking one. How should tests and results be modeled, and how should unnamed tests be identified?

## Decision Drivers

* The runner needs a typed contract for inputs (tests) and outputs (results).
* Tests must be addressable even when authors omit an explicit id.
* The set of supported actions should be enumerated and discoverable.
* Result objects must mirror test objects so reporting can attach status per item.

## Considered Options

* **Declared testDefinition/testResult contracts with generated UUID ids** (chosen).
* **Free-form objects with no fixed contract.**
* **Require authors to supply a unique id for every test.**

## Decision Outcome

Chosen option: **declared contracts with UUID fallback ids**, because typed shapes make the runner and reporter predictable, and generating a UUID for unnamed tests guarantees every test is addressable without burdening authors.

Behavior decided:

1. A `testDefinition` object describes a test and a `testResult` object describes its outcome (`ref/testDefinition.json`, `ref/testResult.json`).
2. Actions are constrained to an enum: `open`, `find`, `click`, `sendKeys`, `wait`, `screenshot`, `recordStart`, `recordStop`, `imageDiff`.
3. Any test without an `id` is assigned a generated UUID by `setTest`.

### Consequences

* Good: stable, typed contracts for runner and reporter to depend on.
* Good: every test is uniquely addressable even when unnamed.
* Neutral: this is the seed of the later formal schema family (`test_v1`/`v2`/`v3`) and the `SKIPPED`/verdict reporting contracts.

### Confirmation

Observable in `ref/testDefinition.json` and `ref/testResult.json`, the action enum, and the UUID-generating `setTest` path.

## Pros and Cons of the Options

### Declared contracts + UUID ids
* Good: predictable shapes; no manual id burden.
* Bad: generated ids are not human-meaningful (mitigated by allowing explicit ids).

### Free-form objects
* Good: maximally flexible.
* Bad: no contract for the runner/reporter to rely on.

### Mandatory author-supplied ids
* Good: human-meaningful ids everywhere.
* Bad: friction; easy to forget and collide.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `8d16362a`, `c2656b66`. Inventory ref: BACKFILL-INVENTORY.md Seq 7. Ancestor of the schema-package contracts (ADR 00038 onward).
