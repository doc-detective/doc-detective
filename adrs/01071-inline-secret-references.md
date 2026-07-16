---
status: accepted
date: 2026-07-16
decision-makers: doc-detective maintainers
---

# Inline `$secret.NAME` references that resolve from the environment but are never emitted

## Context and Problem Statement

Credentials in Doc Detective are ordinary environment variables. A spec references one as `$VAR`,
and `replaceEnvs` (`src/core/utils.ts`) substitutes it **in place** on the step object at the top of
`runStep` (`src/core/tests.ts`). The step report is then built by spreading that same, now-resolved
object (`{ ...step, ...r }`), so a step like `typeKeys: "$PASSWORD"` writes the literal password into
the JSON report, the HTML report, and every debug-level log line. The `config_v3` schema already
warns about one instance of this for `origin` params ("values … appear verbatim in test results,
logs, and reports").

Nothing in the system distinguishes a credential from any other variable, so nothing *can* protect
one. How should a spec author mark a value as secret, where may it be used, and what must the runner
guarantee about it?

This ADR covers the reference syntax and resolution semantics only. Run-wide masking of resolved
values (the exact-value registry) and heuristic redaction of *undeclared* secrets are separate
decisions, deliberately sequenced after this one; see
[docs/design/secrets-management.md](../docs/design/secrets-management.md) for the full three-layer
design.

## Decision Drivers

* A resolved secret must not reach any report, log, or off-box egress path.
* Existing `$VAR` behavior is long-standing observable surface — specs and downstream tooling depend
  on resolved values appearing in reports. It must not change.
* A secret that is *compared* is an oracle: pass/fail, retry counts, and echoed failure descriptions
  each leak information about the value. Protection must be structural, not advisory.
* Failure modes must be obvious. Silently typing a literal `$secret.NAME` into a login form (the
  current fallback for an unset `$VAR`) produces a confusing downstream error.
* No new dependencies, no new credential sources — CI systems already inject secrets as env vars.

## Considered Options

* **A. Inline `$secret.NAME` references, env-only source, never emitted or matched** (chosen).
* **B. A `secrets:` declaration block in `config_v3` listing env var names to protect.**
* **C. Keep `$VAR` and protect values by heuristic redaction alone.**
* **D. Mark secrecy per step (e.g. a `sensitive: true` step option).**

## Decision Outcome

Chosen option: **A**. The reference site is the only place that knows whether a given use is a
credential, so marking secrecy *at the reference* keeps the declaration adjacent to the use, needs no
second file to stay in sync, and makes review trivial — `$secret.` in a diff is the whole signal. B
separates the declaration from the use and cannot distinguish a var used as a credential in one step
and as ordinary data in another. C is unreliable by construction (a random password matches no shape)
and is adopted only as a backstop layer, not the mechanism. D marks the wrong unit: a step may mix a
credential and reportable data in different fields.

Behavior decided:

1. **Syntax and source.** `$secret.NAME` (where `NAME` is `[A-Za-z0-9_]+`) resolves from
   `process.env.NAME` at step-execution time. Existing loading mechanisms (`loadVariables`,
   CI-injected env) are unchanged as *sources*; the prefix changes only how the value is *handled*.
   Substring use is supported (`"Bearer $secret.API_TOKEN"`).

2. **Opaque resolution.** A secret resolves to a string and nothing more. The whole-string
   JSON→object expansion and the nested `$VAR` re-resolution that `replaceEnvs` performs do **not**
   apply to secret values: both would walk, spread, and re-emit the value field by field.

3. **Execution copy vs. report copy.** `runStep` resolves a deep clone. Action handlers receive the
   execution copy carrying real values; the report copy retains `$secret.NAME` verbatim. Reports gain
   information — the placeholder names which credential a step used. Plain `$VAR` continues to
   resolve on the report copy exactly as before.

4. **Secrets are never matched.** A `$secret.` token in any emit-or-compare field is a step FAIL at
   resolution time, before any value is read. Blocked: match/assertion fields (`find.elementText`,
   `httpRequest.response.*`, `statusCodes`, `runShell`/`runCode` `stdio` and `exitCodes`, element
   targets and `waitUntil`), `$$` expression strings, routing conditions (`if`, `assertions`,
   `onPass`/`onFail`/`onWarning`/`onSkip`), variable assignment (`variables`, `outputs` — which write
   to `process.env` and would launder the value back in unprotected), and `description`. Emit sinks
   that send the value to the system under test — `typeKeys`/`type` `keys`, request URLs, headers and
   bodies, shell commands — are allowed.

5. **Unset secret is a FAIL.** The step fails immediately, naming the variable and never its value.
   Context-level `requires.env` remains the way to express "skip when the credential is absent."

6. **Prefix reservation.** `ENV_VAR_REGEX` gains a negative lookahead so it can never consume the
   `$secret` prefix of a token. This reserves the exact form `$secret.` followed by a word character
   from being read as an env var named `secret`.

### Consequences

* Good: a declared secret cannot reach a report, log, routing decision, or the `reportResults` POST
  by construction, not by pattern-matching luck.
* Good: `$VAR` behavior is byte-identical; adoption is per-reference and incremental.
* Good: the deep clone also fixes latent aliasing — today a retried step re-resolves an
  already-resolved object.
* Bad: secrets cannot participate in routing or assertions. This is the point (a routing rule over a
  secret is a readable function of the value), but it means "assert the login succeeded" must be
  expressed against an observable effect — a post-login element, a status code — rather than the
  credential itself.
* Bad: a per-action blocked-field list must track new actions and fields as they are added. It is
  centralized in one table in `src/core/secrets.ts` and fails closed.
* Neutral: an env var literally named `secret` referenced as `$secret.` followed by a word character
  is now unreachable — a deliberate, vanishingly narrow reservation.
* Out of scope, documented as such: screenshots and recordings of a typed credential, `saveCookie`
  files at rest, a child process that transforms a value, and the app under test printing the
  credential to its own UI.

### Confirmation

Red→green unit tests in `test/secrets.test.js`: token matcher (substring, multiple refs, `$KEY$`
sentinel non-collision, and the `$secret` prefix surviving `ENV_VAR_REGEX` — including the Windows
case-insensitive-env trap where a stray `SECRET` var would otherwise corrupt the token); unset-secret
FAIL wording asserting the value never appears; one blocked-field case per row of the table above;
and the execution/report split (the caller's step object is not mutated, and the report retains the
placeholder). FAIL-path permutations live in mocha because fixtures must resolve to PASS or SKIPPED.
PASS-path coverage lands as fixtures in `test/core-artifacts/secrets/` with the layer-2 masking work.

## Pros and Cons of the Options

### A. Inline `$secret.NAME`, env-only, never emitted or matched
* Good: declaration sits at the use site; reviewable in a diff; no second file to sync.
* Good: per-reference granularity — the same var can be a credential in one step and data in another.
* Bad: requires a maintained per-action blocked-field table.

### B. `secrets:` block in config
* Good: one place to audit every credential a suite uses.
* Bad: declaration drifts from use; cannot express per-use secrecy; a config-file change is needed to
  protect a spec-level reference.

### C. Heuristic redaction only
* Good: zero authoring change; protects existing specs retroactively.
* Bad: false negatives are structural — a random password matches no name or value shape. Adopted as
  a backstop layer instead.

### D. Per-step `sensitive: true`
* Good: simple to specify.
* Bad: wrong granularity — suppresses reportable data in the same step, and still needs a rule for
  which fields carry the secret.

## More Information

Full three-layer design, including the mask registry and heuristic backstop that follow this ADR:
[docs/design/secrets-management.md](../docs/design/secrets-management.md). Resolution and the blocked-field
table live in `src/core/secrets.ts`; the execution/report split is in `runStep` (`src/core/tests.ts`).
