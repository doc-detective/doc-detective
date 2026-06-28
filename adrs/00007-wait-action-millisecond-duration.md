---
status: accepted
date: 2022-05-04
decision-makers: doc-detective maintainers
---

# `wait` action with millisecond duration semantics

## Context and Problem Statement

Documented procedures sometimes need a deliberate pause (for an animation, a redirect, or a slow load) before the next step runs. The runner needed a `wait` step and a clear unit for its duration. The commits `ae7174a2`, `3063f6a3`, `03cbee27` (2022-05-04) implemented `wait` (alongside enabling `open`/`screenshot`/`recordStart`) and fixed the `duration` unit to **milliseconds** (the `testDefinition` describes it as "In milliseconds"). What should the pause step be, and in what unit is its duration expressed?

## Decision Drivers

* Authors need an explicit, deterministic pause between steps.
* The duration unit must be unambiguous to avoid 1000× mistakes.
* Milliseconds align with the underlying browser/timer APIs.

## Considered Options

* **A `wait` action with a millisecond `duration`** (chosen).
* **A `wait` action measured in seconds.**
* **No explicit wait (rely on implicit waits only).**

## Decision Outcome

Chosen option: **a `wait` action whose `duration` is in milliseconds**, because milliseconds match the underlying timer/browser APIs and remove unit ambiguity, and an explicit step gives authors deterministic control.

Behavior decided:

1. A `wait` step pauses execution for `duration` milliseconds (documented as "In milliseconds" in `testDefinition`).
2. The same change wired up `open`, `screenshot`, and `recordStart` handlers.

### Consequences

* Good: deterministic, unambiguous pauses.
* Good: unit matches the runtime timer APIs.
* Neutral: `wait` later gains a `css` (wait-for-selector) form and its default duration is retuned (1000 → 10000 ms), but the millisecond unit persists.

### Confirmation

Observable in `index.js` `wait` handling and the `ref/testDefinition.json` "In milliseconds" duration description.

## Pros and Cons of the Options

### Millisecond `wait`
* Good: unambiguous; matches APIs.
* Bad: larger numbers to type than seconds (minor).

### Second-based `wait`
* Good: shorter values.
* Bad: mismatched with millisecond APIs; conversion errors.

### No explicit wait
* Good: nothing to implement.
* Bad: no deterministic pause for animations/redirects.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `ae7174a2`, `3063f6a3`, `03cbee27`. Inventory ref: BACKFILL-INVENTORY.md Seq 8. Related: ADR 00006 (action enum / test contracts).
