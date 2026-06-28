---
status: accepted
date: 2024-09-28
decision-makers: doc-detective maintainers
---

# Arazzo workflow support

## Context and Problem Statement

Arazzo 1.0 is the OpenAPI Initiative's specification for describing multi-step API workflows (a sequence of operations with inputs and outputs). Doc Detective already drove individual `httpRequest` steps and could resolve OpenAPI documents, but had no way to consume an Arazzo description and run it as a test. Should Doc Detective translate Arazzo into its own spec model so existing runner machinery executes it, or treat Arazzo as a foreign format requiring a separate engine?

## Decision Drivers

* Arazzo workflows are a standard, declarative way to express API test sequences.
* Reusing the existing `httpRequest` step + verdict model avoids a parallel engine.
* OpenAPI source descriptions referenced by Arazzo must resolve before validation.
* Negative tests (expected 4xx/5xx) must not auto-FAIL.

## Considered Options

* **A. Translate Arazzo 1.0 → Doc Detective spec in `src/arazzo.js`** (chosen).
* **B. Build a dedicated Arazzo execution engine separate from the runner.**
* **C. Don't support Arazzo; require hand-authored httpRequest tests.**

## Decision Outcome

Chosen option: **A**. `src/arazzo.js` maps Arazzo `workflows` → Doc Detective tests, `steps` → `httpRequest` steps, and `sourceDescriptions` → the `openApi[]` integration array, so the standard runner executes the result. OpenAPI resolution was reordered to run *before* validation so referenced operations are available, and negative tests (expecting 4xx/5xx status codes) no longer auto-FAIL — an expected error status is a pass.

### Consequences

* Good: standard Arazzo workflows run through the existing engine and verdict model.
* Good: OpenAPI source descriptions resolve ahead of validation.
* Good: negative/error-path tests express expected non-2xx outcomes.
* Neutral: only the workflow/step subset that maps to `httpRequest` is supported.

### Confirmation

Shipped in core commits `d900af7`, `556a04a`, `a84a616`, `d0cbf2b`, `379b729` (`src/arazzo.js`, OpenAPI resolution reorder, 4xx/5xx handling).

## Pros and Cons of the Options

### A. Translate to Doc Detective spec
* Good: reuses runner, verdict, and OpenAPI machinery.
* Bad: bounded to constructs expressible as httpRequest steps.

### B. Dedicated Arazzo engine
* Good: full fidelity to the Arazzo model.
* Bad: a second execution path to build and maintain.

### C. No Arazzo support
* Good: nothing to build.
* Bad: users must hand-translate workflows into tests.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `d900af7`, `556a04a`, `a84a616`, `d0cbf2b`, `379b729`. Inventory ref: BACKFILL-INVENTORY.md Seq 135. Related: `00030` (httpRequest), `00090` (OpenAPI integration).
