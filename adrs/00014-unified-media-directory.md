---
status: accepted
date: 2022-05-14
decision-makers: doc-detective maintainers
---

# Unified media directory

## Context and Problem Statement

The runner produced two kinds of media artifacts — screenshots (images) and recordings (videos) — and
configured their output locations through two separate fields, surfaced as the `--imageDir` and
`--videoDir` CLI flags. Maintaining parallel directories and flags for what users think of as "where
my generated media goes" added friction with no real benefit. Should image and video output share a
single configured directory?

## Decision Drivers

* Users conceptually have one "media output" location, not two.
* Two parallel flags/fields double the surface area and the chance of mismatch.
* A single field simplifies path resolution downstream.

## Considered Options

* **A. Merge image and video dirs into one `mediaDirectory`** (chosen).
* **B. Keep separate image/video directories.**

## Decision Outcome

Chosen option: **A**. The separate image and video directory fields are merged into a single
`mediaDirectory` config field, and the `--imageDir`/`--videoDir` CLI flags collapse into one
`--mediaDir` flag. All screenshot and recording artifacts now resolve under `mediaDirectory`. This
unified directory remains the basis for later media/download-directory derivation work (Seq 101).

### Consequences

* Good: one mental model and one flag for all generated media.
* Good: simpler downstream path resolution.
* Neutral: separating image vs. video output again later would require re-introducing distinct fields.

### Confirmation

Shipped 2022-05-14 (`5842757`, `d732600`): `testDefinition.json` and `utils.js` replace the dual
directories with `mediaDirectory` and the `--mediaDir` flag.

## Pros and Cons of the Options

### A. Single mediaDirectory
* Good: matches user mental model; halves the flag/field surface.
* Bad: loses the ability to split images and videos without re-adding fields.

### B. Separate image/video dirs
* Good: independent placement of stills vs. recordings.
* Bad: redundant configuration; easy to misconfigure one and not the other.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 5842757, d732600. Inventory
ref: BACKFILL-INVENTORY.md Seq 18. Related: ADR 00070 (media and download directory derivation).
