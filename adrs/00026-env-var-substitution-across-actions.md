---
status: accepted
date: 2022-09-16
decision-makers: doc-detective maintainers
---

# Environment-variable substitution across actions

## Context and Problem Statement

Test specs needed to reference secrets and environment-specific values (tokens, hostnames,
credentials) without hardcoding them. Doc Detective had no mechanism to load environment variables or
substitute `$VAR` references inside action fields. How should environment values be loaded, where
should `$ENV` substitution apply, and how granular should the substitution be?

## Decision Drivers

* Secrets and per-environment values must stay out of committed test specs.
* Substitution should work across the action types that carry user-supplied strings
  (`runShell`, `type`, `matchText`, `checkLink`, …).
* Loading `.env` files is the conventional way to supply local environment values.
* Substitution must reach values nested inside strings, not only whole-value fields.

## Considered Options

* **A. `$ENV` substitution across actions via `setEnvs`/`loadEnvs`, dotenv-backed, with a top-level `config.env`** (chosen).
* **B. Whole-value-only substitution (a field is either entirely a var reference or a literal).**
* **C. Require callers to pre-expand variables before invoking Doc Detective.**

## Decision Outcome

Chosen option: **A**, because spec-level `$VAR` references plus dotenv loading is the standard,
low-friction pattern. The contract was introduced and then refined across two inventory decisions:

1. Environment support was added across actions — `runShell`/`type`/`matchText`/`checkLink` gained an
   `env`, `setEnvs()` was added, `dotenv` became a dependency, a top-level `config.env` was
   introduced, and the yargs `-e` short flag was remapped from `--ext` to `--env` (commits
   `9ba206a`, `a69d957`, `e2a8220`).
2. The parsing was rewritten so `loadEnvs` resolves `$VAR` **inside** sub-strings rather than only
   when a field's entire value is a variable reference, accepting string-or-object inputs
   (`loadEnvs`/`loadEnvsForString` in `utils.js`, commit `42aacdd5`).

The net contract: load environment values (including from a dotenv file via `config.env`) and
substitute `$VAR` anywhere it appears within action string values.

### Consequences

* Good: secrets/per-environment values stay out of specs; substitution is fine-grained.
* Good: dotenv loading is a familiar, low-friction mechanism.
* Bad: remapping `-e` from `--ext` to `--env` is a breaking CLI change.
* Neutral: substitution semantics later recur in the v2/v3 `loadEnvs` recursive walk (`00078`).

### Confirmation

Shipped in commits `9ba206a`, `a69d957`, `e2a8220` (env across actions + dotenv + `config.env` + `-e`
remap) and `42aacdd5` (sub-string `loadEnvs`/`loadEnvsForString`). Recursive substitution later
confirmed by `00078`.

## Pros and Cons of the Options

### A. `$ENV` across actions + dotenv + sub-string substitution
* Good: standard, fine-grained, keeps secrets out of specs.
* Bad: `-e` flag remap breaks existing invocations.

### B. Whole-value-only substitution
* Good: simpler to implement.
* Bad: cannot interpolate a var into a larger string (URLs, commands).

### C. Pre-expand before invoking
* Good: no substitution code in the tool.
* Bad: pushes env handling onto every caller; not spec-portable.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `9ba206a`, `a69d957`,
`e2a8220`, `42aacdd5`. Inventory ref: BACKFILL-INVENTORY.md Seq 32, 52. Related: `00078` (recursive
`loadEnvs`).
