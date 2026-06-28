---
status: accepted
date: 2026-06-13
decision-makers: doc-detective maintainers
---

# Debug subcommand diagnostic dump

## Context and Problem Statement

Diagnosing install/runtime problems (missing browsers, Appium failures, cache/network issues) over
an issue tracker required users to manually gather scattered facts. The earlier in-schema `debug`
config field (boolean / `stepThrough`) addressed step-through debugging, not environment diagnostics,
and a raw config/version dump risked leaking secrets. How should Doc Detective produce a complete,
shareable, redacted diagnostic bundle on demand?

## Decision Drivers

* Support needs one command that captures the full environment state for a bug report.
* The dump must be redacted so users can share it without leaking tokens/secrets.
* It should cover the areas that actually break: cache, install, network, Appium, provenance.
* It must be invokable both as a subcommand and via an env switch for non-interactive contexts.
* The diagnostic surface should not be conflated with the step-through `debug` config field.

## Considered Options

* **A. A `doc-detective debug` subcommand (and `DOC_DETECTIVE_DEBUG=true`) that writes a redacted diagnostic dump, and deprecate the schema `debug` field** (chosen).
* **B. Extend the existing `debug` config field to emit diagnostics.**
* **C. Document a manual checklist of commands for users to run.**

## Decision Outcome

Chosen option: **A**, because environment diagnostics are a distinct concern from step-through
debugging and deserve their own command with deliberate redaction. The `doc-detective debug`
subcommand (also triggered by `DOC_DETECTIVE_DEBUG=true`) writes a redacted diagnostic dump to
`.doc-detective/debug-<ts>.{txt,json}` with cache, install, network, Appium, and provenance sections;
the schema `debug` field is deprecated (commits `e4171311`, PR #336; `5a9344c5`, PR #347).

### Consequences

* Good: one command yields a complete, shareable diagnostic bundle.
* Good: redaction lets users paste the dump into issues without leaking secrets.
* Good: both a subcommand and an env switch (works in non-interactive contexts).
* Neutral: the older schema `debug` (stepThrough/breakpoint) field is deprecated, not removed.
* Bad: a second "debug" concept exists transiently until the deprecated field is retired.

### Confirmation

The `debug` subcommand / `DOC_DETECTIVE_DEBUG=true` writes redacted `.doc-detective/debug-<ts>.{txt,json}`
with the named sections; schema `debug` marked deprecated. Shipped in `e4171311` (PR #336),
`5a9344c5` (PR #347).

## Pros and Cons of the Options

### A. `debug` subcommand + env, deprecate schema field
* Good: purpose-built, redacted, env-invokable; separates diagnostics from step-through.
* Bad: two "debug" notions coexist during the deprecation window.

### B. Extend the `debug` config field
* Good: no new surface.
* Bad: overloads a step-through field with environment diagnostics; awkward redaction story.

### C. Manual checklist
* Good: nothing to build.
* Bad: inconsistent, error-prone reports; users may paste unredacted secrets.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `e4171311` (PR #336),
`5a9344c5` (PR #347). Inventory ref: BACKFILL-INVENTORY.md Seq 240. Related: `00121` (`debug`
stepThrough + breakpoint), `00122` (debug-only version/config dump), `00165` (post-run hint system).
