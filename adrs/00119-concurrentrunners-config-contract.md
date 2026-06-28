---
status: accepted
date: 2025-06-20
decision-makers: doc-detective maintainers
---

# concurrentRunners config contract (integer | boolean) and normalization

## Context and Problem Statement

To enable parallel execution of test contexts, the config needed a single knob expressing "how many
runners may execute at once." Operators want two ergonomic forms: an explicit integer count, and a
convenient `true` meaning "use the machine's capacity." But a raw boolean is ambiguous to runtime
code, `false` is a footgun (it reads as "zero runners"), and the runner ultimately needs a concrete
positive integer. The question: what schema should `concurrentRunners` accept, and how is it
normalized into the integer the runner uses? (The runner-side scheduling behavior is decided
separately — this ADR fixes only the config contract.)

## Decision Drivers

* Operators want both an explicit count and a "use available capacity" shorthand.
* `false` must not be a legal value (it would read as zero runners).
* The runner needs a concrete positive integer, not a polymorphic value.
* Auto-capacity must be bounded so it doesn't oversubscribe the host.
* The default must preserve today's behavior (serial).

## Considered Options

* **A. `concurrentRunners` typed `["integer","boolean"]`, default 1, min 1, `not:{const:false}`, with `true` = CPU count capped at 4, normalized to an integer in `setConfig`** (chosen).
* **B. Integer-only (no `true` shorthand).**
* **C. Boolean-only on/off (no explicit count).**

## Decision Outcome

Chosen option: **A**. The contract:

* **Schema (common).** `concurrentRunners` accepts type `["integer","boolean"]`, default `1`,
  minimum `1`, with `not:{const:false}` so `false` is rejected; `true` means CPU count capped at 4.
  Commits `73a6d082`, `f5aadf55`.
* **Normalization (resolver).** `resolveConcurrentRunners` normalizes the value to a concrete
  integer during `setConfig`, so runtime always reads a positive integer. Commit `9251aac5`.

Default `1` keeps the serial path byte-identical. The runner's scheduling/ordering behavior built on
top of this is decided separately (see `01000`).

### Consequences

* Good: ergonomic dual form (explicit count or `true` = capacity), normalized to one integer for runtime.
* Good: `false` is schema-rejected; auto-capacity is capped (≤4) to avoid oversubscription.
* Good: default `1` preserves existing serial behavior.
* Bad: a polymorphic schema needs the normalization step to give the runner a single type.
* Neutral: this fixes only the config contract; concurrency semantics/ordering land in later ADRs.

### Confirmation

Shipped in common commits `73a6d082`, `f5aadf55` (schema) and resolver commit `9251aac5`
(`resolveConcurrentRunners`). Confirmed by the `["integer","boolean"]` / `not:{const:false}` schema
shape and the normalized integer in the merged config.

## Pros and Cons of the Options

### A. integer | boolean, normalized
* Good: dual ergonomic form; `false` rejected; capped auto-capacity; single runtime type.
* Bad: needs a normalization pass.

### B. Integer-only
* Good: unambiguous; no normalization.
* Bad: loses the "use capacity" shorthand.

### C. Boolean-only
* Good: simplest.
* Bad: no explicit count; can't pin the degree of parallelism.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `73a6d082`, `f5aadf55`; resolver
commit `9251aac5`. Inventory ref: BACKFILL-INVENTORY.md Seq 179. Related: `01000` (gate advanced
ordering under `concurrentRunners`), `00172`/Seq 242 (concurrent test runners runtime).
