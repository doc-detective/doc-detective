---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Small config and schema contract fixes

## Context and Problem Statement

A review of the 5.0 contract found small gaps between what the schemas say and what the tool does:

- `--concurrent-runners auto` works, but `"concurrentRunners": "auto"` in config fails validation. The CLI and config
  disagree on one shared value (`CLAUDE.md`, plans rule 1). `doc-detective debug` also left out `auto` as an applied
  override.
- `type.timeout` says it bounds `waitUntil`, but finding the target element in a browser always polled for 5 seconds.
  So `"timeout": 0` didn't check once, and a longer timeout didn't wait longer.
- Some schema descriptions describe a plan: "yet", "in this phase", "may be added in the future", and pointers into
  `docs/design/`. Some name the wrong key. `recursive` names `setup` and `cleanup`, which don't exist. Run-folder
  paths say `<output>` where `outputDir` sets them. `closeSurface` says it "renames `stopProcess`".
- Step `outputs` says authors can define outputs. Nothing reads an authored `outputs`.
- A config example sets `output` to a folder. `output` names a results file.

None of these changes what a valid config or spec does, except `type.timeout`.

## Decision Drivers

- Shared concepts use shared values across the CLI and config.
- A timeout bounds the whole step it belongs to.
- Interfaces describe the present, and name the keys that exist.

## Considered Options

- **A. Fix each gap where it is.**
- **B. Leave them for the 5.x line.**

## Decision Outcome

Chosen option: **A**.

- `config_v3` accepts `"concurrentRunners": "auto"`. Its `anyOf` keeps the integer-or-boolean branch first, so Ajv's
  type coercion still turns a quoted `"4"` into `4` and never turns `true` into `1`. `setConfig` in `src/utils.ts`
  reads `auto` as `true`, and `resolveConcurrentRunners` treats it as `true`. `debug` reports
  `--concurrent-runners auto` as applied.
- The schema-error summary can list allowed values of another type than the value. When another error at that path
  explains the value, it lists only the values of the value's own type. So `0` reads `must be >= 1`, not
  `must be auto`, and `"lots"` reads `must be auto (got "lots")`. A path with no other error lists every allowed
  value, as before.
- `type.timeout` bounds the browser element search too. `0` checks once.
- Descriptions name the present and the right keys: `recursive` covers `input`, `beforeAll`, and `afterAll`. Run-folder
  paths start at `<outputDir>`. Step `outputs` holds results only, and its example is gone. The config example uses
  `outputDir`.
- `src/common/test/schemaDescriptions.test.js` also rejects "yet", "in this phase", "currently supported", "in the
  future", and `docs/design/` in any `description` or `title`, and `<output>/` in a path.

### Consequences

- Good: config, CLI, and `debug` agree on `auto`.
- Good: a `type` step with a short `timeout` fails fast when its element is missing.
- Good: the guard stops plan-speak and the `<output>` mix-up from coming back.
- Bad: a `type` step whose element appears after more than its `timeout` now fails. Raise `timeout` to wait longer.
- Neutral: an invalid string for `concurrentRunners` reads `must be auto`, which names the only string it takes.

### Confirmation

- `src/common/test/validate.test.js`: `auto` validates; `"lots"` and `"AUTO"` don't.
- `test/concurrency.test.js`, `test/utils-coverage.test.js`, and `test/debug.test.js`: `auto` resolves like `true` in
  core, in config, and in `debug`'s override list.
- `test/cli-output-units.test.js`: a string gets the allowed string, and `0` gets the minimum.
- `test/interaction-assertions.test.js`: `type.timeout: 0` searches once and fails fast.
- `src/common/test/schemaDescriptions.test.js`: the widened guard.
- Fixtures: `cli/concurrent-runners-auto.spec.json` runs with `auto` in config and exits `2` on another string.
  `interactions/type_extendedFinding.spec.json` types with `timeout: 0` into a loaded field.

## Pros and Cons of the Options

### A. Fix them now

- Good: 5.0 ships with a contract that matches the tool.
- Bad: the `type.timeout` change can fail a slow page that passed before.

### B. Defer

- Good: no risk to 5.0.
- Bad: the gaps ship in the contract users move to, and each later fix is its own change.
