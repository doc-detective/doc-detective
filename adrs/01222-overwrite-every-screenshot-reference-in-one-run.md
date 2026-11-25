---
status: accepted
date: 2026-11-25
decision-makers: doc-detective maintainers
---

# Overwrite every screenshot reference in one run

## Context and Problem Statement

A `screenshot` step's `overwrite` decides when the new capture replaces the reference image. It
takes `"true"`, `"false"`, or `"aboveVariation"`, and defaults to `"aboveVariation"`. After an intentional
redesign, every reference is out of date. The only way to refresh them was to edit `overwrite` on
each step, run, and edit it back. The reverse need exists in CI: a pipeline should never rewrite
references, whatever the steps say. How does a user set `overwrite` for a whole run?

## Decision Drivers

- One concept, one set of values (CLAUDE.md "Plans and interfaces" rule 1): the run-wide knob takes
  the step's `overwrite` enum.
- CLI flags override config, and runtime code reads only `config` (CLAUDE.md "CLI flags ↔ config").
- Automatic screenshots that compare against a reference must follow the same setting.
- The smallest change in `saveScreenshot`, which every screenshot path goes through.

## Considered Options

1. A config key `overwriteScreenshots` plus a `--overwrite-screenshots [mode]` flag that replace every
   step's `overwrite`.
2. A config key that only sets the default, so a step's explicit `overwrite` still wins.
3. A boolean `--update-screenshots` flag that means `overwrite: "true"` only.

## Decision Outcome

Chosen option: 1.

- **Config** `overwriteScreenshots`: `"true"` | `"false"` | `"aboveVariation"`, optional, unset by
  default. When set, it replaces every `screenshot` step's `overwrite`, including automatic screenshots
  that compare against a reference.
- **CLI** `--overwrite-screenshots [mode]`: the same choices. The bare flag means `"true"`. It
  overrides the config key.
- **Precedence:** flag, then config `overwriteScreenshots`, then the step's `overwrite`, then the
  schema default `"aboveVariation"`.
- **Values keep the step's meaning.** `"false"` with an existing reference skips the step
  (``Skipped: file already exists at `<path>`. ...``) and leaves the reference unchanged. A URL
  reference still ignores `overwrite`.
- **Usage error:** any other value exits `2` and prints this line to stderr:

  ```text
  error: option '--overwrite-screenshots [mode]' argument 'maybe' is invalid. Allowed choices are true, false, aboveVariation.
  ```

  Because the value is optional, an input given right after the bare flag is read as its value and
  rejected the same way. Put inputs first, or give the flag a value.

`saveScreenshot` applies the key once, right after it resolves the effective step, so every caller
(authored steps, automatic screenshots, recording checkpoints) gets it.

### Consequences

- Good, because a redesign is one command: `doc-detective --overwrite-screenshots`.
- Good, because CI can pin `"false"` in config and no step can rewrite a reference.
- Good, because the values and their meanings match the step's `overwrite`.
- Bad, because a step can't opt out of the run-wide setting. That's the point of the knob: a run that
  says "replace everything" or "replace nothing" means it.
- Bad, because an optional-value flag can swallow a following input. The error names the bad value,
  and the docs show the order.

### Confirmation

- `test/utils.test.js`: parsing (each value, the bare flag, absence, a bad value) and the `setConfig`
  override.
- `src/common/test/validate.test.js`: each value validates, the key has no default, and an unknown
  value is rejected.
- `test/saveScreenshot.test.js`: config `"false"` beats a step's `"true"`, and config `"true"` beats a
  step's `"aboveVariation"`.
- `test/core-artifacts/capture/screenshot-overwrite-all.spec.json`: through the real CLI, config
  `"false"` leaves a reference unchanged, and the bare flag beats config `"false"` and replaces it.

## Pros and Cons of the Options

### 1. Replace every step's `overwrite`

- Good, because both use cases, refresh everything and never write, are one setting.
- Bad, because no per-step exception exists.

### 2. Set only the default

- Good, because explicit steps keep control.
- Bad, because it can't refresh steps that set `overwrite: "false"` or stop steps that set `"true"`,
  which are the two cases users need.

### 3. A boolean `--update-screenshots`

- Good, because it's the most familiar name from snapshot-testing tools.
- Bad, because it introduces a second vocabulary for the same concept and can't express `"false"` for
  CI.
