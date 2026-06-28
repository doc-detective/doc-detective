---
status: accepted
date: 2026-03-11
decision-makers: doc-detective maintainers
---

# fileTypes module and detectTests location tracking

## Context and Problem Statement

File-type detection rules (which extensions map to which markup/inline-statement conventions) and the
`detectTests` scanner had grown organically, with file-type knowledge scattered through the detection
code. As more fileTypes accreted (Markdown, MDX/JSX, AsciiDoc, HTML, DITA) and `step_v3` added
fields, the detection path needed a single home for fileType definitions and needed to track *where*
in a source file each detected test came from. Should fileType definitions be extracted into a
dedicated module, and should `detectTests` carry line/location information?

## Decision Drivers

* FileType definitions should live in one authoritative module, not be spread through detection code.
* Detected tests should know their source line/location for diagnostics and editor tooling.
* Detection logic is shared by `common` and `core`; both must stay consistent.
* The refactor must accommodate the growing `step_v3` field set.

## Considered Options

* **A. Extract a `src/common/src/fileTypes.ts` module and add line/location tracking to `detectTests`** (chosen).
* **B. Keep fileType rules inline in `detectTests`; add location tracking only.**
* **C. Externalize fileType rules to a config/JSON file loaded at runtime.**

## Decision Outcome

Chosen option: **A**, because a dedicated `fileTypes.ts` gives every consumer one place to read and
extend file-type rules, and threading line/location through detection unlocks precise diagnostics and
authoring-tool support.

The contract:

* A new `src/common/src/fileTypes.ts` (318 lines) holds the fileType definitions.
* `detectTests` is refactored to track **line/location** for each detected test, in both `common`
  and `core`.
* A `step_v3` field rides along with the refactor.

### Consequences

* Good: one authoritative module for fileType rules; easier to add/maintain file types.
* Good: detected tests carry source line/location for diagnostics and editor integrations.
* Good: `common` and `core` detection stay consistent against the same module.
* Bad: a sizable refactor touching both packages' detection paths at once.
* Neutral: keeping fileType rules in TS (vs. external config) means adding a file type is a code
  change, which matches how the rest of the contract surface is maintained.

### Confirmation

Shipped in doc-detective `0ff34765` (#197). Confirmed by `src/common/src/fileTypes.ts`, the
line/location fields on `detectTests` output, and the new `step_v3` field.

## Pros and Cons of the Options

### A. Dedicated `fileTypes.ts` + location tracking
* Good: single source of truth; precise locations; cross-package consistency.
* Bad: large two-package refactor.

### B. Inline rules, location only
* Good: smaller change.
* Bad: fileType knowledge stays scattered; harder to extend.

### C. External fileType config file
* Good: editable without a code change.
* Bad: another loader/format to validate; inconsistent with the TS contract surface.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `0ff34765` (#197). Inventory
ref: BACKFILL-INVENTORY.md Seq 210. Related: `00055` (default Markdown fileType + markup map),
`00076` (AsciiDoc/HTML fileTypes), `00126` (DITA fileType), `00144` (browser-safe detectTests).
