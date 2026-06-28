---
status: accepted
date: 2025-05-13
decision-makers: doc-detective maintainers
---

# resolvedTests_v3 envelope and runner-delegated detection/resolution

## Context and Problem Statement

Once detection/parsing was extracted into `doc-detective-resolver` (`00111`), the runner needed a
stable, validated handoff: a single object carrying the merged `config` plus the fully-resolved
`specs[]` that `runTests` could execute without re-running discovery. There was no schema for that
handoff, and `core` still owned detection helpers (`arazzo.js`, parts of `utils.js`/`sanitize.js`).
The question was what shape the resolved-tests envelope should take, and whether the runner should
keep doing its own detection or delegate it entirely to the resolver.

## Decision Drivers

* The runner needs a single validated input it can trust (no re-detection).
* Resolution-time facts (platform/arch/working directory, config/spec paths) should travel with the data.
* One owner for detection avoids drift between `core` and the resolver.
* Read-only/environment fields must be marked so they aren't user-authored.

## Considered Options

* **A. Add a `resolvedTests_v3` envelope schema and delegate all detection/resolution to the resolver's `detectAndResolveTests`** (chosen).
* **B. Keep an ad-hoc untyped object and leave detection in `core`.**
* **C. Validate the resolved tree but keep dual detection paths.**

## Decision Outcome

Chosen option: **A**. Two coordinated changes landed:

1. **Schema (common).** A `resolvedTests_v3` envelope: `config` + `specs[]` with a `resolvedTestsId`
   uuid; a read-only `environment` block (`platform`/`arch`/`workingDirectory`); `configPath` and
   `specPath` marked `readOnly`; openApi `definition` read-only. Commits `33510c60`, `36721bfe`,
   `c0f5dec5`, `5eae96a9`, `d69fe9d0`, `274364c7`.
2. **Runner (core).** `runTests` delegates detection + resolution to the resolver's
   `detectAndResolveTests`; `runSpecs` now takes `{resolvedTests}`; `core`'s own `arazzo.js`,
   `utils.js`, and `sanitize.js` are deleted; the runner adds `runnerDetails` (environment +
   `availableApps`). Commits `d02fb3d`, `0b5bce4`, `7ec5210`, `f005af9`.

The net contract: the resolver produces a `resolvedTests_v3`-shaped envelope, validated by AJV,
and the runner consumes it as its sole detection input.

### Consequences

* Good: single validated handoff; runner no longer re-detects.
* Good: environment/path provenance travels with the resolved tree (read-only).
* Good: removes duplicated detection code from `core`.
* Bad: tighter version coupling between resolver output and the `resolvedTests_v3` schema.
* Neutral: legacy `core` detection helpers removed; their behavior now lives only in the resolver.

### Confirmation

Schema shipped in common commits `33510c60`, `36721bfe`, `c0f5dec5`, `5eae96a9`, `d69fe9d0`,
`274364c7`; runner delegation in core commits `d02fb3d`, `0b5bce4`, `7ec5210`, `f005af9`. Confirmed
by the `resolvedTests_v3` schema and `runSpecs({resolvedTests})` signature.

## Pros and Cons of the Options

### A. resolvedTests_v3 envelope + full delegation
* Good: one validated input; one detection owner.
* Bad: schema/runner versions must move together.

### B. Untyped object, detection stays in core
* Good: no schema work.
* Bad: no validation; drift between core and resolver.

### C. Validate tree but keep dual detection
* Good: incremental.
* Bad: two code paths to maintain; the drift this aimed to remove.

## More Information

Recorded retrospectively (ADR backfill). Origin: common commits `33510c60`, `36721bfe`,
`c0f5dec5`, `5eae96a9`, `d69fe9d0`, `274364c7`; core commits `d02fb3d`, `0b5bce4`, `7ec5210`,
`f005af9`. Inventory ref: BACKFILL-INVENTORY.md Seq 169, 170. Related: `00111`
(standalone resolver), `00101` (v3 spec/test resolution).
