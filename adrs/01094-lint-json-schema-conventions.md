---
status: accepted
date: 2026-07-26
decision-makers: doc-detective maintainers
---

# Lint the authored JSON Schemas

## Context and Problem Statement

[ADR 01086](01086-align-find-moveto-default-with-the-runtime.md) fixed a defect that survived five
years: `find_v3` advertised `moveTo` with `"default": true` while the runtime had always used
`false`. It survived because **nothing looks at these schemas except the code that consumes them.**

The 69 schemas in `src/common/src/schemas/src_schemas` encode conventions discovered the hard way —
how the docs generator keys pages, how the TypeScript generator handles composition, how Ajv orders
`coerceTypes` branches. Today those are prose `$comment` blocks. A `$comment` cannot fail a build.

Surveying for the general case found more than the bug that prompted it:

| Class | Found | Notes |
|---|---|---|
| TypeScript type-collapse | 17 | **4 confirmed erased in published types** |
| Inert `default` (never applied) | 63 | 25 cite a matching runtime fallback; 38 are `UNVERIFIED` |
| Properties with no `description` | 170 | Blank cells on generated reference pages |
| Title collisions among page-producing schemas | 24 | Generator keys pages by title and overwrites |
| `additionalProperties: false` across `allOf` branches | 0 | Rule written; the existing shape+guard pattern is correct |

The type-collapse finding is the most damaging. These are published types today:

```ts
export type FindElementDetailed   = { [k: string]: unknown };
export type ClickElementDetailed  = { [k: string]: unknown };
export type ElementDetailed       = { [k: string]: unknown };   // dragAndDrop
export type HTTPRequestDetailed   = { [k: string]: unknown };
```

The detailed object form of the four most-used actions, with no type safety at all, because each
declares `properties` beside a sibling `anyOf`. `annotation_v3` documents both the hazard and the fix
in a `$comment` — the convention existed, nothing enforced it.

## Decision Drivers

* A convention nothing checks is a convention that drifts.
* Findings must land on the line an author can edit, or they get ignored.
* The rules encode *this repo's* toolchain behavior, not generic JSON Schema style.

## Considered Options

1. **Spectral for structural rules, plus custom passes** for the two classes it can't express
   (cross-file identity, Ajv semantics).
2. **Custom-only** — a bespoke rule registry with no new dependency.
3. **Spectral-only** — adopt the standard engine wholesale and accept the gaps.

## Decision Outcome

**Spectral for structural rules, custom passes for what Spectral cannot see, gating the build.**

`@stoplight/spectral-cli` carries the per-document structural rules; `scripts/lint-schemas.cjs`
carries cross-file identity and Ajv-semantic rules and is the single entry point
(`npm run lint:schemas`).

### The `$ref` graph dictates the design

27 of 69 files carry cross-file `$ref`s across 166 edges, and the dereferencer **inlines** rather
than linking: `"Element-finding fields"` appears **90 times** in a resolved `config_v3` (9 MB).

Every Spectral rule therefore sets `resolved: false`. This is load-bearing, not stylistic — resolved,
one authoring mistake in `annotation_v3` reports roughly 200 times, at paths that exist in no file
anyone can edit. `unique-title` for the same reason works from raw sources: resolved, every title
collides with its own inlined copies.

### Ajv is not a usable oracle for inert defaults

The obvious implementation — ask Ajv, since `strictSchema` logs `default is ignored for: …` — was
**tried and rejected**. Ajv's warning is best-effort: it fires for `httpRequest_v3`'s `statusCodes`
but stays **silent** for `find_v3`'s `moveTo`, which is provably inert (restore `default: true`,
validate `{selector}`, and no `moveTo` comes back). Shipping that would have produced a lint that
misses the exact bug it was written for.

A lexical walk fails too, and in the opposite direction: `components/schemas/object/properties/…`
sits outside any composition, so a lexical check calls it clean — but the only path in is the root
`anyOf` following an internal `$ref`.

The rule is therefore a **reachability analysis** (`inertDefaults`): a default is live only if some
path from the root reaches it without crossing a composition keyword. It follows internal `$ref`s,
descends only through keywords Ajv actually applies (notably *not* `components`, which Ajv ignores),
and treats a node reached by both a composed and an uncomposed path as live.

Which keywords block is **measured, not read off the specification**:

| Keyword | Default applied? | Blocks |
|---|---|---|
| `anyOf`, `oneOf`, `not`, `if` | no | yes |
| `then`, `else` | **yes**, when that branch is selected | no |
| `allOf` | yes | no |

The `if`/`then`/`else` split is the counter-intuitive one and was got wrong at first, by assuming the
family behaved uniformly. It does not: `if` is evaluated only as a predicate so its own defaults never
land, while `then`/`else` are ordinary subschemas applied when their branch is chosen. **Conditional
liveness is still liveness** — treating them as blockers made every such default a false positive and
would have pushed live ones into the acknowledgement file as though they were dead.

The table is pinned by tests that run a live Ajv, so an upgrade that changes default application
fails in one place rather than silently re-misclassifying every schema in the repo.

One more Ajv behavior the analysis depends on: a `default` **beside** a `$ref` rather than below it.
Draft-07 says `$ref` siblings are ignored, but Ajv's `useDefaults` acts at the `properties` level and
applies it anyway. That makes such a default ordinary — live when uncomposed, inert when composed —
so it is recorded before the `$ref` is followed rather than special-cased. `config_v2` has five, e.g.
`"input": { "$ref": "#/definitions/input", "default": "." }`; all five are uncomposed and therefore
live. Also asserted against a live Ajv, because if a future version honors the spec here those five
become inert and the registry needs to grow.

### Acknowledgement, not prohibition

Inertness alone is not a defect. `annotation_v3`'s `timeout` is inert **on purpose**: it populates
the Default column on the generated reference page while the runtime owns the value. Banning inert
defaults would delete real documentation.

So `schema-lint/inert-defaults.json` registers each one with **either** the runtime counterpart it
mirrors **or** an explicit `UNVERIFIED` marker plus a `why` saying nobody located one. Four things
fail the lint: an unregistered inert default; a registered `value` that no longer matches the schema;
a registration whose pointer disappeared; and a registration missing `runtime` or `why`.

That last one is not bookkeeping. **It is what makes this a gate rather than a suppression list** —
registering a `moveTo` twin only catches anything because it forces someone to write the runtime's
actual behavior beside the declared default, where the contradiction becomes visible. An entry of
`{ "value": true }` alone would satisfy every other check while recording nothing, so the fields are
enforced. `"UNVERIFIED"` is an accepted value: it says *nobody found the runtime*, which is a claim
someone can act on, unlike an absent field.

Verified: reintroducing `"default": true` on `moveTo` fails the build with that pointer named.

### Gating the build

The ROOT `build` runs `lint:schemas` **before** `build:common`. The dereferenced output,
the generated types, and the docs reference pages are all derived from these sources; linting after
generation means generating from input already known to be bad and laundering the mistake into three
artifacts. Confirmed: with a violation present, `npm run build` exits 1 and `output_schemas/`
is byte-identical afterward.

The root, specifically, and not `src/common`'s own `build` — where it sat first. `src/common` ships a
maintained standalone lockfile ([ADR 01091](01091-rebuild-the-common-lockfile-during-release.md)), so
`cd src/common && npm ci && npm run build` is a real flow, and Spectral lives in the root's
dependencies. Adding it to `src/common` wouldn't have helped either: `scripts/lint-schemas.cjs` sits
at the repo root, so Node resolves its `require`s from `<repo>/node_modules` and never from
`src/common/node_modules`. Gating at the root keeps the check on the build everyone actually runs
(and on every CI cell, which builds from the root) without breaking the standalone path.

The CI job is *not* the enforcement — it reports in about a minute and produces inline PR annotations.

### Consequences

* Good: the four erased public types are now visible and gated against recurrence.
* Good: 63 inert defaults are registered; 25 cite the runtime that owns the value.
* Bad/limit, and the honest reading of that number: **38 are `UNVERIFIED`** — nobody located a runtime
  counterpart for them. Each is a possible `moveTo` twin, and they are recorded as open questions
  rather than waved through. The gate's value here is that they are now enumerated instead of
  invisible; retiring them is follow-up work, not something this ADR claims to have done.
* Good: no rule depends on build output, so the lint can gate the build.
* Neutral: `require-description` (170) and `camelcase-property-names` are warnings — real signal, but
  not worth blocking a build over, and they surface as PR annotations on lines being touched.
* Bad/limit: a developer mid-edit on a schema cannot build until it lints clean. That is the intent —
  a violating schema produces types and docs that silently lie.
* Bad/limit: 17 type-collapse and 24 title findings ship **baselined** in `schema-lint/baseline.json`.
  Each type-collapse fix restructures a schema and changes its generated type, which is reviewable
  work in its own right. The list only shrinks: deleting an entry that is still violated fails.
* Bad/limit: `camelcase-property-names` is scoped to v3 inside the rule function rather than through
  Spectral's `overrides`, whose `files` globs resolve relative to the ruleset file and so cannot reach
  the schemas.
* Bad/limit, accepted knowingly: **the standalone `cd src/common && npm run build` is not gated.**
  That path can still generate types and dereferenced output from schemas this lint would reject.
  Gating it is not possible without breaking it — `src/common` declares `ajv` but not Spectral, so a
  standalone install has no `@stoplight/*` to run, and `scripts/lint-schemas.cjs` resolves its
  `require`s from `<repo>/node_modules`, which that flow never populates. Making the step conditional
  would be worse than leaving it out: a lint that skips itself when its dependencies are missing is
  the silent no-op this ADR exists to prevent. Residual risk is small because every CI cell and every
  release builds from the root, where the gate does run; the exposure is a contributor building
  `src/common` alone and shipping nothing from it.

### Confirmation

* `npm run lint:schemas` exits 0 on the tree as shipped.
* Reintroducing `moveTo: true` fails, naming the pointer — run before trusting the gate.
* The block/apply table is asserted against a live Ajv, and each remaining gate branch is asserted
  end-to-end: dropping a registration's `runtime`, planting an orphan pointer, and planting an
  unparseable schema each fail the lint. Checked by mutation rather than by reading the source — a
  branch can exist and still be unreachable behind an earlier `continue`.
* `npm run build` with a violation exits 1 leaving `output_schemas/` untouched.
* `examples-validate` reports zero: every schema's examples validate against its own dereferenced
  form. It reached zero only after dereferencing in memory the way the build does — validating raw
  sources produced false failures on `annotation_v3`'s position-target example, which the real
  validator accepts.

## Pros and Cons of the Options

### Spectral + custom passes (chosen)

* Good, because structural rules get a standard ruleset format, severities, and PR annotations.
* Good, because the two rules Spectral cannot express are still covered.
* Bad, because it is two systems to run and understand.
* Bad, because it adds a sizable devDependency.

### Custom-only

* Good, because no new dependency and every rule class is native.
* Bad, because a bespoke runner and output format must be maintained forever.

### Spectral-only

* Good, because one system.
* Bad, because it drops the inert-default rule — the one that started this — since Spectral cannot
  evaluate reachability, and cannot do cross-file title collisions.
