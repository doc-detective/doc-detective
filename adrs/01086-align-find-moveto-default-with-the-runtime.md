---
status: accepted
date: 2026-07-26
decision-makers: doc-detective maintainers
---

# Align `find`'s advertised `moveTo` default with the runtime

## Context and Problem Statement

`find_v3` declared `moveTo` with `"default": true`, and
[docs/fern/pages/docs/actions/find.mdx](../docs/fern/pages/docs/actions/find.mdx) said the same. The
runtime has never done that. [src/core/tests/findElement.ts](../src/core/tests/findElement.ts)
normalizes the step with:

```ts
moveTo: step.find.moveTo || false,
```

So a bare `{ "find": "#submit" }` has always left the viewport and cursor exactly where they were.

The declared default never took effect because of a JSON Schema detail that is easy to miss.
`find_v3`'s properties live inside the root `anyOf`, the string-or-object union, and **Ajv does not
apply `default` inside `anyOf`**. Nothing injected the value, so nothing contradicted the runtime,
and the drift survived silently. The only consumer that read the keyword at all was the docs
generator, which faithfully printed a default that was never real.

The provenance points the same way. `find_v2` declares `"default": false`, matching the runtime.
The `true` first appears in `find_v3` in the "Merge `common` into the `doc-detective` repo" commit
(#175). It was inherited wholesale from the separate common repo, rather than introduced alongside
any runtime change. The runtime line itself dates to the TypeScript rewrite (#170) and has never been
touched.

Found while reviewing [ADR 01085](01085-configurable-timeout-for-annotation-targets.md), where the
same inert-default mechanism was relied on deliberately, as a `default` that documents a value the
runtime owns.

## Decision Drivers

* The schema is the contract users read; it must not advertise behavior that has never existed.
* Whichever way this is resolved, it should not silently change what existing suites capture.
* `moveTo` moves the viewport, which is an input to screenshots and to visual-regression baselines.

## Considered Options

1. **Correct the schema and docs to `false`**, making the contract match five years of behavior.
2. **Change the runtime to honor `true`**, as `step.find.moveTo ?? true`.
3. **Change the runtime to `true`, with a config-level opt-out.**

## Decision Outcome

Chosen option: **1, correct the schema and docs to `false`.**

This is a zero-behavior-change fix. Every run since v3 shipped has behaved as `false`; this makes
the documentation and the schema say so. `find_v2` already declared `false`, so the two versions
agree again.

Nothing depends on an implicit `true`. Two places in this repo want scrolling:
[test/artifacts/test.spec.json](../test/artifacts/test.spec.json) and
[test/core-artifacts/test.spec.json](../test/core-artifacts/test.spec.json). Both already set
`moveTo: true` explicitly, which is exactly what you would expect given that the implicit form has
never worked.

### Why not change the runtime

Option 2 is the tempting reading of "fix": make the code obey the documented contract. It was
rejected because `moveTo` scrolls the element into view, and scrolling changes what a subsequent
`screenshot` captures. Every user with a bare `find` before a `screenshot` would silently get
different image content, and any committed reference image compared under `maxVariation` could start
WARNING or FAILing. That is a breaking change delivered to fix a documentation defect. The cost
falls on users who never saw the promised behavior in the first place, and therefore never relied
on it.

Option 3 softens the blast radius. But it adds a config knob and a precedence rule, for a field
that already has a per-step override. That delivers a default nobody has been missing.

If cursor-travel-by-default is wanted for recordings, that is a feature request with its own
migration story, not a correction. This ADR deliberately leaves that door open.

### Consequences

* Good: the schema, the generated reference page, the prose docs, and the runtime finally agree.
* Good: no user-visible behavior change; no migration.
* Good: `find_v2` and `find_v3` agree on the default again.
* Neutral: authors who want scrolling keep writing `moveTo: true`, as the two fixtures here already
  do.
* Bad/limit: anyone who read the docs and assumed their `find` steps were scrolling now learns they
  were not. That is the defect surfacing, not the fix causing it. But a suite written under the
  wrong assumption may be relying on a `screenshot` that happens to capture the unscrolled viewport.
  Adding `moveTo: true` to "restore" the documented behavior would change those captures.
* Bad/limit: the underlying trap is untouched. **Any `default` inside an `anyOf`/`oneOf` branch in
  these schemas is inert.** `find_v3`'s `timeout: 5000` and `annotation_v3`'s `timeout: 5000` are in
  the same position; both happen to be correct because the runtime independently defaults to the
  same number. A lint that flags `default` under a composition keyword would catch the next one;
  that is out of scope here.

### Confirmation

[test/findElement.test.js](../test/findElement.test.js) pins both halves of the invariant:

* the declared default in `find_v3.schema.json` is `false`;
* a bare `find` against a mock driver does not take the `moveTo` branch (asserted through the
  `"Moved to element."` suffix `findElement` appends when it does);
* the two are asserted **equal to each other**, so a future change to either side that isn't
  mirrored fails here rather than shipping.

## Pros and Cons of the Options

### 1. Correct the schema and docs to `false`

* Good, because it makes the contract true today, with no migration.
* Good, because it restores agreement with `find_v2`.
* Good, because it cannot disturb any existing screenshot or baseline.
* Bad, because users who believed the docs learn their finds never scrolled.

### 2. Change the runtime to `true`

* Good, because it honors what the docs have promised.
* Good, because scroll-into-view is arguably friendlier for recordings.
* Bad, because every bare `find` starts moving the viewport, changing screenshot content.
* Bad, because committed `maxVariation` references can begin WARNING or FAILing with no source
  change.
* Bad, because it is a breaking change shipped as a bug fix.

### 3. Runtime `true` with a config opt-out

* Good, because it gives users an escape hatch.
* Bad, because it still flips the default for anyone who doesn't find the hatch first.
* Bad, because it adds a config key and a precedence rule for a field that already has a per-step
  override.
