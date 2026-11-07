---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# validate() returns the effective step

Amends [ADR 01149](01149-declare-the-report-contract.md) and [ADR 01150](01150-reject-unknown-keys-on-specs-and-steps.md).

## Context and Problem Statement

Ajv can't apply defaults inside `step_v3`'s `oneOf` union, and every action schema's root is an `anyOf` of a
string shorthand and an object. So none of the 59 action defaults in the schemas is ever applied. Each action
handler expands its own shorthand and hand-codes its own defaults at run time, and the schema `default`s are
documentation that the copies happen to match. Some copies use `||`, so an authored `0` turns into the default.

So validating `{"goTo": "https://example.com"}` returns exactly that, and only the goTo handler knows the timeout
that applies. The language server, Online, and report readers can't see the step that actually ran. Where should
shorthand expansion and defaults live, and what should `validate()` return?

## Decision Drivers

- One source of truth for defaults: the schema the docs are generated from.
- Every consumer of `validate()` should see the step the runner runs.
- A caller that only wants a yes or no must get its own object back, unchanged.
- Test and step IDs hash the authored step, so they mustn't change.
- Each area's actions should move on their own, without merge conflicts between them.

## Considered Options

- **A. Normalize inside `validate()`, with one normalizer per action.**
- **B. Rewrite the schemas so Ajv applies the defaults.** Replace the unions with `if`/`then`.
- **C. Keep defaults in the runtime, read from the schema by a shared helper.** Pin them to the schema with a
  test.

## Decision Outcome

Chosen option: **A**.

- After the schema check passes, `validate()` normalizes every step in the object on its own clone. That covers
  `step_v3`, every step in a `test_v3`, and every step in a `spec_v3`. Steps from inline statements and from
  `before` and `after` files arrive through the same calls. A test's resolved `contexts`, configs (including
  markup templates), and reports aren't walked.
- `addDefaults: true`, the default, returns the effective object. `addDefaults: false` returns the caller's object
  unchanged when it's valid, except that a v2 object still comes back upgraded to v3. The upgrade isn't
  normalized, so the IDs detection hashes from it don't change. The caller's object is never changed in either
  mode.
- Normalization runs in both modes, so validity doesn't depend on `addDefaults`. An error it raises, such as
  setting both a key and its deprecated alias, makes the object invalid in both. With `structuredErrors`, the
  error is an `errorObjects` entry with the keyword `normalize` at the action's path, so the language server can
  place it.
- Each action has one normalizer, `src/common/src/normalize/<action>.ts`, registered in `normalize/index.ts`. In
  order, it expands shorthand to the object form, renames deprecated aliases, canonicalizes scalars, and applies
  defaults. Plain defaults come from the schema's object branch. Conditional ones are coded. It's idempotent. It
  never touches `$VAR` or `$$` values, paths, config, or runtime state. Step-level `unsafe`, `breakpoint`,
  `outputs`, and `variables` stay as authored.
- A deprecated step key is renamed to its new name with one warning per run on stderr:
  ``Warning: `<old>` is deprecated. Rename it to `<new>`.``. Setting both is invalid:
  ``<path>: set `<new>` or `<old>`, not both.``
- The runner applies the effective step to each step after it assigns step IDs, so IDs still hash the authored
  step. That first pass runs before environment variables are substituted, so it skips a step with a
  whole-variable value, such as `"goTo": "$NAV"`, because the variable can hold the whole action object. The
  runner applies the effective step again in `runStep` after substitution. That pass normalizes those steps, and
  it lets `getRunner()` callers pass authored steps. Handlers receive effective steps and contain no shorthand
  or default handling.
- The report echoes the effective step. That changes a report field's shape, for example `goTo` from a string
  to an object, so it ships in 5.0.
- This change moves `goTo` and `httpRequest`. The other 19 actions are registered as passthroughs, and their
  area chunks move them. `test/shorthand-ratchet.test.js` counts the handler files that still branch on
  shorthand. It's 15 after this change, and it reaches 0 when every action has moved.

The pilots keep today's behavior, with three exceptions:

- An authored `0` for goTo's or httpRequest's `timeout` is kept, not replaced by the default. A goTo with
  `timeout: 0` fails, because the page can't load in no time. An httpRequest passes 0 to axios, which means no
  time limit.
- `httpRequest.response.body` loses its schema default of `{}`. The handler never applied it, because an unset
  body must skip the body check.
- For an httpRequest with `openApi`, the operation supplies the method, the status codes, and the request body.
  A step whose OpenAPI config adds no headers and no request example used to send a `{}` body, and now sends
  none. With `validateAgainstSchema` set to `request` or `both`, that step now validates an absent body
  (`undefined`) instead of `{}`. An operation whose request schema expects an object, even one with no required
  fields, passed before and now fails. Authoring `request.body` restores the old behavior.

### Consequences

- Good: the schema is the only place a plain default is written, and the docs show what runs.
- Good: the language server, Online, and report readers see the effective step.
- Good: a later rename has one place to live, with one warning and one conflict error.
- Bad: report consumers that read `goTo` as a string must read `goTo.url`. Steps show every default.
- Bad: `validate()` does a little more work per call, including with `addDefaults: false`.
- Neutral: a `doc-detective-common` caller that relied on `validate()` returning the authored shorthand must pass
  `addDefaults: false`.

### Confirmation

- `src/common/test/normalize.test.js` covers the authored → effective examples, idempotence, both `addDefaults`
  modes, the alias plumbing, and a parity check. That check asserts that each moved action's normalizer fills
  every plain `default` in its schema.
- `test/cli-contract.test.js` asserts that the `--json` report's goTo step is an object with `timeout`.
- `test/effective-step.test.js` covers the runner applying the effective step in place.
- `test/shorthand-ratchet.test.js` holds the handler count at its ceiling.

## Pros and Cons of the Options

### A. Normalize inside validate()

- Good: one call gives every consumer the same step.
- Good: string shorthand gets defaults too.
- Bad: reports change shape, which is breaking.

### B. Ajv applies the defaults

- Good: no hand-written normalization.
- Bad: touches all 22 action schemas and the generators. Ajv can never default a string shorthand, so handlers
  would keep their own copies anyway.

### C. Runtime reads defaults from the schema

- Good: not breaking, because reports keep their shape.
- Bad: `validate()` still returns the authored step, so only the runner knows what runs.
