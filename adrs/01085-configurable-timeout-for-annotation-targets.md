---
status: accepted
date: 2026-07-26
decision-makers: doc-detective maintainers
---

# Configurable `timeout` on annotation element targets

## Context and Problem Statement

Annotation targets already resolve through the same `findElement()` that `find`, `click`,
`dragAndDrop`, and `goTo` use. `resolveAnnotationRects` in
[src/core/annotations/geometry.ts](../src/core/annotations/geometry.ts) hands it a criteria object
built by `criteriaFromTarget`, which whitelists exactly seven fields:

```ts
return {
  selector: target?.selector,
  elementText: target?.elementText,
  elementId: target?.elementId,
  elementTestId: target?.elementTestId,
  elementClass: target?.elementClass,
  elementAttribute: target?.elementAttribute,
  elementAria: target?.elementAria,
};
```

`timeout` is not in that list, so it was dropped even when an author wrote it, and
`findElementByCriteria` fell back to its hardcoded 5000 ms parameter default. `find` could ask for
longer; an annotation pointing at the *same element* could not. Nothing about annotations justifies
that — it was an omission in a field list, not a decision.

The cost was real and already being paid inside this repo.
[test/core-artifacts/recording/annotate.spec.json](../test/core-artifacts/recording/annotate.spec.json)
pairs **every** element-targeting `annotate` with a guard `find` at `timeout: 20000`, and carries a
paragraph of prose explaining why:

> Guard every annotation target with a preceding `find`. […] on a slow headed browser (notably
> Windows CI) a bare goTo/navigation can hand off before the element is queryable and the annotate
> FAILs; `find` waits for the element, closing that race.

[PR #679](https://github.com/doc-detective/doc-detective/pull/679) proposed responding to this by
*documenting* the gap — a find-vs-annotate comparison table plus a troubleshooting entry teaching
authors the guard-`find` workaround. That codifies the asymmetry into the contract rather than
closing it, and leaves every author to rediscover the workaround.

## Decision Drivers

* An author who knows `find`'s `timeout` should not have to learn that annotations are different.
* The runtime is already a single code path; the fix should not add a second one.
* Screenshot `annotations` and `annotate` steps share `annotation_v3` — closing the gap on one and
  not the other would trade one asymmetry for another.
* Schema size and generated-type quality are live constraints in this package (see the `$comment`s
  on `annotation_v3` and `annotate_v3`).

## Considered Options

1. **`timeout` on the annotation's element target**, inline in `annotation_v3`'s
   `target_element_shape`.
2. **`timeout` on the `annotate` step**, alongside `add` / `update` / `clear`.
3. **Share `find_v3`'s schema by `$ref`** so there is literally one definition.
4. **Document the asymmetry** (PR #679's approach) and keep the guard-`find` workaround.

## Decision Outcome

Chosen option: **1, `timeout` on the annotation's element target**, because it is the same field, in
the same shape, with the same name, unit, and default as `find` — which is what makes the asymmetry
disappear rather than merely become documented. Because `annotation_v3` is shared, screenshot
`annotations` get it in the same change.

The runtime change is one field in `criteriaFromTarget`. Every consumer already honors it:
`findElement` reads `step.find.timeout` on both its browser and app paths, and
`findElementByCriteria` takes it as a parameter. No new resolution path exists.

`timeout` is deliberately **not** listed in `target_element_guard`, so `{"outline": {"timeout":
8000}}` stays invalid — a deadline cannot be the only thing identifying an element.

### Why not the alternatives

**Option 2 (step-level `annotate.timeout`)** works with the `{"outline": "#foo"}` string shorthand,
which option 1 does not. But screenshot `annotations` have no `annotate` step to hang it on, so
they would keep the fixed 5000 ms — trading the find-vs-annotate asymmetry for an
annotate-vs-screenshot one. It also gives one deadline to a payload that may target several
elements with very different readiness. Option 1's shorthand limitation is not a new rule to learn:
`find`'s string form can't carry a timeout either.

**Option 3 (`$ref` into `find_v3`)** is the most appealing on principle and fails on three concrete
points:

* `find_v3`'s detailed object bundles *action* fields with finding fields — `moveTo`, `click`,
  `type`, `surface`. `{"outline": {"selector": "#x", "click": true}}` would validate. An annotation
  that clicks is not a thing.
* Draft-07's `additionalProperties: false` does not compose through `allOf`. Both `find_v3`'s object
  and `annotation_v3`'s `target_element_shape` set it, so they cannot be intersected — the same
  constraint already documented in [annotationDefaults_v3](../src/common/src/schemas/src_schemas/annotationDefaults_v3.schema.json)'s
  `$comment`.
* Dereferenced `find_v3` is 452 KB (it pulls in `click_v3` and `type_v3`). `annotate_v3` is 230 KB
  and already carries two copies of `annotation_v3`; six target keys x two copies would inline it
  repeatedly. And `FindElementDetailed` currently generates as `{[k: string]: unknown}` — the
  index-signature collapse `annotation_v3`'s `$comment` warns about. Annotation targets generate
  real types today; this would erase them.

Field-level `$ref` into a shared components block (the pattern `click_v3` uses for
`button`/`duration`) avoids all three, but was judged more surface than the drift it removes for a
single field. The finding fields have already drifted across four schemas — `click_v3` is missing
`timeout` too — and unifying them is its own change, not a rider on this one.

**Option 4 (document it)** makes every author carry a workaround for a one-field omission.

### Consequences

* Good: the guard-`find` scaffolding in `annotate.spec.json` can be deleted; the fixture says what
  it means.
* Good: screenshot `annotations` gain the same knob at no extra cost.
* Good: no default is duplicated in the runtime. `criteriaFromTarget` passes `undefined` through
  when the target omits `timeout`, and find applies its own 5000 ms.
* Neutral: the `default: 5000` in the schema is inert at runtime — Ajv ignores `default` inside
  `anyOf`, which is how every target is reached. It exists to document the wait on the generated
  reference page, exactly as `find_v3`'s does.
* Bad/limit: `renderLayer` re-resolves **every** stored annotation on each render, including the
  navigation re-mount in [src/core/tests.ts](../src/core/tests.ts). A long `timeout` is therefore
  paid again on each re-render, not only the first. Applying it uniformly was chosen over
  first-resolve-only because the alternative is a hidden special case: the same annotation would
  wait differently depending on whether a navigation had happened since.
* Bad/limit: `timeout: 0` is inconsistent across surfaces, because `findElement` uses `|| 5000` on
  its browser path and `?? 5000` on its app path. So `0` means "check once" on an app surface and
  "wait 5000 ms" in a browser. This is pre-existing `find` behavior that annotations now inherit
  rather than anything introduced here; fixing it changes `find` and belongs in its own ADR.
* Bad/limit: the `{"outline": "#foo"}` string shorthand still cannot carry a timeout. Authors who
  need one expand to the object form, as they already do for `find`.

### Confirmation

* Schema: positive and negative cases in
  [src/common/test/validate.test.js](../src/common/test/validate.test.js) — a target with a
  `timeout` validates, a target whose *only* field is a `timeout` does not, and a non-integer does
  not.
* Runtime: [test/annotations-geometry.test.js](../test/annotations-geometry.test.js) pins
  `criteriaFromTarget`'s pass-through and drives `resolveAnnotationRects` end-to-end against a
  never-matching driver, asserting a 300 ms target returns in well under the old hardcoded 5000 ms.
* Failure path unchanged: [test/annotate-step.test.js](../test/annotate-step.test.js) asserts a
  never-appearing target still FAILs, bounded by the requested deadline, with the stored annotation
  set left untouched.
* End-to-end: [test/core-artifacts/recording/annotate-timeout.spec.json](../test/core-artifacts/recording/annotate-timeout.spec.json)
  annotates an element that appears only after the 5000 ms default would have lapsed, across the
  single-element, `all`, `update`, and screenshot-annotation paths.

## Pros and Cons of the Options

### 1. `timeout` on the element target

* Good, because it is byte-for-byte the field `find` already has — nothing new to learn.
* Good, because screenshot `annotations` are covered by the same change.
* Good, because it is per-target, so one slow element doesn't impose its deadline on the rest.
* Good, because the runtime change is one field in an existing whitelist.
* Bad, because the string shorthand can't carry it (as with `find`).
* Bad, because it adds an eighth duplicated finding field to a set already drifting across four
  schemas.

### 2. `timeout` on the `annotate` step

* Good, because it works with the string shorthand.
* Good, because one knob covers a whole payload.
* Bad, because screenshot `annotations` get nothing, replacing one asymmetry with another.
* Bad, because a single deadline is wrong for a payload targeting elements with different readiness.
* Bad, because it invents a placement `find` doesn't have, which is the thing being fixed.

### 3. `$ref` into `find_v3`

* Good, because it would be a genuine single source of truth.
* Good, because future finding fields would propagate for free.
* Bad, because it would let annotations carry `click` / `moveTo` / `type` / `surface`.
* Bad, because `additionalProperties: false` doesn't compose through `allOf`.
* Bad, because it would inline a 452 KB schema repeatedly and collapse the generated types to index
  signatures.

### 4. Document the asymmetry

* Good, because it ships without touching code.
* Good, because the guard-`find` workaround does work today.
* Bad, because it makes the omission permanent and makes every author pay for it.
* Bad, because the workaround costs an extra step per annotated element.
