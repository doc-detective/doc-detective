---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Keep authored scalar types through coercion

## Context and Problem Statement

`validate()` runs Ajv with `coerceTypes: true`, and the runner acts on the validated object. Ajv
tries `anyOf` branches in order, and a branch with a `type` keyword rewrites a value it doesn't
match before checking it. So the first branch in a union decides what an authored value becomes,
even when a later branch was written for it.

Several unions put a string branch first. Ajv turned booleans into strings there:

| Authored | Validated as | Effect |
|---|---|---|
| `{"find": {"selector": "#a", "click": false}}` | `click: "false"` | `findElement` checks `step.find.click` for truthiness, so the find clicked. |
| `{"find": {"elementAttribute": {"disabled": false}}}` | `"false"` | A value match on `disabled="false"`, not the documented absence check. The runtime's boolean branch never ran. |
| `{"click": true}` | `"true"` | Clicked an element whose text is "true". The schema listed `true` as an example. |
| `{"wait": true}` | `1` | The runner was fine (it reads the raw step), but every other `validate()` caller saw `1`. |

`src/common/AGENTS.md` already said "narrow scalar types before string". That order doesn't work
on its own. A leading `type: boolean` branch turns `"true"` into `true` and `1` into `true`. A
leading `type: number` branch turns `true` into `1`. Any order has a victim when two branches'
values convert into each other.

## Decision Drivers

* An authored boolean, number, or string reaches the runner with the type the author wrote.
* `"click": "true"`, quoted, still clicks a button labeled "true".
* `wait: 1`, `wait: "5000"`, and a `$VAR` that resolves to `"true"` keep working.
* No breaking change on 4.x. The fix ships as `fix:`.
* A test keeps the hazard from coming back.

## Considered Options

1. **Branch order only**: put the boolean branch first everywhere.
2. **Use a non-coercing form for each branch that comes first**: a `type` array, or a type-less
   `enum: [true, false]`.
3. **Turn off `coerceTypes`.**

## Decision Outcome

Chosen option: **2**. Ajv coerces only through `type`, and only when a value matches none of the
listed types. So:

* **Scalar-only unions become one `type` array.** All 8 `elementAttribute` copies (click,
  dragAndDrop, find, goTo `waitUntil.find`, screenshot `crop`, type, waitUntil, annotation) now
  use `additionalProperties: {"type": ["boolean", "number", "string"]}`. `true`, `5`, and `"true"`
  each keep their type.
* **`wait`** merges its number and boolean branches into one leading `["boolean", "number"]`
  branch, ahead of the `$VAR` string branch. `true` stays `true` and `1` stays `1`. Strings still
  coerce as before: `"5000"` becomes `5000` and `"true"` becomes `true`.
* **`click`** (also reached by `find.click`) puts its boolean branch first as
  `enum: [true, false]`. It matches only real booleans and coerces nothing, so `"true"` stays a
  string for the free-form string branch, and `false` never reaches that branch.
* **`record` and `screenshot`** put a plain `type: boolean` branch first. Their string branches
  need a file extension, so they never wanted `"true"` or `"false"`. A `$VAR` that resolves to
  `"true"` still means `true`.
* **A top-level boolean `click` fails** with
  `` `click` needs an element, not true. To click an element whose text is "true", quote it: "click": "true". ``
  (and the same with `false`). It names no element, and silently clicking text "true" was the bug.
  `true` is gone from `click_v3`'s `examples`. Inside `find`, `click: true` and `click: false`
  keep their meaning.

The schema docs generator renders a type-less boolean `enum` as `boolean`.

### Consequences

* Good: `find.click: false` finds without clicking. `elementAttribute` `true` and `false` check
  presence and absence, as documented, and `"true"` stays a value match.
* Good: every `validate()` caller, including the LSP and common's users, sees authored types.
* Neutral: `elementAttribute` values that match no listed type, such as `null`, still coerce,
  in type-array order. `null` becomes `false`.
* Neutral: `record: 1` and `screenshot: 0` now validate as `true` and `false`. They used to
  fail.
* Bad: `{"click": true}` and `{"click": false}` used to pass when the page had an element with
  that text. They now FAIL with a message that says how to keep the old behavior. Version 5.0
  rejects them at validation.

### Confirmation

* [src/common/test/validate.test.js](../src/common/test/validate.test.js) ("authored scalar types
  survive coercion") checks each shape above. They failed before the change.
* A ratchet in [src/common/test/schema.test.js](../src/common/test/schema.test.js) walks every
  schema. It fails on any `anyOf`/`oneOf` where a branch's `type` would coerce a value meant for a
  later branch. That's a string branch before a boolean or number branch, or a number branch and
  a boolean branch in either order.
* [test/findElement.test.js](../test/findElement.test.js) checks that `find.click: false` clicks
  nothing, and that `click: true` and `click: false` FAIL with the message above.
* [test/core-artifacts/interactions/coercion.spec.json](../test/core-artifacts/interactions/coercion.spec.json)
  runs `find.click` `false`, `true`, and `"right"`, `elementAttribute` `true`, `false`, and
  `"true"`, and `click: "true"` in a browser.

## Pros and Cons of the Options

### Branch order only

* Good: the smallest diff.
* Bad: no order is safe. Boolean-first breaks `"click": "true"` and `wait: 1`. Number-first
  breaks `wait: true`.

### Non-coercing first branches (chosen)

* Good: authored types survive, and the existing string and number coercions keep working.
* Neutral: two techniques, picked by whether the branches carry constraints. Both are in
  `src/common/AGENTS.md`.

### Turn off `coerceTypes`

* Good: no coercion surprises anywhere.
* Bad: breaks every spec that relies on coercion today, such as `wait: "5000"`, quoted numbers
  in YAML, and `$VAR` values that resolve to numbers. That's a breaking change.
