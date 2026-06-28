---
status: accepted
date: 2025-02-07
decision-makers: doc-detective maintainers
---

# v3 action-as-key schema redesign

## Context and Problem Statement

Through v1 and v2, a Doc Detective step named its action in a field — v1 used a free `action` string, v2 pinned it with `action: { const: "goTo" }`. Both shapes meant a validator could not tell, from the object's *keys* alone, which action a step performed, and authors wrote a redundant discriminator. The v3 redesign asked: should the **action itself be the object key** (`{ "goTo": "https://…" }`) so a step's shape is self-describing, with one and only one action key per step, and should each action get its own strict `*_v3` sub-schema? This is the schema-side foundation that the runner later adopts (`00100`).

## Decision Drivers

* A step's action should be inferable from its keys, with no separate discriminator.
* Exactly one action per step must be enforceable by the schema, not by runtime code.
* Each action needs its own tightly-scoped schema (`*_v3`) rather than one mega-object.
* HTTP request/response shapes must be stricter and use canonical field names.
* The redesign must coexist with v2 long enough to auto-migrate (`00097`).

## Considered Options

* **A. Action-as-key `step_v3` with `anyOf` requiring exactly one action key, per-action `*_v3` schemas, `stepId`, stricter HTTP** (chosen).
* **B. Keep `action: const` (the v2 discriminator) and only tighten field schemas.**
* **C. A single big step object with every action's fields optional.**

## Decision Outcome

Chosen option: **A**. In `step_v3` the **action is the key** — there is no `action` field — and an `anyOf` constraint requires exactly one recognized action key per step. `id` becomes `stepId`; `outputs` and `variables` are expressed via `patternProperties`. Each action materializes its own `*_v3` schema. The contract was built up across several commits and a series of PRs:

1. **Action-as-key core** (`d4deb0fe`, `d2dbaaf6`, `61e6d1a4`, `7603167a`, `5555154a`, `a568869f`, `bba8e199`, `d8411ae0`, AJV 8.17.1, v3.0.0-dev): `step_v3`, `anyOf` one-action rule, `stepId`, `outputs`/`variables` patternProperties; first actions `checkLink` / `goTo` / `runShell` / `type`.
2. **Per-action family** (`2330f7f`, `6e81b39`, `0dd383e`, `3edb971`, `f2b1fd3`, `c9b8859`, `066f35f`, `4063380`, `245c792`, `3c429f0`, `84fb2f5`): `endRecord`→`stopRecord`, `screenshot` (`maxVariation` 0–1, default 0.05), `record`, `loadVariables`, `find`/`click`, `httpRequest_v3`, `openApi_v3`, `context_v3`, `test`/`spec`/`report_v3`; `checkLink` default `statusCodes` `[200,301,302,307,308]`.
3. **Refinements** (PR #106/#108: `cfb72661`, `7a45da78`, `75cee469`, `1a97bbe5`, `32f75e82`, `2235525f`, `9e8771d6`, `d198351e`): `click` requires `selector` OR `elementText` (`anyOf`); `find` root-level `anyOf` string/object; `type` `inputDelay` 100; `screenshot` path shorthand + `additionalProperties:false`; `checkLink` URL pattern anchored; `openApi` requires `descriptionPath` OR `operationId`.
4. **Stricter HTTP** (`e751bc4d`, `96c00dc`, `463af96`): request/response `additionalProperties:false`; canonical `params`→`parameters`; `statusCodes` accept integers; arrays allowed as request/response body.

### Consequences

* Good: a step is self-describing; the single-action rule is schema-enforced.
* Good: per-action `*_v3` schemas give precise, local validation and clear errors.
* Good: stricter HTTP shapes (`additionalProperties:false`, canonical `parameters`) catch typos.
* Bad: a hard break from v2's `action: const` shape — requires an auto-migration (`00097`) and a runner adoption (`00100`).
* Neutral: string/object shorthands (e.g. `find` as a string) add `anyOf` branches to keep authoring terse.

### Confirmation

Shipped across common commits listed above under v3.0.0-dev and PRs #105/#106/#108; verified by the per-action example fixtures bundled with each `*_v3` schema and the common validate suite.

## Pros and Cons of the Options

### A. Action-as-key + per-action *_v3
* Good: self-describing steps; one-action rule in schema; tight per-action validation.
* Bad: breaking change; needs migration + runner rewrite.

### B. Keep action: const, tighten fields
* Good: no migration.
* Bad: keeps the redundant discriminator; steps not key-self-describing.

### C. One big optional-field step object
* Good: a single schema.
* Bad: can't enforce exactly-one-action; weak, ambiguous validation.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `d4deb0fe`, `d2dbaaf6`, `61e6d1a4`, `7603167a`, `5555154a`, `a568869f`, `bba8e199`, `d8411ae0`, `2330f7f`, `6e81b39`, `0dd383e`, `3edb971`, `f2b1fd3`, `c9b8859`, `066f35f`, `4063380`, `245c792`, `3c429f0`, `84fb2f5`, `cfb72661`, `7a45da78`, `75cee469`, `1a97bbe5`, `32f75e82`, `2235525f`, `9e8771d6`, `d198351e`, `e751bc4d`, `96c00dc`, `463af96` (PRs #105/#106/#108). Inventory ref: BACKFILL-INVENTORY.md Seq 139, 141, 160, 164. Related: `00097` (v2→v3 auto-transform), `00098` (context_v3/browsers), `00099` (config_v3), `00100` (v3 runner adoption).
