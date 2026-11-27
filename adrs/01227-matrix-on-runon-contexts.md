---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Run a test once per value with `runOn[].matrix`

Builds on [ADR 01223](01223-page-emulation-on-context-browsers.md), which put page emulation on a context's
browser, and [ADR 01199](01199-reject-invalid-specs-from-runtests-by-default.md), which routes invalid specs to exit `2`.

## Context and Problem Statement

Authors who want one test per locale, theme, or page copy the test. Each copy drifts. The 5.2 roadmap row in
[docs/design/v5-rollout.md](../docs/design/v5-rollout.md) and ADR 01223 both point at one generic `matrix`.

A `runOn` entry already expands into contexts: platforms × browsers. It already holds the emulation keys a variant
needs, and it's already inherited test → spec → config. Where should a matrix live, and how do its values reach the
steps?

## Decision Drivers

- Each variant gets its own session, artifact folder, report entry, and concurrent slot, with no new plumbing.
- Concurrent variants can't see each other's values.
- A spec- or config-level matrix doesn't multiply tests that don't use it.
- A mistake, such as a typo'd key or two variants writing one file, fails before anything runs.

## Considered Options

- **A. A `matrix` on a `runOn` entry, as a third expansion axis, with `$$matrix.<key>` references substituted at
  resolve time.**
- **B. A test-level `matrix` that clones the test.**
- **C. Matrix values exported as environment variables (`$KEY`).**

## Decision Outcome

Chosen option: **A**.

- `runOn[].matrix` is an object. Each key matches `^[A-Za-z0-9_]+$`. Each value is a non-empty array of unique
  items, either all scalars (string, number, boolean) or all objects with scalar leaves. The shape lives once, in
  `matrix_v3`, and `context_v3` references it.
- `$$matrix.<key>` refers to a scalar value, and `$$matrix.<key>.<field>` to an object leaf. A reference that is the
  whole string becomes the value and keeps its type. A reference inside a longer string is spliced in as text. A
  reference to a whole object value splices its leaf values joined with `-`.
- References work in the context's own fields and in every step, including `before`/`after` steps. The six emulation
  fields on a context browser (`colorScheme`, `reducedMotion`, `locale`, `timezone`, `deviceScaleFactor`, `clock`)
  also accept a `$$matrix.…` string.
- Values are substituted per context, on that context's copy of the steps. They never touch `process.env`.
- A context expands only over the keys that its own fields or the test's steps reference. A key in a `runOn` authored
  on the test itself that nothing references is an error, because it can only be dead there.
- A derived context ID gets a `~<key>=<value>` part per expanding key, in authored order, such as
  `linux-chrome~locale=de-DE~variant=dark-2`. An object value's part is its leaf values joined with `-`. An authored
  `contextId` gets the same suffix. Characters that aren't filename-safe become `-`.
- The duplicate-context check includes the combination, so two combinations never merge.
- Each resolved and reported context carries a read-only `matrix` with its combination.
- An explicit output path (`screenshot`, `record`, `saveState`, `saveCookie`) that doesn't reference every expanding
  key with more than one value is an error, because every combination would overwrite the same file. Paths the
  runner derives already land under each context ID.

Errors are raised while tests resolve. Each marks its spec invalid, so the CLI exits `2` and prints it under
`Invalid test specifications, so nothing ran:`. `exitOnFail: false` skips the spec and warns instead:

- ``tests[<i>]: `$$matrix.foo` names no `matrix` key in context `linux-firefox`.``
- ``tests[<i>]: `$$matrix.variant.size` names no field of `matrix` key `variant`.``
- ``tests[<i>]: `matrix` key `theme` isn't used. Reference it as `$$matrix.theme` or remove it.``
- ``tests[<i>]: step 3's `path` `<absolute path>` is the same for every `matrix` combination. Add `$$matrix.variant` to it.``
- ``tests[<i>]: `matrix` values `a/b` and `a-b` give the same context ID.``

Mixed items, an empty array, duplicates, or a nested array fail the schema.

No `include`/`exclude`: object values cover correlated dimensions.

### Consequences

- Good, because a variant is a context, so sessions, artifacts, reports, JUnit cases, and concurrency need no change.
- Good, because a spec- or config-level matrix reaches every test through `runOn` inheritance, and only tests that
  reference a key multiply.
- Good, because per-context substitution keeps concurrent combinations isolated.
- Bad, because `--test` matches test IDs, so it can't select one combination.
- Bad, because a test-level `if` and `description` aren't substituted: a test runs or skips as a whole.

### Confirmation

[src/common/test/matrix.test.js](../src/common/test/matrix.test.js) covers combinations, substitution, context IDs,
and the path guard. [test/matrix.test.js](../test/matrix.test.js) covers resolution: expansion, dedupe, inheritance,
and each error routed to the invalid-spec path. [test/core-core.test.js](../test/core-core.test.js) asserts the context IDs and each context's
`matrix` in a report. The fixtures in [test/core-artifacts/matrix/](../test/core-artifacts/matrix) run the shapes
through the real runner.

## Pros and Cons of the Options

### A. A `matrix` on a `runOn` entry

- Good, because it reuses the existing expansion, inheritance, and emulation keys.
- Bad, because a combination can't be selected by `--test`.

### B. A test-level `matrix` that clones the test

- Good, because `--test` could match a clone.
- Bad, because each clone needs a new test ID, report node, and inheritance rules of its own.
- Bad, because a spec- or config-level matrix would need a second mechanism.

### C. Matrix values as environment variables

- Good, because `$KEY` already substitutes.
- Bad, because `process.env` is shared, so concurrent combinations would race.
- Bad, because substituted environment values are masked in output (ADR 01178).
