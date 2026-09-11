---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# `validate()` clones once and probes compatible schemas with a non-mutating validator

## Context and Problem Statement

`validate()` in `src/common/src/validate.ts` is the hot path of test detection: every spec, test,
and step is validated against a v3 schema, and `step_v3` validation happens once per step. The
function is built on an Ajv instance configured with `useDefaults: true` and `coerceTypes: true`.
**Both of those mutate the data they validate.** Defaults are written in, and values are coerced in
place. To keep the caller's object unmutated, the old code deep-cloned before every validation:

```ts
// target-schema attempt
validationObject = JSON.parse(JSON.stringify(object));
result.valid = check(validationObject);

// then, if the target failed, for EACH compatible v2 candidate:
const matchedSchemaKey = compatibleSchemasList.find((key) => {
  validationObject = JSON.parse(JSON.stringify(object)); // a fresh clone per candidate
  const check = ajv.getSchema(key);
  if (check && check(validationObject)) return key;
});
```

`step_v3` lists **12** compatible v2 schemas, such as `checkLink_v2` and `find_v2`. So a v2-shaped or
invalid step could pay **up to 13 full `JSON.parse(JSON.stringify(...))` deep clones plus 13 full
Ajv validations** before resolving. That's the dominant detection CPU cost on step-heavy specs, per
`docs/design/run-performance.md`, item 3.2.

The clone exists *only* because the validators mutate. The probing question is "which compatible
schema does this object match?" It does not need a mutated result at all. It needs a yes or no.

## Decision Drivers

* Cut the redundant per-candidate clone-and-validate without weakening the safety the clone
  provides.
* **Preserve four invariants exactly** (pinned by tests *before* refactoring, in
  `src/common/test/validate.test.js` → "clone strategy invariants (phase 3.2)"):
  * (a) the caller's input object is never mutated;
  * (b) the returned/validated object carries Ajv-applied defaults exactly as before;
  * (c) validity results (valid/invalid + error strings) are unchanged;
  * (d) the compatible-schema selection picks the same schema as before.
* Keep `validate()`'s "never throws" contract (it only throws on a missing `schemaKey`/`object`).

## Considered Options

* **A. Add a second, non-mutating Ajv (`ajvCheck`) to probe candidates; clone once for the winner**
  (chosen).
* **B. Keep one Ajv, but clone once up front and reset the clone between candidate probes.** It
  still pays per-candidate work, and is easy to get subtly wrong, with coercions from a failed
  candidate leaking into the next probe.
* **C. Replace the `JSON.parse(JSON.stringify(...))` clone primitive with `structuredClone`** on the
  detection path, as floated in the design.

## Decision Outcome

Chosen: **A**, and **not C**.

### A: non-mutating probe, then clone once

A second Ajv instance, `ajvCheck`, is created with `useDefaults: false` and `coerceTypes: false`
(same `strictSchema`/`allErrors`/`allowUnionTypes`, same `ajv-formats`/`ajv-keywords`/`ajv-errors`
plugins, same schemas). Because it never writes to the data, every compatible candidate is probed
**directly against the caller's object with no clone**:

```ts
const matchedSchemaKey = compatibleSchemasList.find((key) => {
  const probe = ajvCheck.getSchema(key);
  return probe ? probe(object) : false;
});
```

Once a candidate matches, the code reproduces the *exact* input the old transform received. That's a
single fresh clone run through the **mutating** `ajv` for the matched schema, so its v2 defaults and
coercions are applied identically. It then transforms and re-validates against the target:

```ts
validationObject = cloneForValidation(object);
const matchedCheck = ajv.getSchema(matchedSchemaKey);
matchedCheck!(validationObject);           // same mutation the old matched clone got
const transformedObject = transformToSchemaKey({ ... object: validationObject });
result.valid = check(transformedObject);   // unchanged
```

Net: **at most 2 clones** (target attempt + winning pass) instead of up to 13, and the 12
candidate validations become cheap non-mutating checks.

The candidate schemas compile **lazily** on first use in `ajvCheck`, so only the candidates actually
probed are ever compiled. The second instance adds no eager startup cost.

**Selection equivalence (invariant d).** The old loop selected the first candidate whose *mutating*
validator passed on a fresh clone. The new loop first tries the *non-mutating* validator on the
original. `useDefaults` and `coerceTypes` only make Ajv *more* permissive, so a non-mutating match
is always a mutating match too. The fast path is therefore exact for any candidate whose validity
does not depend on a default or coercion. It **can** diverge for a candidate whose validity *does*
depend on one, and this is not merely theoretical. `config_v2`'s `telemetry.send` is `required`
**and** carries a default. So a legacy config that includes a `telemetry` object but omits `send`
validates only once `useDefaults` fills it. The non-mutating probe would reject it, and the whole
config would be reported invalid. That's a real regression.

To close this, the non-mutating probe is a **fast path with a fallback**. When it finds no match, the
code replays the original clone-per-candidate **mutating** probe before declaring no match. So no
input that validated under the old code is ever newly rejected. The fallback runs only on the rare
no-fast-match path, so the common case keeps its single-clone win. Selection *order* could still
differ only if an input matched two candidates where an earlier one is mutating-only. That's
impossible for the single-candidate compatible lists. And `step_v3`'s candidates are
mutually-exclusive step shapes, so no input matches two. A dedicated regression test pins the
`config_v2` telemetry.send case. Equivalence is further confirmed by the pinned invariants, the full
`schema.test.js` example suite, the rest of `validate.test.js`, and the end-to-end core fixtures.

### Not C: keep the JSON-clone primitive

`structuredClone` was implemented and rejected. It is **not** semantically equivalent to
`JSON.parse(JSON.stringify(...))` for the objects this function actually validates. The JSON
round-trip *normalizes*. It maps `NaN`→`null` and drops `undefined`-valued keys, and that
normalization is **load-bearing**. `transformToSchemaKey` builds objects with `maxVariation:
object.maxVariation / 100`. When a v2 step omits `maxVariation`, that is `undefined / 100 === NaN`.
Under the JSON clone `NaN` becomes `null`, and validation proceeds as it always has. Under
`structuredClone` the `NaN` survives verbatim and Ajv rejects it. That flips invariant (c), and
broke eight existing `transformToSchemaKey` tests when tried. `structuredClone` also throws on
functions and symbols, which would break the "never throws" contract.

The clone primitive is therefore centralized in a `cloneForValidation()` helper that keeps the JSON
round-trip, with the reasoning inline. The Phase 3.2 win comes entirely from cloning *once* and
probing without mutation, rather than from the clone primitive. The design's `structuredClone`
suggestion was scoped to "where JSON-value semantics are guaranteed". Inside the shared `validate()`
they are not guaranteed, since the transform pipeline feeds it `NaN` and `undefined`. So the
guarantee does not hold, and the swap is not made.

### Consequences

* Good: up to 13 deep clones + 13 mutating validations per resolved object → at most 2 clones + 1
  mutating candidate validation + N cheap non-mutating probes. Dominant detection-CPU reduction on
  step-heavy specs, with no observable behavior change.
* Good: the clone contract now lives in one helper with the rationale attached.
* Neutral: a second Ajv instance holds the schema set; schemas compile lazily so memory/startup cost
  is bounded to probed candidates.
* Risk (handled): a compatible schema whose validity depends on a default/coercion (real case:
  `config_v2.telemetry.send`) would be missed by the fast non-mutating probe. Closed by the
  mutating-probe fallback on the no-fast-match path, pinned by a dedicated regression test.

### Confirmation

* Invariant-pinning tests were added **before** the refactor in `src/common/test/validate.test.js`,
  under "clone strategy invariants (phase 3.2)". They cover direct-path non-mutation,
  compatible-path non-mutation, and correct compatible-schema selection with a defaulted transformed
  result, for `step_v3`←`checkLink_v2` and `config_v3`←`config_v2`. They also cover
  `addDefaults: false` returning the original untouched, no-match reporting invalid with the original
  returned, and deep-clone independence. All pass before and after.
* The full `src/common` suite of 956 tests is green. The coverage ratchet holds at 100% of lines,
  statements, functions, and branches.
* Root core fixtures and detection/resolution unit suites exercise real v2→v3 detection end to end.

## Pros and Cons of the Options

### A. Non-mutating probe + clone-once
* Good: eliminates per-candidate clones and mutating validations; preserves all four invariants;
  lazy compile keeps the second instance cheap.
* Bad: a second Ajv instance to keep configured in lockstep with the first (same plugins/schemas).

### B. One Ajv, reset clone between probes
* Good: no second instance.
* Bad: still per-candidate work; coercion/default leakage between probes is easy to introduce and
  hard to see.

### C. `structuredClone` primitive
* Good: faster per clone; more faithful copy.
* Bad: changes validity for `NaN`/`undefined` the transform pipeline produces (breaks invariant c);
  throws on functions/symbols (breaks "never throws"). Rejected.

## More Information

Design: `docs/design/run-performance.md`, Phase 3, item 3.2, plus Decision 4 on clone safety.
Docs-impact: **none**. This is an internal validation-performance change. `validate()`'s public
contract is unchanged, covering return shape, defaults, validity, and never-throws. So no
user-facing schema, CLI, or output surface moves.
