---
status: accepted
date: 2023-04-15
decision-makers: doc-detective maintainers
---

# Default Markdown fileType with a markup→action map, and config default reshuffle

## Context and Problem Statement

For "docs as tests" to work out of the box, Doc Detective needed to know how to read a documentation
file with zero configuration. Without a built-in default, every user had to author a `fileTypes`
definition before detecting a single test. The natural first target was Markdown. The question was
which file extensions to claim by default, which documentation markup constructs to map to which
actions, what the default step timeout should be, and where the default markup configuration should
live in the config schema.

## Decision Drivers

* Markdown should work with no user configuration.
* Common documentation constructs (onscreen text, images, links) should map to sensible actions.
* Default timeouts must be realistic for real browsers, not artificially short.
* Defaults should sit where they belong in the config structure, not be duplicated across fields.

## Considered Options

* **A. Ship a default Markdown `fileType` (.md/.mdx) with a markup→action map; raise default timeout; move markup defaults onto setup/cleanup `markup` and drop them from other fields** (chosen).
* **B. Require users to author a `fileTypes` definition (no built-in default).**
* **C. Hard-code Markdown handling in the runner instead of expressing it as a `fileType`.**

## Decision Outcome

Chosen option: **A**, because expressing the default as a real `fileType` keeps Markdown handling
inside the same configurable contract users extend, rather than a special-cased code path.
`config.fileTypes` gains a default Markdown definition covering `.md`/`.mdx` with a markup→action map
(onscreen text → `find`, image → `checkLink`, hyperlink → `goTo`/`checkLink`). Default step timeouts
are raised from 500ms to 5000ms to suit real browsers. A later refinement (`b0d33a7`) moves the
default markup onto the setup/cleanup `markup` field and drops the now-redundant defaults from
`input`, `recursive`, and `markupToInclude`, keeping each default in exactly one place.

### Consequences

* Good: Markdown is testable with zero configuration.
* Good: realistic 5000ms default timeout reduces false failures.
* Neutral: the markup→action map encodes opinionated defaults users can still override.
* Bad: the default reshuffle changed where some defaults resolve, a subtle behavior shift for configs relying on the old field-level defaults.

### Confirmation

Shipped in `common` `24999`, `fe9c03b`, `5305fdb`, `56deeeb` (default Markdown fileType + timeout) and
`b0d33a7` (default reshuffle). Confirmed by Markdown files detecting tests with no `fileTypes` config
and the 5000ms default timeout.

## Pros and Cons of the Options

### A. Default Markdown fileType + markup map + reshuffle
* Good: zero-config Markdown; defaults centralized; realistic timeout.
* Bad: moving defaults changed resolution for some pre-existing configs.

### B. Require a user-authored fileType
* Good: no implicit behavior.
* Bad: high friction; nothing works until configured.

### C. Hard-code Markdown in the runner
* Good: simplest initial implementation.
* Bad: not overridable; breaks the configurable-fileType contract.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commits `24999`, `fe9c03b`,
`5305fdb`, `56deeeb`, `b0d33a7`. Inventory ref: BACKFILL-INVENTORY.md Seq 81, 90. Additional default
fileTypes (AsciiDoc/HTML, MDX/JSX) were added later (ADR 00076, 00107).
