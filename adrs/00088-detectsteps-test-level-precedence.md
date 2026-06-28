---
status: accepted
date: 2024-08-09
decision-makers: doc-detective maintainers
---

# Test-level `detectSteps` overrides config, and default recording extension `.mp4`

## Context and Problem Statement

`detectSteps` controls whether the runner auto-generates steps from markup. It can be set at the
config level, but an individual test sometimes needs to opt out of detection regardless of the
global setting. Without test-level precedence, a single test cannot suppress detection in a suite
that otherwise enables it. Separately, when a recording step's path is unset, the default output
container needs to be a widely playable format. How should `detectSteps` precedence and the default
recording container be decided?

## Decision Drivers

* A single test must be able to disable step detection even when config enables it.
* Detection that clones actions across matches must not corrupt state via shared references.
* The default recording container should be broadly playable across platforms/players.
* Defaults should be predictable when the author leaves the path unset.

## Considered Options

* **A. Test-level `detectSteps` overrides config-level (test `false` always skips), deep-clone the
  action per match, and default the recording extension to `.mp4`** (chosen).
* **B. Config-level `detectSteps` wins; tests cannot override.**
* **C. Keep `.webm` as the default recording container.**

## Decision Outcome

Chosen option: **A**, because the most specific scope (the test) should win, and `.mp4` is the most
portable default container. Test-level `detectSteps` was made to override config-level — a test
setting `false` always skips detection — and each matched action is deep-cloned to prevent
shared-reference corruption (core `e8063e5`, `f790038`, Seq 130). In the same decision window, the
default step-recording filename extension changed from `.webm` to `.mp4` when the path is unset,
changing the output container (core `e1fd1d97`, Seq 128).

### Consequences

* Good: a test can authoritatively disable detection regardless of config.
* Good: per-match deep-clone removes a class of shared-reference corruption bugs.
* Good: `.mp4` is broadly playable, a safer default than `.webm`.
* Neutral: the override is one-directional in spirit — test `false` is decisive.
* Bad: changing the default container is observable for anyone relying on `.webm` output.

### Confirmation

Shipped across doc-detective-core commits `e8063e5`, `f790038` (detectSteps precedence + deep-clone)
and `e1fd1d97` (default `.mp4`). Confirmed by the precedence check honoring test-level `false` and
the default-extension change in the recording handler.

## Pros and Cons of the Options

### A. Test override + deep-clone + `.mp4` default
* Good: specific-scope precedence; clone safety; portable default.
* Bad: default-container change is observable.

### B. Config wins
* Good: one source of truth.
* Bad: no per-test escape hatch.

### C. Keep `.webm`
* Good: no container change.
* Bad: less universally playable default.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `e8063e5`, `f790038`
(Seq 130) and `e1fd1d97` (Seq 128). Inventory ref: BACKFILL-INVENTORY.md Seq 130, 128. Related:
`00063` (detectSteps boolean), `00076` (detectSteps opt-in), `00018` (recording formats),
later `00137` (respect explicit `false` for detectSteps/recursive).
