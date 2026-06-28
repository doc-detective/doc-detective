---
status: accepted
date: 2024-03-29
decision-makers: doc-detective maintainers
---

# loadEnvs recursive in-place $VAR substitution

## Context and Problem Statement

Env-var substitution (`loadEnvs`) only resolved a `$VAR` when it constituted the whole value, and it
unconditionally `JSON.parse`d substituted strings to coerce types. That meant `$VAR` embedded inside
a larger string (a URL, a header value) was left unresolved, and the forced JSON coercion corrupted
plain strings that happened to look parseable. How should `$VAR` references be resolved across the
nested structures a step or config can contain?

## Decision Drivers

* `$VAR` must resolve wherever it appears — embedded in a substring, not only as a whole value.
* Substitution must walk nested objects/arrays, not just top-level string fields.
* A whole-string `$VAR` match should be able to substitute a structured (object) value.
* Forced `JSON.parse` coercion corrupted strings and must be dropped.

## Considered Options

* **A. Rewrite `loadEnvs` as a recursive in-place `$VAR` walk: substitute inside sub-strings, whole-
  string match yields the object value, drop unconditional JSON.parse** (chosen).
* **B. Keep whole-value-only substitution and ask users to avoid embedded `$VAR`.**
* **C. Substitute embedded vars but keep the JSON.parse coercion.**

## Decision Outcome

Chosen option: **A** (`core`, commit `7a9e3c84`):

1. **Recursive walk**: `loadEnvs` traverses nested objects and arrays in place, resolving `$VAR`
   references anywhere they occur.
2. **Embedded substitution**: a `$VAR` inside a larger string is substituted; a whole-string `$VAR`
   match substitutes the underlying value (which may be an object).
3. **No forced coercion**: the unconditional `JSON.parse` of substituted strings is removed, so plain
   strings survive intact.

## Pros and Cons of the Options

### A. Recursive in-place walk, no JSON coercion (chosen)
* Good: `$VAR` works everywhere; nested fields resolve; strings aren't mangled.
* Bad: a recursive walk over arbitrary structures is more code than the whole-value check.

### B. Whole-value only
* Good: simplest.
* Bad: embedded `$VAR` (URLs, headers) silently unresolved.

### C. Embedded substitution + keep coercion
* Good: resolves embedded vars.
* Bad: forced JSON.parse keeps corrupting plain strings.

### Consequences

* Good: predictable substitution across all nested step/config fields.
* Good: object values can be injected via a whole-string `$VAR`.
* Bad: callers that relied on the old auto-coercion must parse explicitly.
* Neutral: this `loadEnvs` model later coexists with `$n` capture-group substitution and `{{…}}`
  expressions.

### Confirmation

The recursive `loadEnvs` rewrite in `doc-detective-core` `7a9e3c84` (in-place walk, object
substitution, JSON.parse removal).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `7a9e3c84`. Inventory
ref: BACKFILL-INVENTORY.md Seq 114. Related: `00026` (env-var substitution across actions), `00081`
(capture-group substitution), `00104` (expressions runtime).
