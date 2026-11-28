---
status: accepted
date: 2026-11-28
decision-makers: hawkeyexl
---

# OpenAPI examples use schema `default` values

## Context and Problem Statement

When an OpenAPI operation has no `example` or `examples`, Doc Detective generates one from the
schema with json-schema-faker. That generated example becomes the mock response body for
`openApi.mockResponse`, and the request body, parameters, and headers for `openApi.useExample`.

json-schema-faker ignores `default` unless `useDefaultValue` is on, and it was off. So a field
declared `{ "type": "integer", "default": 7 }` came back as a random integer. A schema `default` is
the value the API author documented, so it's the value an example should carry.

[ADR 01246](01246-inline-response-schema-for-httprequest.md) stopped the response-schema check from
applying defaults, because a check must not change the response. This ADR is about the other
direction: building examples, where using the default is the point.

## Decision Drivers

* A mock response should look like what the API documents.
* Explicit `example` and `examples` values still win over anything generated.
* Response validation must stay a check, not a transform (ADR 01246).

## Considered Options

* Turn on json-schema-faker's `useDefaultValue` (chosen).
* Keep random values.

## Decision Outcome

Chosen option: turn on `useDefaultValue` in the shared json-schema-faker generator in
`src/core/openapi.ts`.

### Behavior

* A generated example uses a field's schema `default` when it has one. That applies to mock response
  bodies, request bodies, parameters, and headers.
* An `example` or `examples` entry is still used first. Generation, and so the default, applies only
  when the operation has none.
* Response validation is unchanged: defaults still aren't applied when a response is checked.
* Unchanged limits: `optionalsProbability: 0` still leaves optional fields out of a generated value,
  and a falsy value (`0`, `false`, `""`) is still dropped from a generated object.

### Consequences

* Good, because mock responses carry the documented values, so a step that checks them gets a
  stable value instead of a random one.
* Neutral, because a step that relied on a random value in place of a default now gets the default.
  A step that checked such a field by type or schema still passes, as long as the default meets
  that schema.

### Confirmation

* `test/openapi-coverage.test.js`: a response body and a request body built from schemas with
  defaults carry those defaults.
* Fixture `test/core-artifacts/http/openapi-mock-defaults.spec.json`: an `openApi.mockResponse` step
  checks the mock body against an inline `response.schema` that requires the default values.

## Pros and Cons of the Options

### Turn on `useDefaultValue` (chosen)

* Good, because it's one option on the generator Doc Detective already uses.
* Good, because it covers every example path at once: responses, request bodies, and parameters.

### Keep random values

* Bad, because a mock response ignores the values the API documents.
