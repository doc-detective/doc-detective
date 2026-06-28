---
status: accepted
date: 2025-06-01
decision-makers: doc-detective maintainers
---

# httpRequest fenced-block markup detector, fileType.extends, and DOC_DETECTIVE env override

## Context and Problem Statement

API documentation routinely embeds HTTP calls as fenced code blocks (method, URL, headers, body),
but Doc Detective's markup detection had no way to turn such a block into an `httpRequest` step.
Separately, authors who wanted to tweak a built-in fileType had to redeclare the whole thing, and
there was no clean way to inject a full config from the environment, and invalid config called
`process.exit` deep inside the resolver — unfriendly to programmatic callers. The question: how
should the resolver detect HTTP requests in fenced blocks, let fileTypes extend built-ins, accept an
environment-supplied config, and surface errors without killing the process?

## Decision Drivers

* API docs express requests as fenced blocks; detection should recognize them.
* Authors should extend a built-in fileType, not copy it wholesale.
* A full config should be injectable from the environment for CI/platform runs.
* The resolver is a library; it must throw, not `process.exit`, and emit structured errors.

## Considered Options

* **A. Add an `httpRequestFormat` fenced-block detector, `fileType.extends`, a `DOC_DETECTIVE` env config override, and structured AJV errors** (chosen).
* **B. Require authors to write explicit inline `httpRequest` steps; no fenced-block detection.**
* **C. Keep `process.exit` on bad config and full fileType redeclaration.**

## Decision Outcome

Chosen option: **A**. Two coordinated change-sets landed:

1. **Resolver.** An `httpRequestFormat` fenced-block markup detector parses method/url/headers/body
   from a code block into an `httpRequest` step; `fileType.extends` merges an author's fileType onto
   a built-in; a `DOC_DETECTIVE` env var carrying JSON config is deep-merged over file config; and
   invalid config switches from `process.exit` to `throw`. Plus core httpRequest input
   standardization. Commits `8d00c5ba`, `124b2076`, `c5170a78`, `8fc84b0c`, `feb741f7`
   (core `dd9e22b`).
2. **Schema (common).** `fileTypes` require `anyOf[extensions, extends]` (a template extension is
   valid), the `extends` `$comment` is removed, `validate()` surfaces structured AJV errors
   (`instancePath`/`message`/`params`), and `readFile` parses by extension. Commits `52435a92`,
   `a82f8ddc`, `9ebcdb54`, `18a62e13`.

### Consequences

* Good: HTTP requests in fenced blocks become `httpRequest` steps automatically.
* Good: `fileType.extends` lets authors customize built-ins without redeclaration.
* Good: full config injectable via `DOC_DETECTIVE`; resolver throws structured errors instead of exiting.
* Bad: more detector surface and merge rules to maintain.
* Neutral: the `DOC_DETECTIVE` env channel is later extended/complemented by `DOC_DETECTIVE_CONFIG`.

### Confirmation

Shipped in resolver commits `8d00c5ba`, `124b2076`, `c5170a78`, `8fc84b0c`, `feb741f7` (core
`dd9e22b`) and common commits `52435a92`, `a82f8ddc`, `9ebcdb54`, `18a62e13`. Confirmed by the
`httpRequestFormat` detector, the `anyOf[extensions, extends]` fileType requirement, and structured
AJV error output.

## Pros and Cons of the Options

### A. Detector + extends + env override + structured errors
* Good: detects HTTP blocks; extensible fileTypes; library-safe errors.
* Bad: more detection/merge surface.

### B. Explicit inline steps only
* Good: nothing new to detect.
* Bad: authors hand-write every request; no docs-as-tests gain.

### C. Keep process.exit + full redeclaration
* Good: no change.
* Bad: kills programmatic callers; verbose, error-prone fileType authoring.

## More Information

Recorded retrospectively (ADR backfill). Origin: resolver commits `8d00c5ba`, `124b2076`,
`c5170a78`, `8fc84b0c`, `feb741f7` (core `dd9e22b`); common commits `52435a92`, `a82f8ddc`,
`9ebcdb54`, `18a62e13`. Inventory ref: BACKFILL-INVENTORY.md Seq 173, 174. Related: `00030`
(httpRequest action), `00118`/`00127` (`DOC_DETECTIVE`/`DOC_DETECTIVE_CONFIG` env config).
