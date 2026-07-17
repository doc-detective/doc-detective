# Design: secrets management (`$secret.NAME` references + run-wide masking)

Status: **All three phases shipped** — [ADR 01071](../../adrs/01071-inline-secret-references.md)
(references), [ADR 01072](../../adrs/01072-run-wide-secret-mask-registry.md) (mask registry), [ADR
01073](../../adrs/01073-value-shape-redaction-backstop.md) (value-shape backstop). This document is
the design for first-class secrets in Doc Detective: an inline
`$secret.NAME` reference syntax that reads from environment variables but is **never emitted** — not
in reports, logs, step outputs, routing, or expressions — backed by a run-wide exact-value mask
registry and a heuristic redaction backstop. External secret providers (vaults, 1Password, cloud
secret managers) are **explicitly out of scope**: environment variables are the only source, and CI
systems already inject platform secrets as env vars.

Implementation lives in [src/core/secrets.ts](../../src/core/secrets.ts); the seams are `runStep` /
`runStepOnce` / the end of `runSpecs` in [src/core/tests.ts](../../src/core/tests.ts). User-facing
docs: [docs/fern/pages/docs/test-code/secrets.mdx](../fern/pages/docs/test-code/secrets.mdx).

## Problem

Secrets in Doc Detective today are ordinary environment variables, and the pipeline treats them
like any other string:

- Specs reference them as `$VAR`; `replaceEnvs`
  ([core/utils.ts:1491](../../src/core/utils.ts)) substitutes them **in place** on the step object
  at the top of `runStep` ([tests.ts:5094](../../src/core/tests.ts)). `httpRequest` resolves a
  second time internally ([httpRequest.ts:178](../../src/core/tests/httpRequest.ts)).
- The step report is built by spreading that resolved step — `{ ...step, ...r }`
  ([tests.ts:4754](../../src/core/tests.ts)) — so `typeKeys: "$PASSWORD"` lands the literal
  password in the JSON report, the HTML report
  ([reporters/htmlReporter.ts](../../src/reporters/htmlReporter.ts)), and any debug-level log
  (`RESULT: … ${JSON.stringify(r)}`, [tests.ts:4746-4749](../../src/core/tests.ts)).
- Step `outputs` (e.g. `outputs.response` from `httpRequest`,
  [httpRequest.ts:343-368](../../src/core/tests/httpRequest.ts)) are stored verbatim in the report
  and fed to the routing accumulator (`stepOutputsById`,
  [tests.ts:4774-4776](../../src/core/tests.ts)) — an auth endpoint's response body carries the
  token straight into both.
- Redaction machinery exists — name-pattern and value-shape detection in
  [debug/redact.ts](../../src/debug/redact.ts) — but is wired **only** into the `debug` dump
  subcommand, not the runner's logs or reporters.
- The `config_v3` schema already warns about one instance of this
  (`origin` params: "values … appear verbatim in test results, logs, and reports").

Nothing distinguishes a secret from any other variable, so nothing *can* protect it.

## Decisions (settled, 2026-07-16)

1. **Inline `$secret.NAME` syntax; env vars are the only source.** A step string containing
   `$secret.API_TOKEN` resolves from `process.env.API_TOKEN` at execution time. Existing loading
   mechanisms (`loadVariables` config key and step action, CI-injected env) keep working unchanged
   as *sources*; the `$secret.` prefix changes only how the value is *handled*, never where it
   comes from. No provider plugins, no fetch-at-run-start integrations.
2. **Secrets are never emitted and never matchable.** The resolved value must not appear in step
   reports, logs at any level, step `outputs`, the routing accumulator, `$$` expression inputs, or
   variable assignments. This is deliberately a capability trade-off: a routing rule or match
   condition over a secret is an oracle — `onFail` branching, retry counts, or failure
   descriptions that echo the expected text would let a spec (or its report) leak the value one
   comparison at a time. If it's secret, we don't emit it and we don't match on it.
3. **Plain `$VAR` behavior is unchanged.** Resolved-in-report `$VAR` substitution is long-standing
   observable behavior that specs and downstream tooling rely on. `$secret.` is the opt-in escape
   hatch, not a change to the default.
4. **Defense in depth: three layers.** Placeholder-preserving resolution (layer 1) is the
   mechanism; an exact-value mask registry (layer 2) catches anything that still echoes a resolved
   value (driver error messages, server responses that reflect the token, shell output); heuristic
   redaction (layer 3) catches secrets the author *didn't* declare.
5. **Unset secret = step FAIL, name-only message.** Typing the literal string `$secret.NAME` into
   a login form (today's silent fallback for unset `$VAR`) is a confusing downstream failure.
   An unresolvable secret fails the step immediately with the variable *name* and guidance;
   context-level `requires.env` ([core/utils.ts:1439](../../src/core/utils.ts)) remains the way to
   express "skip this context when the credential is absent."

## Layer 1 — `$secret.NAME` references with placeholder-preserving resolution

### Token grammar

`$secret.NAME` where `NAME` matches `[A-Za-z0-9_]+` (an environment variable name). Matcher:
`/\$secret\.([A-Za-z0-9_]+)/g`. Substring use is supported the same way `$VAR` is
(`"Bearer $secret.API_TOKEN"`), whole-string use resolves to the raw value. Unlike `$VAR`,
whole-string JSON expansion ([core/utils.ts:1510-1517](../../src/core/utils.ts)) does **not**
apply — a secret resolves to an opaque string, never to an object that would be walked, spread,
and reported field by field. Nested resolution (`replaceEnvs` re-resolving `$VAR` refs found
*inside* a resolved value) also does not apply to secret values, for the same reason.

The existing `$KEY$` sentinel vocabulary (`$ENTER$`, `$HOME$`) is unaffected — sentinels require a
trailing `$`, which the secret grammar never produces.

### Interaction with `ENV_VAR_REGEX`

Today's env matcher `/\$[a-zA-Z0-9_]+(?![a-zA-Z0-9_$])/g`
([core/utils.ts:1489](../../src/core/utils.ts)) would match the `$secret` prefix of a
`$secret.NAME` token (the `.` passes its lookahead), and on Windows — where `process.env` is
case-insensitive — an unrelated `SECRET` env var would corrupt the token before the secret
resolver ever saw it. Two coordinated changes:

- The secret resolver runs **before** `replaceEnvs` on the execution copy, consuming its tokens.
- `ENV_VAR_REGEX` gains a guard so it can never eat the prefix regardless of ordering:
  `/\$(?!secret\.[A-Za-z0-9_])[a-zA-Z0-9_]+(?![a-zA-Z0-9_$])/g`. This is technically a behavior
  change for a spec that literally references an env var named `secret` adjacent to a dot — an
  intentional, vanishingly narrow reservation, called out in the ADR.

### Execution copy vs. report copy

`runStep` today resolves the caller's step object in place; the report inherits the resolved
values. The fix is a split at the top of `runStep`
([tests.ts:5092-5094](../../src/core/tests.ts)):

```text
report step    = replaceEnvs(step)              // in place on the caller's object, as today
execution step = resolveSecrets(step).step      // a COPY; only the handlers see it
```

`resolveSecrets` copies internally (via the same `deepMapStrings` walker the scrubber uses), so
resolution and cloning are one walk rather than clone-then-mutate.

- The **execution copy** carries real values into the action handlers (typing, HTTP headers/body,
  shell env, cookie values — wherever the author put the token).
- The **report copy** keeps `$secret.NAME` placeholders verbatim. Reports gain, not lose,
  information: the placeholder tells the reader exactly which credential the step used.
- `httpRequest`'s internal re-resolution ([httpRequest.ts:178](../../src/core/tests/httpRequest.ts))
  moves onto the same helper so it can't diverge.
- The deep clone also fixes a latent aliasing bug for free: today's in-place mutation means a
  retried step re-resolves an already-resolved object.

Resolution is **allowlist-free by field but gated by sink**: `$secret.NAME` may appear in any
string field of an *executing* step, because the execution copy never leaves the action-handler
boundary. The places where a secret token is a **validation-time FAIL** are the fields that exist
to be emitted or compared (next section).

### Disallowed contexts (fail closed)

A `$secret.` token in any of the following fails the step (or resolution) with a clear
description, before any value is fetched:

| context | why it's an oracle |
|---|---|
| match/assertion fields (`find.matchText`, `httpRequest.responseData/responseHeaders` match shapes) | pass/fail over the value = one bit per run; failure descriptions echo the expectation |
| `$$` expression statements ([expressions.ts](../../src/core/expressions.ts)) | comparisons over the value, results stored in `report.expressions` |
| routing conditions (`onFail`/`onPass` selectors, `goToStep` conditions) | control flow becomes a readable function of the value |
| variable assignment (`find` → `setVariables` targets, `loadVariables` values) | laundering: the value re-enters as a plain, unprotected variable |
| step `description` and other display-only fields | emitted verbatim by every reporter |

The guard is a single walk over the step definition (the *unresolved* original, so it is
statically checkable) against a per-action list of emit/compare fields, run inside
`resolveSecrets`. Schema-level enforcement (AJV `not`/`pattern` on every string field) was
considered and rejected: it would bloat every action schema and still couldn't see composed
strings.

## Layer 2 — run-wide mask registry

A run-level `SecretRegistry` records every value the secret resolver hands out
(`registry.add(name, value)` at resolution time). Scrubbing replaces each registered value with
`***secret.NAME***` — naming the secret is safe (the name is already public in the spec) and makes
reports debuggable.

Scrub points, in order of leak likelihood:

1. **Log emission** — `log` in [core/utils.ts:1330](../../src/core/utils.ts) and the CLI logger in
   [src/utils.ts](../../src/utils.ts). One scrub at the emission choke point covers every caller,
   including the debug `RESULT:` dumps and WebDriver/driver error messages that echo typed text.
2. **Report serialization** — `outputResults` ([src/utils.ts:1212](../../src/utils.ts)) scrubs the
   full results object before writing; the HTML reporter consumes the already-scrubbed JSON.
3. **Step `outputs` and the routing accumulator** — `outputs` are scrubbed **before** they are
   stored on the step report *and* before they land in `stepOutputsById`
   ([tests.ts:4774-4776](../../src/core/tests.ts)). This is the enforcement half of decision 2: a
   server that reflects the token back (auth responses commonly do) yields
   `***secret.API_TOKEN***` in `outputs.response.body`, so a routing rule or `$$` expression
   *cannot* observe the real value even indirectly. Routing over the masked literal is possible
   and harmless.
4. **Debug dump** — the existing redaction in [debug/](../../src/debug) additionally consults the
   registry for exact-value scrubs.

Mechanics:

- Exact-string replacement, longest-value-first, over emitted strings. Registered variants:
  the raw value plus its URL-encoded form (secrets ride in URLs and form bodies). Base64 variants
  are deferred — the heuristic layer's shape patterns cover the common encoded carriers.
- **Minimum length 4.** Masking one- and two-character values would shred unrelated output; a
  sub-4-char "secret" gets a resolution-time warning instead.
- The registry lives on the run (alongside the registries created in `runSpecs`,
  [tests.ts:1695-1778](../../src/core/tests.ts)) and is never serialized.

## Layer 3 — heuristic redaction backstop

[debug/redact.ts](../../src/debug/redact.ts) already detects secret-shaped **names**
(TOKEN/SECRET/KEY/PASSWORD/…) and secret-shaped **values** (JWTs, GitHub PATs, AWS key IDs, URL
userinfo) — reviewed patterns, tuned against over-redaction, currently reachable only from the
`debug` subcommand. Layer 3 promotes them to the report boundary:

- `redactObject` runs over the results object inside `outputResults` (after the layer-2 registry
  scrub), catching secrets the author **didn't** declare — the `$PASSWORD` that predates this
  design, the connection string in a `runShell` output, the reflected JWT in an
  `outputs.response`.
- Value-shape scrubbing (`isSecretValue`) applies to log emission at the same choke point as
  layer 2. Name-based redaction is *not* applied to logs — log lines are free text without
  key context, and the name heuristics need a key to judge.
- Heuristics are a backstop, not the mechanism: false negatives are expected (a random password
  matches no shape), and that's what `$secret.` is for. A single config knob,
  `heuristicRedaction` (boolean, default `true`, `config_v3` schema-first per the CLI-flags
  pattern), lets a user whose legitimate output collides with the shapes turn layer 3 off.
  Layers 1–2 are unconditional — declared secrets are always protected.

## What this deliberately does not protect

Named so the docs can say it plainly:

- **Screenshots and recordings.** A secret typed into a visible field is captured as pixels.
  Mitigation is authoring guidance (mask the field via the app under test, or don't record the
  login), not tooling, for now. A `sensitive: true` step option that pauses capture is possible
  future work.
- **`saveCookie` files.** Session cookies written to disk are credentials at rest; out of scope
  here, worth a follow-up warning in that action's docs.
- **The app under test.** If the product prints the credential to its own UI and a `find` matches
  nearby text, the value can appear in element-text captures. Layers 2–3 scrub what they can see.
- **Memory.** Values live in process memory like any string; no zeroization guarantees.

## Phasing

Each phase is independently shippable and lands with its own ADR, fixtures, and docs (behavior
change → ADR + fixtures + docs assessment, per [CLAUDE.md](../../CLAUDE.md)):

- **Phase 1 — syntax + placeholder-preserving resolution. SHIPPED** ([ADR
  01071](../../adrs/01071-inline-secret-references.md)). Token grammar, `ENV_VAR_REGEX` guard,
  execution/report copy split in `runStep`, unset-secret FAIL, disallowed-context guard. The
  registry is created and populated here even though scrubbing lands in phase 2, so the seam
  exists from day one.
- **Phase 2 — registry masking. SHIPPED** ([ADR
  01072](../../adrs/01072-run-wide-secret-mask-registry.md)). Scrub at both log choke points, at the
  `outputs`/routing seam, and over the whole report at the end of `runSpecs`. Two corrections to the
  plan above, found in implementation:
  - The `outputResults` scrub moved **earlier**, to the end of `runSpecs`. Scrubbing in
    `outputResults` would have missed `reportResults`
    ([src/utils.ts](../../src/utils.ts)), which POSTs whole context objects — including step
    `outputs` — to a configured API. That is an off-box egress path the original plan didn't name.
  - `scrubObject` masks object **keys** as well as values, and is cycle-safe.
- **Phase 3 — heuristic backstop. SHIPPED** ([ADR
  01073](../../adrs/01073-value-shape-redaction-backstop.md)). `redactUndeclaredSecrets`
  (value-shape only — see the resolved question above) runs after the registry scrub at the end of
  `runSpecs`, gated on the new `heuristicRedaction` config key (schema-first; no CLI flag, since a
  reporting-hygiene default isn't something you flip per-invocation). Deviation from the plan: the
  key is config-only, and the log-emission half was dropped — the two log choke points already scrub
  declared secrets, and a value-shape scan on every log line buys little for its cost when the
  report boundary is where pasted/published output actually comes from.

## Testing plan

- **Unit** (mocha, [test/core-core.test.js](../../test/core-core.test.js) and a new
  `test/secrets.test.js`): token matcher (substring, multiple refs, `$KEY$` non-collision,
  `$secret` prefix never eaten by `ENV_VAR_REGEX` including the Windows case-insensitive trap);
  registry scrub (longest-first, URL-encoded variant, min-length guard); disallowed-context walk
  (one case per table row above); unset-secret FAIL wording. The FAIL-path permutations live here
  because fixtures must never FAIL.
- **Fixtures** (new `secrets/` group under
  [test/core-artifacts/](../../test/core-artifacts), joined to a fast bundle in
  [.github/workflows/fixtures.yml](../../.github/workflows/fixtures.yml)): a spec that loads a
  known dummy value via `loadVariables: "../env"`, uses `$secret.` in `typeKeys` and an
  `httpRequest` header against the job-local test server (8092/8093), and PASSes. A companion
  mocha assertion then reads the run's report artifact and asserts the dummy value appears
  **nowhere** and the placeholder appears where the step was reported — the precise
  "not emitted" assertion the no-FAIL fixture gate can't express.
- **Cross-platform legs** ride the standard fixture matrix; the Windows leg is the regression
  gate for the case-insensitivity guard.

## Docs impact

Meaningful user-facing surface: new reference syntax, new failure mode, new config key, changed
report contents for opted-in steps. Personas: Wren (authoring credentialed journeys, CUJ W1/W2),
Priya (CI secrets hygiene, CUJ P1/P3), Diego (API tokens in `httpRequest`, CUJ D1). Expected
pages: a new "Secrets" concept/how-to page; updates to the variables reference, `loadVariables`,
`httpRequest`, and the `config_v3` reference (`heuristicRedaction`, and the existing `origin`
params warning gains "and don't put secrets in URLs at all — URL paths appear in reports even
when masked values don't"). Record the new page in the content-set map per
[docs/content-strategy/](../../docs/content-strategy/).

## Questions resolved during implementation

1. **Masked-literal stability.** ~~Contract or unspecified?~~ **Unspecified** ([ADR
   01072](../../adrs/01072-run-wide-secret-mask-registry.md) decision 2), as leaned. `***secret.NAME***`
   names the secret so a masked report stays debuggable, but specs must not match on it. Documented
   as such on the user-facing page.
2. **`runShell` child processes.** ~~Ship as-is, or withhold secrets from child env?~~ **Ship
   as-is**, as leaned, with the limit documented: masking is exact-match, so a child that hashes,
   splits, or re-encodes a value defeats it. Withholding was rejected as illusory — children inherit
   the run environment wholesale, so any child can read any variable whether or not the step
   referenced it.
3. **Concurrent runners.** **Confirmed shared, no work needed.** Runners are in-process async
   closures over the same registries ([tests.ts](../../src/core/tests.ts) `runJob` /
   `runResourceAware`), not child processes, and both loggers are shared module functions — so a
   module-level registry is shared by construction.

4. **Phase 3 aggressiveness.** ~~Value-shape only, or full name+value behind the flag?~~
   **Value-shape only** ([ADR 01073](../../adrs/01073-value-shape-redaction-backstop.md)), settled by
   measurement rather than the lean. Running `redactObject` over real run output showed the
   name-based half is actively harmful at the report boundary:
   - On the secrets fixture, **every** redaction was name-based and every one destroyed something
     already safe — including the `$secret.SECRET` **placeholder** (layer 1's deliberate output) and
     a `***secret.SECRET***` **mask** (layer 2's own). The value-shape half correctly found nothing.
   - On a report that hasn't adopted `$secret.`, value-shape caught both real credentials (a JWT, a
     `postgres://app:hunter2@…` connection string) and left `Bearer public-demo-token`,
     `apiKey: "demo"`, and `token: "not-a-real-credential"` alone. Name-based caught the same two and
     destroyed all three of those.
   - Decisive: name-based keys off the **field name**, but the commonest undeclared leak has an
     innocuous one — `type: "$PASSWORD"` reports under the key `type`. So it misses the case it would
     be added for while reliably damaging reports that were already fine.

   Name-based redaction stays in the `debug` dump, where the user asked for a pasteable dump and
   over-redaction is the correct trade.
