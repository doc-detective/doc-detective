---
status: accepted
date: 2025-10-22
decision-makers: doc-detective maintainers
---

# Merge integrations.openApi per context and FAIL on unmatched response headers

## Context and Problem Statement

The `openApi` integration (`00090`) let `httpRequest` steps seed requests and validate responses against an OpenAPI definition, but the definition could only be attached at the spec/context where the steps lived — there was no way to declare a config-level OpenAPI integration and have it reach every context's `httpRequest` validation. Separately, when an expected response header did not match, the step did not fail, so header mismatches passed silently. Should config-level `openApi` flow down to each context, and should an unmatched expected header FAIL the step?

## Decision Drivers

* Users want to declare an OpenAPI integration once at config level, not per spec.
* Per-context `openApi` is what `httpRequest` validation actually reads, so the config-level value must reach it.
* An expected response header that does not match is a real assertion failure, not a pass.
* Existing matched-header behavior must be unchanged.

## Considered Options

* **A. Merge `integrations.openApi` onto each `context.openApi`, and FAIL the step on unmatched expected response headers** (chosen).
* **B. Require `openApi` to be declared per spec/context only.**
* **C. Merge config-level openApi but keep header mismatches non-fatal (warning).**

## Decision Outcome

Chosen option: **A**, because config-level declaration is the ergonomic users expect, and merging it onto every `context.openApi` puts it exactly where `httpRequest` validation already looks. Treating an unmatched expected header as a FAIL aligns header assertions with the rest of the response-assertion contract — an expected-but-absent/wrong header is a failed expectation.

Contract decided:

* `integrations.openApi` from config is merged onto each `context.openApi`, so it reaches `httpRequest` validation in every context.
* An unmatched expected response header now **FAILs** the step (previously non-fatal).

### Consequences

* Good: declare the OpenAPI integration once, applies everywhere.
* Good: header assertions are enforced like other response assertions.
* Bad: specs that relied on silent header mismatches will now FAIL (intended correction).

### Confirmation

Shipped in core `a90a936` (context merge + header FAIL behavior).

## Pros and Cons of the Options

### A. Merge per context + header FAIL
* Good: ergonomic config-level declaration; correct header enforcement.
* Bad: tightens behavior; previously-silent mismatches now fail.

### B. Per-context only
* Good: no merge logic.
* Bad: repetitive; no single config-level integration.

### C. Merge but warning-only headers
* Good: less disruptive.
* Bad: header expectations remain effectively unenforced.

## More Information

Recorded retrospectively (ADR backfill). Origin: core `a90a936`. Inventory ref: BACKFILL-INVENTORY.md Seq 188. Related: `00090` (OpenAPI integration for httpRequest), `00091` (validation resilience / readFile loader).
