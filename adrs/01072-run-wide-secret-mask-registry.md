---
status: accepted
date: 2026-07-16
decision-makers: doc-detective maintainers
---

# Mask resolved secret values run-wide by exact-value registry

## Context and Problem Statement

[ADR 01071](01071-inline-secret-references.md) keeps a declared `$secret.NAME` out of the step report
by resolving into an execution copy the report never sees. That closes the *authored* leak path, but
not the *echoed* one: a resolved value can come back into the run from outside the step definition.

Observed during 01071's implementation — a `runShell` step that referenced a secret failed, and the
shell's own error message carried the credential verbatim into `outputs.stdio.stderr`, the step
report, and the debug log. The same shape recurs across the runner: an auth endpoint reflects the
token in its response body (`outputs.response`, [httpRequest.ts](../src/core/tests/httpRequest.ts)),
a WebDriver error quotes the text it just typed, a process prints its own argv. In each case the step
definition is clean and the report still leaks.

The reach is wider than the report file. `outputs` feed the routing accumulator (`stepOutputsById`,
[tests.ts](../src/core/tests.ts)) and back `$$steps.<id>.outputs.*`, so an echoed secret is not just
*printed* — it becomes *matchable*, reintroducing exactly the oracle 01071 exists to prevent. And
`reportResults` ([src/utils.ts](../src/utils.ts)) POSTs whole context objects to a configured API, so
an echoed secret leaves the machine.

How do we protect a value once it is loose in text we did not author?

## Decision Drivers

* 01071's guarantee must hold against echoed values, not only authored references.
* Routing and expressions must never observe a real secret, however it arrived.
* Every egress path — report file, HTML, logs, the `reportResults` POST — must be covered, ideally
  without auditing each one separately.
* Masking must not shred unrelated output.
* Concurrent runners must share the protection.

## Considered Options

* **A. Exact-value registry, scrubbed at emission choke points** (chosen).
* **B. Scrub only the serialized report at write time.**
* **C. Taint-track secret values through the runner.**

## Decision Outcome

Chosen option: **A**. Resolution is the one moment the runner knows a value is secret, so recording it
there and scrubbing at the few places text leaves the run covers every path a value can take —
including ones we did not anticipate. B misses logs and the `reportResults` POST, and misses routing
entirely (the value would still be matchable even if the file were clean). C is the theoretically
complete answer and is far too invasive for a dynamically-typed step pipeline that spreads, clones,
and re-serializes objects constantly.

Behavior decided:

1. **Registration at resolution.** `resolveSecrets` records each resolved value. The registry is
   module-level: concurrent runners are in-process async closures sharing state, so they share it by
   construction, and over-masking across an embedded library run is harmless.

2. **Mask literal.** A registered value is replaced with `***secret.NAME***`. Naming the secret is
   safe — the name is already public in the spec — and keeps a masked report debuggable. **The
   literal is unspecified and non-contractual**: it may change, and specs must not match on it.

3. **Scrub points.** Log emission (both the core logger and the CLI logger), the step `outputs` seam
   *before* the report spread and *before* `stepOutputsById`, and the whole results object at the end
   of `runSpecs` — the last covering both `outputResults` and the `reportResults` POST.

4. **Routing sees masks, not values.** Scrubbing `outputs` at the seam means a reflected token yields
   `***secret.API_TOKEN***` to routing, `$$steps.*`, and expressions. Routing over the masked literal
   is possible and harmless; routing over the real value is impossible. This is the enforcement half
   of 01071's "never matched."

5. **Minimum length 4.** Shorter values are resolved but never used as mask needles — masking a 1–3
   character value would corrupt unrelated output. The author gets a warning naming the variable.

6. **Registered variants.** The raw value plus its URL-encoded form, since secrets ride in URLs and
   form bodies. Replacement is longest-value-first so an overlapping registration cannot leave a
   fragment behind. Base64 and other encodings are **not** covered — see Consequences.

### Consequences

* Good: one registration point protects every current and future egress path, authored or echoed.
* Good: the oracle stays closed even when the system under test reflects the credential.
* Bad: exact-match masking is defeated by transformation. A child process that hashes, splits, or
  re-encodes a secret and prints the result defeats it, as does any encoding beyond the registered
  variants. Accepted and documented rather than papered over: the layer that catches *shapes* rather
  than *values* is the heuristic backstop (a separate decision), and neither is a substitute for not
  echoing credentials.
* Bad: a secret whose value collides with ordinary output (a short or dictionary-word credential)
  over-masks that output. The 4-char floor bounds the worst of it; the rest is inherent to
  exact-value masking.
* Neutral: masking costs a walk of the results object and a scan per emitted log line. Negligible
  against a run that drives browsers, and it is skipped entirely when nothing is registered.
* Neutral: `runShell` children inherit the run environment, so a secret is reachable by any child
  regardless of whether the step referenced it. Out of scope here.

### Confirmation

Unit tests in `test/secrets.test.js`: longest-first replacement, the URL-encoded variant, the
min-length floor, idempotence, and cycle-safety. An integration test runs a spec whose shell **echoes**
the secret back — the exact leak this ADR exists to close — and asserts the value appears nowhere in
the returned results or the written run-folder JSON while the mask does, and that `outputs` handed to
routing carry the mask rather than the value. PASS-path fixtures land in `test/core-artifacts/secrets/`
(joined to the `web-plumbing` bundle), which must resolve to PASS or SKIPPED.

## Pros and Cons of the Options

### A. Exact-value registry scrubbed at choke points
* Good: covers authored and echoed values; one place to register, few places to scrub.
* Good: closes routing/`$$steps` as a side effect of the same seam.
* Bad: defeated by transformation or unregistered encodings; can over-mask on collision.

### B. Scrub the serialized report only
* Good: single, obvious insertion point.
* Bad: leaves logs, the `reportResults` POST, and routing fully exposed — the report file is the
  narrowest of the egress paths, not the widest.

### C. Taint tracking
* Good: survives transformation; theoretically complete.
* Bad: requires wrapping every string flowing through a dynamically-typed pipeline that spreads and
  re-serializes objects constantly. Enormous surface, high regression risk, poor cost/benefit here.

## More Information

Full three-layer design and the explicit non-goals (screenshots, `saveCookie` files, the app under
test printing its own credential): [docs/design/secrets-management.md](../docs/design/secrets-management.md).
Registration and scrubbing live in `src/core/secrets.ts`; the seams are `runStepOnce` and the end of
`runSpecs` in `src/core/tests.ts`.
