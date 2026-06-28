---
status: accepted
date: 2025-06-09
decision-makers: doc-detective maintainers
---

# unsafe step flag and the allowUnsafeSteps gate, relocated to step level

## Context and Problem Statement

Some Doc Detective steps execute arbitrary local commands or code (`runShell`, `runCode`) and are
inherently dangerous to run on documentation pulled from untrusted sources. There needed to be an
explicit, opt-in gate so such steps run only when the operator has consented. An early form of the
gate sat at the fileType level (`allowUnsafeMarkup`), which was too coarse: it could not express
"this one step is dangerous" and forced all-or-nothing trust per fileType. The question: where
should the `unsafe` marker and its `allow*` gate live, and how should detection and the runner
honor it?

## Decision Drivers

* Dangerous steps must be opt-in, never silently executed.
* The gate must be expressible at the granularity of a single step, not a whole fileType.
* Containers (a trusted, isolated environment) should be allowed to run unsafe steps.
* Detection (resolver) and execution (runner) must agree on what's unsafe.

## Considered Options

* **A. An `unsafe` step flag plus a step-level `allowUnsafeSteps` config gate, with resolver propagation and runner enforcement** (chosen).
* **B. Keep the gate at the fileType level (`allowUnsafeMarkup`).**
* **C. No gate — rely on the operator to vet sources.**

## Decision Outcome

Chosen option: **A**. The gate moved down the hierarchy across this work
(`allowUnsafeMarkup` → `allowUnsafeTests` → **`allowUnsafeSteps`**), landing at the **step** level:

* **Schema (common).** An `unsafe` flag and the `allowUnsafe*` config gate, relocated
  fileType → test → step level. Commits `071ca133`, `a975ee0f`, `7893cc7d`, `ea0fff3f`, `4ab0a642`.
* **Resolver.** `isUnsafe` computation and propagation through detection. Commits `f342eb3c`,
  `17e3a095`, `9d686f04`, `05929b7f`.
* **Runner (core).** Skips unsafe steps unless `allowUnsafeSteps` is set or running in a container.
  Commits `82389005`, `899c24c`, `0a6a624`.
* The wrapper exposes `--allow-unsafe` → config (2025-06-15/18, `7da1ac9a`, `a5ecc9be`).

Net contract: a step may be marked `unsafe`; it is skipped at runtime unless `allowUnsafeSteps` is
enabled (or in-container).

### Consequences

* Good: dangerous steps are opt-in at step granularity.
* Good: containers (trusted, isolated) run unsafe steps without extra flags.
* Good: resolver and runner share one notion of "unsafe."
* Bad: the gate relocated twice (fileType → test → step), so older docs/configs reference earlier names.
* Neutral: this safety gate intentionally wins even over "cleanup runs no matter what" (see `01000`).

### Confirmation

Shipped in common `071ca133`, `a975ee0f`, `7893cc7d`, `ea0fff3f`, `4ab0a642`; resolver `f342eb3c`,
`17e3a095`, `9d686f04`, `05929b7f`; core `82389005`, `899c24c`, `0a6a624`; wrapper `7da1ac9a`,
`a5ecc9be`. Confirmed by the `unsafe`/`allowUnsafeSteps` schema fields and runner skip behavior.

## Pros and Cons of the Options

### A. Step-level unsafe flag + allowUnsafeSteps
* Good: per-step granularity; container-aware; shared resolver/runner semantics.
* Bad: multi-stage rename trail.

### B. fileType-level allowUnsafeMarkup
* Good: simple; one place.
* Bad: all-or-nothing per fileType; can't mark a single step.

### C. No gate
* Good: zero machinery.
* Bad: arbitrary code runs from untrusted docs by default.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `071ca133`, `a975ee0f`, `7893cc7d`,
`ea0fff3f`, `4ab0a642`; resolver `f342eb3c`, `17e3a095`, `9d686f04`, `05929b7f`; core `82389005`,
`899c24c`, `0a6a624`; wrapper `7da1ac9a`, `a5ecc9be`. Inventory ref: BACKFILL-INVENTORY.md Seq 175.
Related: `01000` (safety gate wins over hard-routed cleanup), `00019` (runShell), `00095` (runCode).
