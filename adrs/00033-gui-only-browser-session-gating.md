---
status: accepted
date: 2022-10-07
decision-makers: doc-detective maintainers
---

# Create a browser page only for GUI tests via a browserActions allowlist

## Context and Problem Statement

Not every test needs a browser: a spec made only of `httpRequest`, `runShell`, or `checkLink`
steps has no UI interaction, yet the runner unconditionally launched a browser page per test. That
wasted time and resources and could fail on headless/CI environments where no display is available
for purely non-GUI work. When does a test actually require a browser page, and how should
display-coupled steps behave when no recording is active?

## Decision Drivers

* Don't pay the cost of a browser when no step needs one.
* A non-GUI test must succeed on environments with no display.
* Keep the decision declarative and easy to extend as new GUI steps are added.
* Display-only steps (mouse move, scroll) are meaningless without a recording — they should not
  fail a test.

## Considered Options

* **A. `browserActions` allowlist gates page creation; non-GUI display steps PASS-skip** (chosen).
* **B. Always create a browser page (status quo).**
* **C. Infer the need heuristically per step at runtime with no explicit list.**

## Decision Outcome

Chosen option: **A**, because an explicit allowlist makes "does this test need a browser?" a single
readable check and lets display-only steps degrade gracefully.

Behavior decided: the runner holds a `browserActions[]` allowlist; a browser page is created only
when a test contains at least one action in that list. `moveMouse` and `scroll` early-return PASS
(skip) when no recording is active, since cursor motion has no observable effect outside a
recording.

### Consequences

* Good: faster, lighter runs for API/shell/link-only specs; those specs run where no display exists.
* Good: the allowlist is the single source of truth for "is this GUI?".
* Neutral: `moveMouse`/`scroll` becoming no-ops without a recording is the conceptual ancestor of
  later record-gating of cursor steps.
* Bad: every new GUI step type must be added to the allowlist or it won't trigger a page.

### Confirmation

Shipped behavior in `tests.js` (`browserActions[]` gate; `moveMouse`/`scroll` early-return PASS).

## Pros and Cons of the Options

### A. browserActions allowlist
* Good: explicit, readable, extensible; graceful display-step degradation.
* Bad: requires maintaining the list as steps are added.

### B. Always create a page
* Good: trivial.
* Bad: wasteful; breaks on display-less environments.

### C. Per-step heuristic
* Good: no list to maintain.
* Bad: implicit and harder to reason about; easy to get wrong.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `d7d33fb6`, `f3e35adb`.
Inventory ref: BACKFILL-INVENTORY.md Seq 45. Related: per-test driver gating (`00062`) and
incognito context (`00037`).
