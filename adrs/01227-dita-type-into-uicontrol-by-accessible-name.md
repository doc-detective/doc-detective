---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# DITA types into a `<uicontrol>` by accessible name

## Context and Problem Statement

DITA's built-in `typeIntoUiControl` definition turns
`Type <userinput>Hello, DITA</userinput> into the <uicontrol>Type here:</uicontrol> field.` into a
`type` step. It put the `<uicontrol>` text in `selector`:

```json
{ "type": { "keys": "Hello, DITA", "selector": "Type here:" } }
```

`selector` is CSS. A `<uicontrol>` holds the label a reader sees, such as `Username` or `Type here:`,
not CSS. So the step either fails, with WebDriver's `invalid selector` for a label that isn't valid
CSS, or matches the wrong thing, such as a `<username>` tag. Every detected DITA type step was broken.

Which `type` locator should the detected step use for the control's label?

## Decision Drivers

* The step must find the field a reader would type into, from the label the doc shows.
* Use a locator `type` already has, so the detected step is one a user could write by hand.
* Work for a field labelled by `<label for>`, by a wrapping `<label>`, or by `aria-label`.

## Considered Options

* `elementAria`: the field's computed accessible name.
* `elementText`: the element's display text.
* Keep `selector`, prefixed `aria/`.

## Decision Outcome

Chosen option: `elementAria`, because a field's accessible name is its label, so it finds the field
itself. The detected step is now:

```json
{ "type": { "keys": "Hello, DITA", "elementAria": "Type here:" } }
```

The `find` step that `findUiControl` detects for the same `<uicontrol>` doesn't change.

### Consequences

* Good, because detected DITA type steps now type into the labelled field and pass.
* Good, because `aria-label` fields work too, which have no visible text to match.
* Bad, because a configuration or test that relied on the old `selector` shape sees a different step.
  The old step couldn't have passed against a real label, so nothing that worked breaks.

### Confirmation

* `src/common/test/builtins.test.js` checks the step that the DITA sentence detects, and the
  parity test with the regex tables lists the `selector` to `elementAria` change as intended.
* The `test/core-artifacts/interactions/dita-type-into-uicontrol.spec.json` fixture runs a DITA task
  with step detection on, against the `type-echo.html` test page, and checks that the typed text
  reaches the page.

## Pros and Cons of the Options

### `elementAria`

* Good, because the accessible name comes from the field's `<label>` or `aria-label`, so the field
  itself matches.
* Good, because app surfaces map it to the native accessible name too.

### `elementText`

* Good, because the step passed against `type-echo.html` in a trial run.
* Bad, because it matches the `<label>`, not the field. Typing works only because the browser focuses
  a label's field when the label is clicked. A field named by `aria-label` has no label to match.

### `selector` prefixed `aria/`

* Good, because WebdriverIO reads `aria/<name>` as an accessible-name query.
* Bad, because it's a WebdriverIO detail inside a field documented as CSS, while `elementAria` is the
  documented field for an accessible name.
