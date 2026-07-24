---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Fix `click` string shorthand verifying existence but never clicking

## Context and Problem Statement

The `click` action accepts three shapes: `true`, a detailed object (`{ "click": { "elementText": … } }`),
and a **string shorthand** (`{ "click": "Some text" }`) that finds an element by selector / text /
aria / id / test id and clicks it. All three are documented in
[docs/fern/pages/reference/schemas/click.mdx](../docs/fern/pages/reference/schemas/click.mdx).

`clickElement` ([src/core/tests/click.ts](../src/core/tests/click.ts)) delegates to `findElement`
with `click: true` so the click runs as a sub-effect of the find. But `findElement`
([src/core/tests/findElement.ts](../src/core/tests/findElement.ts)) handled the string shorthand in
an early branch that returned immediately after evaluating the existence assertion — before the
click sub-effect at the bottom of the function ever ran. Result: `{ "click": "Some text" }` only
**verified the element exists** and reported PASS without clicking. A fixture step
`{ "click": "Open child in new tab" }` against a `target="_blank"` link PASSed while no new tab
opened; the object form clicked correctly.

This is an execution bug, not a contract change: the documented contract has always been "find the
element and click it".

## Decision Drivers

* Restore the documented string-shorthand semantics: the element must actually be clicked.
* Keep the unified assertion model intact: existence is the single implicit assertion; the click
  remains EXECUTION (a click failure sets FAIL with no extra assertion record), matching the
  criteria path.
* Don't change the object/criteria path or the not-found shorthand path.
* Keep recording parity: the criteria path waits after interaction when a recording is active.

## Considered Options

* **Add the click sub-effect (and recording wait) to the shorthand branch**, mirroring the criteria
  path's block.
* **Restructure `findElement`** so the shorthand branch falls through into the shared sub-effect
  tail (normalize `step.find` to an object after the shorthand search).
* **Convert the shorthand in `clickElement`** to a detailed find object before delegating.

## Decision Outcome

Chosen: **add the click sub-effect to the shorthand branch**. When the shorthand finds an element
and the caller requested a click (the `click` param `clickElement` passes), `findElement` now clicks
the element with the left button (the string form carries no `button` field, so the default
applies), appends "Clicked element." to the description, and on error sets FAIL with the same
"Couldn't click element." description as the criteria path — with no extra assertion record. The
recording-active wait also runs on this path for parity.

The fall-through restructure was rejected as a larger refactor with more behavioral surface (the
shorthand search strategy differs from the criteria search, so the branches can't share the finding
step), and the `clickElement`-side conversion was rejected because shorthand strings resolve by a
multi-strategy parallel search (`findElementByShorthand`) that the detailed criteria object cannot
express.

### Consequences

* Good: `{ "click": "…" }` now clicks, matching the documented contract and the object form.
* Good: assertion semantics are unchanged — found→PASS, not-found→FAIL, click-error→FAIL with the
  single existence assertion record.
* Neutral: specs whose string-form clicks previously "passed" as silent no-ops will now perform the
  real click, which can surface real navigation or side effects. This is the intended, documented
  behavior; such specs were reporting false PASSes.
* Trade-off: a small amount of duplicated sub-effect code between the shorthand and criteria
  branches, accepted to keep the fix minimal and reviewable.

### Confirmation

Stub-driver unit tests in [test/findElement.test.js](../test/findElement.test.js) assert that the
shorthand path invokes `element.click` when a click is requested (red before the fix) and that a
throwing click yields FAIL with the existence assertion still PASS and no extra record.
[test/interaction-assertions.test.js](../test/interaction-assertions.test.js) asserts the same
through `clickElement` with `{ "click": "Submit" }`. The feature fixture
[test/core-artifacts/click-shorthand.spec.json](../test/core-artifacts/click-shorthand.spec.json)
proves the click end-to-end: each button on
[test/server/public/click-shorthand.html](../test/server/public/click-shorthand.html) appends a
message only when actually clicked, and a following `find` step asserts the message — covering the
text, selector, and regex shorthand permutations plus the object form for parity.

## Docs impact

None. The string shorthand is already documented as clicking the element
([click.mdx](../docs/fern/pages/reference/schemas/click.mdx) example `{ "click": "Submit" }`); this fix
restores the documented behavior. No page, flag, or output changes.

## Pros and Cons of the Options

### Add the click sub-effect to the shorthand branch

* Good: minimal, targeted; preserves all existing branch behavior; easy to review.
* Bad: duplicates the click try/catch between two branches.

### Restructure `findElement` to a shared sub-effect tail

* Good: single click code path.
* Bad: larger refactor; the shorthand and criteria finding strategies differ, so unification only
  covers the tail and risks subtle behavior drift (descriptions, defaults) in a bug-fix commit.

### Convert the shorthand in `clickElement` before delegating

* Good: `findElement` untouched.
* Bad: impossible without losing behavior — the shorthand's multi-strategy search (selector OR text
  OR aria OR id OR test id, plus regex) has no equivalent detailed-criteria representation.
