---
status: accepted
date: 2026-11-06
decision-makers: doc-detective maintainers
---

# setConfig leaves the caller's config unchanged

## Context and Problem Statement

`setConfig` resolves environment variables with `replaceEnvs` before it validates the config, and `replaceEnvs`
rewrites the object in place. A programmatic caller that passes `input: ["$DOCS"]` gets its own object back with
`"$DOCS"` replaced by the current value. Reusing that object for a later run fixes the old value, even after the
variable changes.

Validation then returns a JSON clone, so the fileType normalization that follows, including the `extends` merge,
already works on a copy. [ADR 01153](01153-one-default-filetypes-table.md) covers the shared default table.

Should `setConfig` mutate its input?

## Decision Drivers

- Callers reuse config objects across runs, in tests and in long-lived hosts like the LSP.
- One run's resolution must not leak into the next.
- The change should not alter which configs validate, or what they resolve to.

## Considered Options

- **A. Copy the config once, at the top of `setConfig`, with a JSON round-trip.**
- **B. Copy with `structuredClone`.**
- **C. Make `replaceEnvs` return a new object instead of rewriting in place.**

## Decision Outcome

Chosen option: **A**. `setConfig` JSON-clones the config before `replaceEnvs`. Validation already applies the
same clone a few lines later, so the resolved config is unchanged, and the caller's object is never written to.

### Consequences

- Good: the caller's config, and every fileType object in it, is the same after `setConfig` as before it.
- Good: calling `setConfig` twice with the same object gives the same result.
- Neutral: one extra clone per run. Configs are small.

### Confirmation

`test/config-coverage.test.js` passes a config with a `$VAR` input and an `extends` fileType. It asserts that the
object is deep-equal to a snapshot after `setConfig`, and that a second call resolves the same fileTypes.

## Pros and Cons of the Options

### A. JSON round-trip at the top of setConfig

- Good: one line, and it matches the clone validation already does, so nothing that passed before is lost.

### B. structuredClone

- Bad: throws on a function-valued property, which the JSON clone in validation silently drops today.

### C. Non-mutating replaceEnvs

- Good: fixes every caller of `replaceEnvs`.
- Bad: `replaceEnvs` also resolves steps, HTTP requests, and OpenAPI examples. Changing it touches every step's
  resolution, a wider change than this bug needs.
