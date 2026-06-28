---
status: accepted
date: 2025-04-01
decision-makers: doc-detective maintainers
---

# YAML test-spec support

## Context and Problem Statement

Doc Detective test specs were JSON-only: `isValidSourceFile` validated `.json` files against `spec_v3`, and the resolver's allowed extensions did not include `.yaml`/`.yml`. Many documentation toolchains and authors prefer YAML for human-edited config-like files, and a spec is exactly that kind of file. Should the resolver accept YAML spec files as a first-class equivalent of JSON, validated against the same contract?

## Decision Drivers

* YAML is a common, more readable authoring format for spec-like files.
* A YAML spec and a JSON spec must validate against the **same** `spec_v3` contract.
* The loader should parse both formats through one path, not duplicate logic.
* Markdown inline-detection regexes needed to tolerate multiline content alongside this work.

## Considered Options

* **A. A unified `readFile` that parses JSON and YAML, with `isValidSourceFile` validating both against `spec_v3`** (chosen).
* **B. A separate YAML-only loader and validation path.**
* **C. Pre-convert YAML to JSON outside the resolver.**

## Decision Outcome

Chosen option: **A**, because a spec's *contract* is format-independent — only the deserialization differs. The contract:

1. A unified `readFile` in `common` deserializes both **JSON and YAML**.
2. `isValidSourceFile` validates JSON **and YAML** sources against **`spec_v3`**.
3. `allowedExtensions` gains **`yaml`/`yml`**.
4. A shared `parseObject` handles the parsed object regardless of source format.
5. Markdown inline regexes were widened to be multiline-tolerant in the same change.

Commits `5c75c9ef`, `9c854c4f`, `11f3e3c4` (`core` + `common`).

### Consequences

* Good: authors can write specs in YAML or JSON interchangeably.
* Good: one validation contract (`spec_v3`) regardless of serialization.
* Neutral: YAML config support at the wrapper level lands separately in the 3.0.0 redesign (`00108`).

### Confirmation

Shipped in commits `5c75c9ef`, `9c854c4f`, `11f3e3c4`; YAML specs validate against `spec_v3` through the shared `readFile`/`parseObject` path.

## Pros and Cons of the Options

### A. Unified readFile + shared validation
* Good: single contract; single parse path; both formats equal.
* Bad: `readFile` must own format sniffing.

### B. Separate YAML path
* Good: isolated.
* Bad: duplicated validation; risk of drift between formats.

### C. External pre-conversion
* Good: no resolver change.
* Bad: pushes a build step onto every author; no native support.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core/common commits `5c75c9ef`, `9c854c4f`, `11f3e3c4`. Inventory ref: BACKFILL-INVENTORY.md Seq 151. Related: `00099` (config_v3), `00101` (v3 spec/test resolution), `00108` (3.0.0 wrapper redesign, YAML config).
