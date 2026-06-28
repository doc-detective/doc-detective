---
status: accepted
date: 2022-08-25
decision-makers: doc-detective maintainers
---

# Flatten gif options to top-level fields

## Context and Problem Statement

Recording actions configured GIF output through a nested `gifOptions` object carrying `fps` and
`width`. The nesting added a level of indirection for two scalar settings and was inconsistent with
how other recording parameters sat directly on the action. Should GIF output settings remain a
nested object, or be flattened onto the action as top-level fields — and is breaking the existing
shape worth it?

## Decision Drivers

* Two scalar settings did not justify a nested object wrapper.
* Flat fields read more naturally in authored test specs.
* Consistency with other action-level recording parameters.
* The schema (`testDefinition.json`) is the authored contract, so the change is observable and breaking.

## Considered Options

* **A. BREAKING: flatten `gifOptions.{fps,width}` to top-level `gifFps`/`gifWidth`** (chosen).
* **B. Keep the nested `gifOptions` object.**
* **C. Accept both shapes indefinitely with a fallback.**

## Decision Outcome

Chosen option: **A**, accepting a breaking change because the flat shape was clearly simpler and the
project was early enough to absorb it. `gifOptions.fps` and `gifOptions.width` were removed in favor
of top-level `gifFps` and `gifWidth` action fields; the recording start path was updated to read
`action.gifFps` / `action.gifWidth`, and `testDefinition.json` was updated to match.

This flatten was itself later subsumed when recording options were redesigned (see `00018`,
`00071`), but it set the precedent of preferring flat scalar action fields over nested option
objects.

### Consequences

* Good: simpler, flatter authored shape for GIF recording.
* Good: consistent with other top-level recording action fields.
* Bad: breaking change — existing specs using `gifOptions` must migrate.
* Neutral: establishes a flatten-over-nest preference for scalar action settings.

### Confirmation

Shipped in commit `eac84c1`; `startRecording` reads `action.gifFps`/`action.gifWidth` and
`testDefinition.json` reflects the flattened fields.

## Pros and Cons of the Options

### A. Flatten to `gifFps`/`gifWidth`
* Good: simpler, consistent.
* Bad: breaks existing `gifOptions` specs.

### B. Keep nested `gifOptions`
* Good: no migration.
* Bad: unnecessary nesting for two scalars.

### C. Accept both with fallback
* Good: non-breaking.
* Bad: carries dead shape forever; ambiguous precedence.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `eac84c1`. Inventory ref:
BACKFILL-INVENTORY.md Seq 29. Related: `00018`, `00071` (later recording-options redesigns).
