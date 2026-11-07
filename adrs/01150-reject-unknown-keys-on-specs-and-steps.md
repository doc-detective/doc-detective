---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Reject unknown keys on specs and steps

## Context and Problem Statement

`test_v3` and `config_v3` reject unknown keys, but `spec_v3` and `step_v3` don't. A typo like `asertions` on a
step, or `runon` on a spec, is silently ignored. The check never runs, and the test passes.

[ADR 01146](01146-cli-v5-contract.md) makes the exit code the contract. After 5.0, tightening this would turn
green pipelines red, which is a breaking change. Should 5.0 reject unknown keys, and how?

## Decision Drivers

- A green run has to mean the checks ran.
- Schema names stay `_v3`, per the rollout plan.
- The schemas are draft-07, compiled to standalone validators, with `strictSchema: false`.
- Rejecting a key must not cause the step to vanish silently instead.

## Considered Options

- **A. Root `additionalProperties: false`, with a `properties` allow-list on `step_v3`.**
- **B. `unevaluatedProperties: false`.**
- **C. `additionalProperties: false` inside each `allOf` branch.**
- **D. Warn on unknown keys and keep running.**

## Decision Outcome

Chosen option: **A**.

- `spec_v3` and `spec_v2` reject unknown keys. `spec_v2`'s open root let an unknown key pass through the
  fallback to v2, where the upgrade silently dropped it.
- `step_v3` lists every common key and action at its root, and rejects anything else. A test keeps that list
  in step with the schema.
- The open `click`, `find.click`, `runCode`, `record`, and `dragAndDrop` objects also reject unknown keys.
- An invalid spec exits `2` as usual, and `--no-exit-on-fail` warns and skips it.
- Invalid steps in `before` and `after` files, inline steps, and inline tests with steps count as invalid
  specs. They used to be dropped with a warning while the test carried on, so a stricter schema would have
  made more checks vanish. Steps generated from detected markup still only warn, because nobody authored
  them. A test with no steps also only warns.
- Errors name the key and suggest the nearest valid one.

Runner markers stay out of validation: `_phase` is stamped after validation, `_fromBefore` is non-enumerable,
and the recording actions strip `__autoRecord` and `__stopAny` before they validate.

### Consequences

- Good: a typo fails the run instead of disabling a check.
- Good: specs with no-op keys get found. Six in this repository had them.
- Bad: specs with keys that never did anything now exit `2`. Users must remove or fix those keys.
- Bad: there's no `x-*` escape hatch for custom metadata. It can be added later without a major.
- Neutral: `doc-detective-common` consumers see the same rejection from `validate()`.

### Confirmation

- `src/common/test/strictKeys.test.js` covers the schemas, the v2 fallback, nested paths, and `onInvalid`.
- `test/strict-keys.test.js` runs the real CLI for exit codes, messages, `before`/`after`, and phases.
- `test/core-artifacts/cli/strict-keys.spec.json` runs the same exit codes through the fixture jobs.

## Pros and Cons of the Options

### A. Root `additionalProperties` with an allow-list

- Good: works through `anyOf`, `allOf`, and `$ref`, with one error naming the key.
- Bad: the step's keys are listed twice, which a test has to guard.

### B. `unevaluatedProperties`

- Good: no duplicated list.
- Bad: it silently does nothing here, because draft-07 doesn't have it and `strictSchema: false` ignores it.
  Using it needs a different Ajv class and a keyword outside the schemas' declared draft.

### C. `additionalProperties` in each branch

- Bad: doesn't work. Each branch only sees its own properties, so it rejects valid keys from the others.

### D. Warn only

- Good: nothing turns red.
- Bad: warnings exit `0`, so the check stays disabled in CI, and the problem this solves remains.

## Amendment (2026-11-07): one error format for config and specs

The decision above suggested a key only at a spec, test, or step root, and only for specs. Config errors
stayed raw AJV text in four formats, and one of them printed twice. Specs listed `anyOf` noise
(`click: must be string`, `click: must be boolean`) beside the real problem, and enum errors didn't say which
values were allowed.

One formatter, `summarizeSchemaErrors`, now reads AJV's structured errors (`validate({ structuredErrors: true })`)
for every config source and every spec. Each problem is one line:

- `<path>: <message>`. `<path>` is dotted, with `[n]` indexes, and is left out at the root.
- Unknown key: `unknown key '<k>'.`, plus ` Did you mean <near>?` for the nearest valid key at that path. That
  works at any depth. The key must be under 3 edits and under half the word's length away. The half-length rule
  keeps `nope` from suggesting `type`.
- Enum: `must be one of <a>, <b> (got "<v>").`
- Type: `must be <t1> or <t2> (got "<v>").`
- Required: `missing required key '<k>'.` It's left out when an unknown key's suggestion already names `<k>`.
- An `anyOf` of required keys: `needs one of <a>, <b>.`
- Anything else: AJV's message, plus `.`
- `anyOf`, `oneOf`, and `if` summary lines are dropped. So are the errors of branches the value didn't take:
  - type errors, when something else at the path says what's wrong;
  - a key or a value list that another branch allows;
  - everything at a path that has an error deeper down.
- At most 5 lines, then `and N more`.

Config errors name their source, end with a link to the reference, exit `2`, and print once:

```text
Error: Invalid config in bad.json:
unknown key 'logLevl'. Did you mean logLevel?
concurrentRunners: must be integer or boolean (got "lots").
shell: must be one of bash, cmd, powershell (got "zsh").
See https://docs.doc-detective.com/reference/schemas/config
```

The header is `Invalid config in <file>:` for `-c` or a discovered project config, `Invalid config in
DOC_DETECTIVE_CONFIG:`, `Invalid config in user config <path>:`, or `Invalid config:` when the runner itself
rejects the config, as it does for the JS API. Each source is validated on its own, so the header names the one
that's wrong. Spec errors keep their header and footer, and name the spec relative to the working directory.

Confirmation: `test/cli-contract.test.js` asserts the exact stderr for a config file, `DOC_DETECTIVE_CONFIG`,
and a spec, and that a config error prints once. `test/cli-output-units.test.js` covers each message type.
`test/strict-keys.test.js` covers nested suggestions through the CLI. `test/core-artifacts/cli/config-errors.spec.json`
runs the same errors through the fixture jobs.
