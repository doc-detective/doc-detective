---
status: accepted
date: 2025-04-12
decision-makers: doc-detective maintainers
---

# Expressions runtime ({{…}} over meta values)

## Context and Problem Statement

The v3 schema introduced `outputs`/`variables` so a step could capture values (response data, element text, shell output) for later steps, but the runner had no general way to *reference and transform* those values inside a step's fields. Earlier capture was limited to whole-value env substitution and a single jq filter (`envsFromResponseData`, `00030`). Steps needed to interpolate captured values, drill into nested response/element data, and transform them. What runtime should evaluate references to captured/meta values inside step fields?

## Decision Drivers

* Steps must reference captured values from earlier steps, not just whole env vars.
* Authors need to extract nested values (response bodies, arrays) and transform them.
* Multiple query idioms are useful: jq, JSONPath, and plain regex extraction.
* Expressions must work both embedded in a string (`{{…}}`) and as a standalone value.

## Considered Options

* **A. A dedicated `expressions.js` evaluating `{{…}}` and standalone expressions over meta values via jq / JSONPath / regex `extract`** (chosen).
* **B. Extend the existing `$ENV`/jq env-capture mechanism only.**
* **C. Adopt a single query language (jq only) with no alternatives.**

## Decision Outcome

Chosen option: **A**, because different extraction tasks favor different idioms and the v3 outputs model needed a general evaluation layer. The runtime:

1. New `src/expressions.js` resolves **`{{…}}` embedded** and **standalone** expressions over the meta-value tree.
2. Supported evaluators: **`jq`** (jq-web), **JSONPath** (jsonpath-plus), and regex **`extract`**.
3. The jq backend migrated `node-jq` → **`jq-web`** (removes a native dependency).
4. Array-index access and an embedded-expression await fix were included.

Commits `2dd868be`, `8299f1f2`, `c71bdb21`, `02b46089` in `core`.

### Consequences

* Good: steps can interpolate and transform captured values with the idiom that fits the data.
* Good: `jq-web` removes the `node-jq` native build dependency.
* Neutral: the meta-value tree this resolves over is unified into the `outputs` object next (`00105`).
* Bad: three evaluator backends are more surface to document and maintain.

### Confirmation

Shipped in `core` commits `2dd868be`, `8299f1f2`, `c71bdb21`, `02b46089`; `{{…}}` resolution over outputs via jq/JSONPath/regex is the confirming behavior, threaded into `runStep` by `00105`.

## Pros and Cons of the Options

### A. Dedicated expressions runtime, multi-idiom
* Good: flexible extraction; embedded + standalone; native dep removed.
* Bad: multiple backends to support.

### B. Extend env-capture only
* Good: minimal new code.
* Bad: no embedded interpolation; weak nested access.

### C. jq-only
* Good: one idiom to learn.
* Bad: JSONPath/regex users lose familiar tools.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `2dd868be`, `8299f1f2`, `c71bdb21`, `02b46089`. Inventory ref: BACKFILL-INVENTORY.md Seq 155. Related: `00030` (httpRequest `envsFromResponseData`), `00105` (unified `outputs` object).
