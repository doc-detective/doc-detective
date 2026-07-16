---
status: accepted
date: 2026-07-16
decision-makers: doc-detective maintainers
---

# Back stop undeclared secrets with value-shape redaction only, not name-based

## Context and Problem Statement

[ADR 01071](01071-inline-secret-references.md) and [ADR 01072](01072-run-wide-secret-mask-registry.md)
protect a credential the author **declared** with `$secret.NAME`. Neither helps the author who never
adopted the syntax: a plain `$PASSWORD` still resolves into the report, exactly as it always has.

Doc Detective already owns redaction machinery for this shape of problem —
[src/debug/redact.ts](../src/debug/redact.ts) detects secret-shaped **names**
(`token|secret|key|password|auth|credential|bearer`, connection-string suffixes) and secret-shaped
**values** (JWTs, GitHub PATs, AWS access key IDs, URL userinfo). It is reachable only from the
`debug` dump subcommand. Should we promote it to the report and log boundaries, and if so, both
halves or one?

## Decision Drivers

* Catch real credentials the author didn't declare.
* Don't degrade reports for the vast majority of users, who have no secrets at all.
* Don't undermine 01071/01072: the placeholder and the mask are *deliberate, useful* output.
* A backstop is a safety net, not the mechanism — false negatives are tolerable, silent damage isn't.

## Considered Options

* **A. Value-shape redaction only at the report/log boundaries; name-based stays in the debug dump** (chosen).
* **B. Full `redactObject` (name + value) at the report boundary, behind an opt-out.**
* **C. No backstop; rely on `$secret.` alone.**

## Decision Outcome

Chosen option: **A**, settled by measurement rather than argument. Running `redactObject` over real
run output showed the name-based half is actively harmful at this boundary:

1. **On a run that already uses `$secret.`** (the secrets fixture), *every* redaction was name-based,
   and every one destroyed something already safe:
   - `httpRequest.request.headers.Authorization = "Bearer $secret.SECRET"` → redacted. That is the
     **placeholder** — the "which credential did this step use?" signal 01071 goes out of its way to
     preserve.
   - `outputs.response.body.token = "prefix-***secret.SECRET***-suffix"` → redacted. That is 01072's
     **mask**. Redacting a mask is pure loss.
   The value-shape half found nothing, correctly: 01071/01072 had already handled the real values.

2. **On a report from an author who has not adopted `$secret.`**, value-shape caught both genuine
   credentials (a JWT, and `postgres://app:hunter2@db.internal/prod`) while leaving legitimate
   content alone. Name-based caught the same two, and additionally destroyed
   `Authorization: "Bearer public-demo-token"`, `apiKey: "demo"`, and `token: "not-a-real-credential"`
   — the kind of deliberately public values our own docs examples use.

The decisive point: name-based redaction keys off the **field name**, but the most common undeclared
leak has an innocuous one. `type: "$PASSWORD"` reports as `type: "hunter2"` — key `type`, which no
name pattern matches. So the name-based half misses the very case it would be added for, while
reliably damaging reports that were already fine. B buys almost nothing and costs real information,
even behind a flag most users never touch. C leaves a known, cheap-to-close gap.

Behavior decided:

1. **Value-shape only** (`isSecretValue`) at the two log choke points and over the results object at
   the end of `runSpecs`, after the 01072 registry scrub.
2. **Name-based redaction stays in the `debug` dump**, unchanged. There the trade inverts: the user
   explicitly asked for a dump to paste into a bug report, so over-redaction is correct and the field
   names are right there as context.
3. **One opt-out**: `heuristicRedaction` (boolean, config only, default `true`). Layers 1–2 are
   unconditional — a *declared* secret is always protected, whatever this is set to.

### Consequences

* Good: real credentials (JWTs, cloud tokens, connection strings) are caught even when undeclared.
* Good: reports for the overwhelming majority of runs — no secrets at all — are byte-identical.
* Good: 01071's placeholder and 01072's mask survive intact, so a masked report stays debuggable.
* Bad: a credential with no recognizable shape (`hunter2`, a random password) is not caught. This is
  the acknowledged false negative, and it is exactly what `$secret.` exists for. The docs say so
  plainly rather than implying the backstop is protection you can rely on.
* Neutral: a legitimate value that *looks* like a JWT or a connection string is redacted from
  reports. `heuristicRedaction: false` is the escape hatch.

### Confirmation

Unit tests in `test/secrets.test.js`: a JWT and a URL-userinfo connection string in step `outputs`
are redacted in the results; a public demo token, a short `apiKey`, and — importantly — the
`$secret.NAME` placeholder and the `***secret.NAME***` mask all survive untouched (the regression the
measurement above warned about). `heuristicRedaction: false` disables the pass while a declared
secret stays masked. Schema positive/negative cases in `src/common/test/validate.test.js`.

## Pros and Cons of the Options

### A. Value-shape only at report/log; name-based stays in the debug dump
* Good: catches real credentials; no collateral damage to ordinary reports, placeholders, or masks.
* Good: no change at all for runs without secrets.
* Bad: misses shapeless credentials.

### B. Full name + value at the report boundary
* Good: catches a shapeless credential *if* it sits under a secret-shaped key.
* Bad: misses the common `type:`/`runShell:` leak anyway (innocuous key), destroys public demo values
  and our own docs examples, and redacts 01071 placeholders and 01072 masks.

### C. No backstop
* Good: zero risk, zero new surface.
* Bad: leaves a real, cheaply-closed gap for anyone who hasn't adopted `$secret.` yet.

## More Information

Full three-layer design and non-goals: [docs/design/secrets-management.md](../docs/design/secrets-management.md).
The detection patterns are unchanged and still live in `src/debug/redact.ts`; this ADR only decides
*which half* runs *where*.
