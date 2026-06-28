---
status: accepted
date: 2024-09-04
decision-makers: doc-detective maintainers
---

# OpenAPI integration for httpRequest (operation engine + mock responses)

## Context and Problem Statement

`httpRequest` required an author to spell out the full request — URL, method, headers, body — for
every call. When the API already has an OpenAPI description, that is redundant: the operation's
shape, examples, and response schema are all defined in the spec. There was also no way to drive a
request from an operation id or to validate/mock a response against the description. How should
`httpRequest` consume an OpenAPI description so requests can be seeded from operations and responses
validated against the schema?

## Decision Drivers

* OpenAPI descriptions already define operations, examples, and response schemas.
* Authors should be able to reference an operation instead of re-spelling the request.
* Responses should be validatable against the operation's schema.
* Tests may need a mock response when the live API is unavailable.
* Descriptions come in JSON and YAML and may be shared across a config/spec/test.

## Considered Options

* **A. Add an `openApi` object on httpRequest (top-level `oneOf[url, openApi]`), config
  `integrations.openApi[]`, and an operation engine that seeds requests from examples, validates
  responses against the schema, and can mock responses** (chosen).
* **B. A preprocessing step that expands OpenAPI operations into plain httpRequest steps.**
* **C. Keep httpRequest description-agnostic; require fully spelled-out requests.**

## Decision Outcome

Chosen option: **A**, because first-class OpenAPI awareness lets a request reference an operation
and reuse the description's examples and schema. The contract added an `openApi` object on the
httpRequest schema with a top-level `oneOf[url, openApi]`, config `integrations.openApi[]`, and a
core operation engine (`src/openapi.js`) that does example seeding, schema validation, mock-response
generation, and YAML-defs handling; spec/test gained `openApi` arrays, and `definitionPath` was
renamed `descriptionPath` (common `30e9b7df`, `2edf0919`, `a3e2ffc7`, `a8305d89`, `f85089aa`,
`b4f2525c`, `8fe87a84`, `c90e3598`; core `47466440`, `c18bf49`, `74fa0fb`, `4a81d2a`, `c33731a`,
`d4287474`, Seq 132). In the monorepo the OpenAPI commits are dep-bumps only; the feature was
authored upstream at these dates.

### Consequences

* Good: requests can be seeded from an OpenAPI operation instead of hand-written.
* Good: responses validate against the operation's schema; mock responses unblock offline tests.
* Good: descriptions can be shared at config/spec/test scope and supplied as JSON or YAML.
* Bad: a substantial operation engine and a new integration surface to maintain.
* Neutral: `definitionPath`→`descriptionPath` rename aligns terminology with OpenAPI.

### Confirmation

Shipped across doc-detective-common commits `30e9b7df`/`2edf0919`/`a3e2ffc7`/`a8305d89`/`f85089aa`/
`b4f2525c`/`8fe87a84`/`c90e3598` and doc-detective-core commits `47466440`/`c18bf49`/`74fa0fb`/
`4a81d2a`/`c33731a`/`d4287474`. The `openApi` object and `integrations.openApi[]` are part of the
schemas; the operation engine lives in `src/openapi.js`.

## Pros and Cons of the Options

### A. First-class openApi object + operation engine
* Good: operation-driven requests; schema validation; mock responses; JSON/YAML.
* Bad: large integration surface.

### B. Preprocess into plain httpRequest steps
* Good: keeps httpRequest description-agnostic.
* Bad: no live schema validation/mocking; lossy expansion.

### C. No OpenAPI awareness
* Good: nothing to add.
* Bad: redundant request authoring; no schema/mocking benefit.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `30e9b7df`,
`2edf0919`, `a3e2ffc7`, `a8305d89`, `f85089aa`, `b4f2525c`, `8fe87a84`, `c90e3598`;
doc-detective-core commits `47466440`, `c18bf49`, `74fa0fb`, `4a81d2a`, `c33731a`, `d4287474`.
Inventory ref: BACKFILL-INVENTORY.md Seq 132. Related: `00030` (httpRequest action), `00092`
(Arazzo support), later `00128` (openApi context merge + header FAIL).
