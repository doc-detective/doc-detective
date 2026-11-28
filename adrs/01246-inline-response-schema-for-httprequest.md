---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Check `httpRequest` responses against an inline JSON Schema

## Context and Problem Statement

`httpRequest` checks response values in two ways. `response.body` matches a subset of exact values,
and `response.required` checks that fields exist with any value. Neither can say "`id` is a UUID",
"`created` is a date-time", or "`code` looks like `INV-1042`". Those values change on every run, so
an exact match fails and an existence check proves little.

API test tools such as Karate cover this with type and format markers (`#uuid`, `#string`,
`#regex`). Doc Detective can already validate a response against a schema, but only one taken from
an OpenAPI description. Authors without an OpenAPI file have no way to check types.

Separately, the runner's response-schema AJV instance never loaded `ajv-formats`. With
`strictSchema: false`, AJV ignores an unknown `format` without a warning. So `format: "uuid"` in an
OpenAPI response schema has never been enforced.

How should a spec check the types, formats, and patterns of a response body?

## Decision Drivers

* Diego (D2) needs to check API responses whose values change on every run.
* No new syntax. JSON Schema is already the contract language across Doc Detective.
* Reuse the existing response-schema check and its `responseSchemaValid` output.
* A `format` in a schema must mean what it says.

## Considered Options

1. **`response.schema`: an inline JSON Schema, checked by the existing response-schema check**
   (chosen).
2. **Karate-style markers inside `response.body`**, such as `"id": "#uuid"`.
3. **A `responseSchemaPath` pointing at a schema file only.**

## Decision Outcome

Chosen option 1.

### Interface

```json
{ "httpRequest": { "url": "https://api.example.com/invoices/42",
  "response": { "schema": {
    "type": "object", "required": ["id", "code"],
    "properties": { "id": { "type": "string", "format": "uuid" },
                    "code": { "type": "string", "pattern": "^INV-\\d+$" } } } } } }
```

| Key | Type | Default | Effect |
|---|---|---|---|
| `response.schema` | object (a JSON Schema) | none | The response body must match it. Omitted, the OpenAPI operation's response schema applies when `validateAgainstSchema` is `response` or `both` and the operation defines one. |

### Behavior

* The check runs when `response.schema` is set, or, as before, when `openApi.validateAgainstSchema`
  is `response` or `both` and the operation has a response schema.
* **The inline schema takes precedence.** When both apply, only `response.schema` is checked. It's
  the more specific statement, and one source keeps one assertion.
* The result is the existing assertion `$$outputs.responseSchemaValid == true`. The description
  names the source: "the response schema" or "the OpenAPI schema".
* **Formats are enforced** through `ajv-formats` for both sources. This includes `uuid`, `email`,
  `date-time`, `uri`, and the other `ajv-formats` formats. The OpenAPI request-body check
  (`validateAgainstSchema: request` or `both`) enforces them too, so `format` means the same thing
  in every schema Doc Detective checks.
* A schema that isn't valid JSON Schema, such as `"minimum": "x"`, FAILs the step with
  ``Couldn't check the response against the <source> schema because the schema isn't valid JSON
  Schema: <AJV error>.`` It doesn't crash the run.
* The check never changes the response. Schema `default` values aren't applied, so a default
  can't satisfy `required` or show up as an extra field. A `$async` schema is awaited.
* `response.schema` composes with `response.body`, `response.required`, and
  `allowAdditionalFields`. Each keeps its own assertion.

### Consequences

* Good, because authors can check changing values by type, format, and pattern without an OpenAPI
  file.
* Good, because there's no new syntax to learn and nothing new to maintain in the runner.
* **Bad, for some existing OpenAPI users:** a response schema with a `format` that the API doesn't
  honor used to pass silently and now FAILs. The same goes for a request body that doesn't match a
  `format` in the request schema: the step now FAILs before sending the request. That's a correction, but it can turn a green run red
  after an upgrade. The failure message includes the AJV error, which names the format.
* Neutral, because when both schemas apply, the runner skips the OpenAPI response schema. Authors who want
  both checked can copy what they need into `response.schema`.

### Confirmation

* `src/common/test/validate.test.js` accepts an object `response.schema` and rejects a non-object.
* `test/httprequest-coverage.test.js` (`response.schema (inline JSON Schema)`) covers a pass, a type
  mismatch, failed `uuid` and `email` formats, a failed pattern, inline-over-OpenAPI precedence, and
  enforced formats in an OpenAPI schema.
* Fixture [test/core-artifacts/http/httpRequest_schema.spec.json](../test/core-artifacts/http/httpRequest_schema.spec.json)
  covers each permutation end to end against the echo server.

## Pros and Cons of the Options

### `response.schema` (chosen)

* Good, because it reuses JSON Schema, AJV, and the existing check.
* Good, because editors can autocomplete and validate it like any schema.
* Bad, because a schema is wordier than a marker for a one-field check.

### Markers inside `response.body`

* Good, because a check is short: `"id": "#uuid"`.
* Bad, because it's a second mini-language. It's also ambiguous: a body that really contains the
  string `"#uuid"` can't be matched exactly.

### A schema file only

* Good, because large schemas stay out of the spec.
* Bad, because a small check then needs a separate file. A file path can be added later without
  changing this decision.
