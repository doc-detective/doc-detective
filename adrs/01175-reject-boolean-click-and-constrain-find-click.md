---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Reject boolean click and constrain find.click

Extends [ADR 01161](01161-keep-authored-scalar-types-through-coercion.md) to version 5, and applies
[ADR 01167](01167-validate-returns-the-effective-step.md) to the browser actions.

## Context and Problem Statement

`click` and `find.click` share a name and mean different things. A top-level `click` string names the
element, so `"click": "right"` clicks the element whose text is "right". A `find.click` string names the
mouse button, so `{"find": {"selector": "#a", "click": "right"}}` right-clicks. Version 4 also accepted:

| Authored | Version 4 |
|---|---|
| `{"click": true}` | Ajv coerced it to `"true"` and clicked the element whose text is "true". ADR 01161 made it FAIL at run time instead. |
| `{"find": {"selector": "#a", "click": "Submit"}}` | `find.click` reused the whole `click` schema, so any string was valid. The handler ignored it and left-clicked. |
| `{"find": {"selector": "#a", "type": {"keys": "x", "selector": "#b"}}}` | The guard only rejected a `type` with all seven locators. `#b` was ignored. |
| `{"click": {"selector": "#a", "timeout": -1}}` | Valid. So were negative `find` and `dragAndDrop` locator timeouts, a negative `type.inputDelay`, and a negative annotation target timeout. |
| `{"dragAndDrop": {"source": "a", "target": "b", "duration": 0}}` | `duration \|\| 1000` dragged for 1000 ms. |

Each of these does something other than what was written, without saying so. And each browser handler
expanded its own shorthand and applied its own defaults, which ADR 01167 moves into `validate()`.

## Decision Drivers

- A step that can't do what it says fails validation, before anything runs, with a message that says
  how to fix it.
- `"click": "true"`, quoted, still clicks a button labeled "true".
- `find.click: true`, `false`, and a button name keep working.
- Units stay in names. No field is renamed.
- The effective step is the one the runner acts on and the report echoes.

## Considered Options

1. **Reject in the schema, with ajv-errors messages**, and normalize in `validate()`.
2. **Keep the boolean branch, and reject in the click normalizer** with a `NormalizeError`.
3. **Keep version 4's run-time FAIL.**

## Decision Outcome

Chosen option: **1**.

- **`click` has no boolean branch.** The root is an `allOf`: first a `not: {enum: [true, false]}`
  guard, then the `anyOf` of the string and object forms. Without the guard, Ajv's `coerceTypes` would
  turn `true` into `"true"` for the string branch. `allOf` checks its members in order, so the guard,
  and its ajv-errors `errorMessage`, see the authored boolean before the `anyOf` coerces it. The message
  reads
  ``must be string or object (got true). To click an element whose text is "true", quote it: "click": "true"``.
- **`find.click` is `boolean | "left" | "right" | "middle" | {button, duration}`.** The boolean branch
  comes first as a plain `type: boolean`, which is safe because the next branch is an enum (ADR 01161).
  Any other string is invalid: `must be equal to one of the allowed values`, which the shared error
  format prints as `must be one of left, right, middle (got "Submit").`
- **`find.type` can't set a locator.** Each of the seven locator keys has its own guard,
  `not: {type: object, required: [key]}`, so its `errorMessage` names the key, for example
  ``must not set `selector` (`find` already locates the element)``.
- **Bounds.** Every timeout, duration, and delay in `click`, `find`, `type`, `dragAndDrop`, `swipe`,
  and annotations has `minimum: 0`, or `minimum: 1` where it already had one. Names and units don't
  change, and each description says "milliseconds". `annotation.transition.durationMs` keeps its name.
- **`elementAttribute` values are one `type` array**, `["boolean", "number", "string"]`, in `click`,
  `find`, `type`, `dragAndDrop`, and annotations, as ADR 01161 does on 4.x.
- **The effective step.** Each action's normalizer, in `src/common/src/normalize/`:
  - `click`: an object gets `timeout: 5000` and `button: "left"`. A string stays a string.
  - `find`: an object gets `timeout: 5000` and `moveTo: false`. A `click` that clicks becomes
    `{button, duration}`: `true` is `{button: "left"}`, and `"right"` is `{button: "right"}`. `false`
    stays `false`. `type` is normalized like a `type` step. A string stays a string.
  - `type`: keys alone become `{keys: [...]}`, one key becomes a list of one, and `inputDelay: 100` and
    `timeout: 5000` are filled.
  - `dragAndDrop`: `duration: 1000` is filled, and an authored `0` stays.
  - `swipe`: a direction becomes `{direction, distance: 0.5, duration: 500}`. A point-to-point swipe gets
    only the duration.
  - Locators list their classes: `elementClass: "btn"` becomes `["btn"]`. The `type` handler used to pass
    a string through, and the class check read it one character at a time.
  - `annotate` has nothing to normalize. An annotation's style comes from config at run time.
- **`click` and `find` strings stay strings.** They search by any identifier: text, ARIA name, ID, test
  ID, or selector. No object field means "any of these", so there's no object form to expand to, and
  their handlers dispatch on the string. The shorthand ratchet in `test/shorthand-ratchet.test.js`
  bottoms out at those two files.

### Consequences

- Good: each of the version 4 surprises above fails validation, with exit code `2`, and names its path.
- Good: the language server and Online see the same messages, because they come from the schema.
- Good: report steps show the click, keys, and durations that ran.
- Bad: specs with `"click": true`, a non-button `find.click` string, a locator in `find.type`, or a
  negative timeout stop validating. The upgrade guide lists each fix.
- Bad: report consumers that read `find.click` as `true` or `"right"` read `find.click.button`. A `type`
  step's `keys` is always a list.
- Neutral: the CLI's current error summary passes `errorMessage` text through whole. The shared error
  format replaces it and does the same.

### Confirmation

- `src/common/test/validate.test.js` ("browser action bounds") covers each rejected shape, the accepted
  `find.click` forms, and the authored scalar types.
- `src/common/test/normalize.test.js` covers each effective step, idempotence, and the parity check
  against each schema's plain defaults.
- `test/findElement.test.js` covers `find.click` `false`, `true`, and `"middle"`, and `click: true` and
  `false` failing with the hint. `test/browser-actions-coverage.test.js` covers a `dragAndDrop` duration
  of `0`.
- `test/core-artifacts/cli/browser-tightening.spec.json` asserts exit `2` for each rejected shape
  through the CLI. `test/core-artifacts/interactions/find-click.spec.json` runs `find.click` with each
  button, `true`, `false`, and a `dragAndDrop` duration of `0` in a browser.

## Pros and Cons of the Options

### Reject in the schema

- Good: one rule for every `validate()` consumer and for editors that read the published schema.
- Good: the message lives next to the rule.
- Bad: the guard has to sit in an `allOf` member ahead of the union. Beside the union, ajv-errors
  renders after `anyOf` has coerced the value, and the message would echo `"true"`.

### Reject in the normalizer

- Good: the normalizer sees the authored boolean.
- Bad: the published schema would still list a boolean branch, so editors would accept `"click": true`.

### Keep the run-time FAIL

- Good: no breaking change.
- Bad: the spec runs until that step, and a run with `--no-exit-on-fail` hides it. Version 5's rule is
  that an invalid spec doesn't run.
