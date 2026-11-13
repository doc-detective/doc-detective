---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Rename beforeAny to beforeAll

## Context and Problem Statement

Config has two keys that wrap the whole run: `beforeAny` runs setup specs before the input, and `afterAll` runs
cleanup specs after it. The pair reads as a typo. Jest and Vitest pair `beforeAll` with `afterAll`, so that's the
name people reach for. With strict config keys, it's an unknown key that exits 2.

```json
// before                          // after
{"beforeAny": "setup.spec.json"}   {"beforeAll": "setup.spec.json"}
```

Renames that users write keep a deprecated alias for the life of the major. Should 5.0 rename `beforeAny`, and how
should the old name behave?

## Decision Drivers

- The name should match `afterAll` and the test frameworks people already use.
- Existing configs must keep working through 5.x, so a rename can't break them.
- One alias contract for every rename: schema, rename point, warning, and conflict error.

## Considered Options

- **A. Rename to `beforeAll`, and keep `beforeAny` as a deprecated alias.**
- **B. Rename with no alias.**
- **C. Keep `beforeAny`.**

## Decision Outcome

Chosen option: **A**, following the shared deprecated-alias contract.

- `config_v3` gains `beforeAll`, with the same string-or-array shape. `beforeAny` stays a property, with
  `"deprecated": true` and the description ``Deprecated: use `beforeAll`.``
- `renameDeprecatedConfigKeys` in `src/core/config.ts` renames `beforeAny` to `beforeAll` in each config source
  on its own, before the sources merge and before validation. The CLI's `setConfig` passes the user config, the
  project config file, and `DOC_DETECTIVE_CONFIG`. The core `setConfig` passes the config and the
  `DOC_DETECTIVE` override, so API callers get the alias too.
- Because each source is renamed first, the normal precedence holds whichever name a source uses. When a file
  sets `beforeAny` and `DOC_DETECTIVE_CONFIG` sets `beforeAll`, the run uses the environment's value. A hosted
  runner that layers a snapshot over the repository config relies on that.
- The warning goes to stderr once per call, however many sources used the old name. It prints after the sources
  merge, so the merged `logLevel` decides, including one from the user config. It reads
  ``Warning: `beforeAny` is deprecated. Rename it to `beforeAll`.`` The CLI renames before core sees the config,
  so a CLI run warns once.
- Setting both names in one source is a usage error, and the CLI exits 2:
  ``Error: Invalid config. beforeAll: set `beforeAll` or `beforeAny`, not both.``
- The runner, detection, path resolution, hints, and the v2 config upgrade read `beforeAll` only. The internal run
  phase is named `beforeAll` too. The runner maps a `_phase` of `beforeAny` in a plan resolved before this change
  to `beforeAll`, so setup still runs first.
- The alias is removed at the next major.

### Consequences

- Good: the config reads `beforeAll` / `afterAll`, like Jest and Vitest.
- Good: existing configs keep working and are told what to change.
- Neutral: one more property in the schema until 6.0.
- Bad: two names for one thing during 5.x. The conflict error keeps a config from using both.

### Confirmation

- `src/common/test/validate.test.js` ("beforeAll") accepts `beforeAll` as a string and an array, and checks that
  `beforeAny` is marked deprecated with the contract's description. The v2 transform yields `beforeAll`.
- `test/config-coverage.test.js` and `test/cli-output-units.test.js` assert that both `setConfig`s rename
  `beforeAny`, warn exactly once, and reject a source that sets both. An environment override wins over the
  config in both directions: `beforeAny` over `beforeAll`, and `beforeAll` over `beforeAny`.
- `test/strict-keys.test.js` runs the real CLI. `beforeAll` and `beforeAny` both keep the setup, main, cleanup
  order, and only `beforeAny` warns. A `DOC_DETECTIVE_CONFIG` value wins over the file's in both directions.
  Setting both in one file exits 2.
- `test/core-ordering.test.js` runs a pre-resolved plan whose setup spec has `_phase: "beforeAny"`, and asserts it
  runs first.
- `test/core-artifacts/cli/before-all.spec.json` runs the string, array, alias, and conflict permutations as a
  fixture.

## Pros and Cons of the Options

### A. Rename with a deprecated alias

- Good: fixes the name without breaking a single config.
- Bad: carries the alias until 6.0.

### B. Rename with no alias

- Good: one name immediately.
- Bad: every config with `beforeAny` exits 2 on upgrade, for a cosmetic change.

### C. Keep `beforeAny`

- Good: no change.
- Bad: the asymmetry stays for another major, and `beforeAll` keeps failing as an unknown key.
