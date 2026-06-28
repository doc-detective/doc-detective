---
status: accepted
date: 2024-01-31
decision-makers: doc-detective maintainers
---

# Add Microsoft Edge engine and restrict recording to Chrome only

## Context and Problem Statement

With Safari added (`00072`), the engine set still lacked Microsoft Edge, a Chromium-family browser
many enterprise docs target. At the same time, the FFmpeg desktop-capture recording path (`00069`)
behaved reliably only on Chrome — recording against Chromium and Edge produced inconsistent
viewport-crop results. Chromedriver was also being tracked as a separate "app", duplicating bookkeeping
with the Chrome/Edge entries. Which browsers do we support for driving, and which do we support for
recording?

## Decision Drivers

* Edge is a common documentation target and is Chromium-based, so the driver cost is low.
* Recording reliability matters more than recording breadth — a flaky recording is worse than none.
* Driver bookkeeping should be simpler (fold chromedriver into the browser app it serves).

## Considered Options

* **A. Add Edge as an engine, fold chromedriver into the chrome/edge app as `driver`, and gate
  recording to `chrome` only (drop chromium/edge from the recording set)** (chosen).
* **B. Add Edge and allow recording on every Chromium browser.**
* **C. Don't add Edge.**

## Decision Outcome

Chosen option: **A** (`core`, commit `61b50800`):

1. **Microsoft Edge** is added as a browser engine.
2. **Chromedriver** is no longer a standalone tracked app — it is folded into the chrome/edge app as
   its `driver`.
3. **Recording is restricted to `chrome`**: chromium and edge are dropped from the
   recording-capable set. Recording against a non-Chrome browser resolves to SKIPPED rather than
   producing an unreliable capture.

## Pros and Cons of the Options

### A. Edge engine + chrome-only recording (chosen)
* Good: Edge driving supported; recording stays reliable; simpler driver bookkeeping.
* Bad: Edge/Chromium recordings are not available (must SKIP).

### B. Edge + record everywhere
* Good: maximal recording coverage on paper.
* Bad: flaky viewport-crop captures on non-Chrome; support burden.

### C. No Edge
* Good: nothing to build.
* Bad: a major enterprise browser remains undriveable.

### Consequences

* Good: Edge is driveable; recording stays trustworthy.
* Good: chromedriver tracked under the browser it serves — less duplicate state.
* Bad: users wanting Edge recordings are out of luck and land on SKIPPED.
* Neutral: the chrome-only recording gate is later carried into the v3 record engine.

### Confirmation

Edge engine, chromedriver folding, and the chrome-only recording gate in `doc-detective-core`
`61b50800`.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `61b50800`. Inventory
ref: BACKFILL-INVENTORY.md Seq 106. Related: `00069` (FFmpeg recording engine), `00072` (Safari +
detection rewrite), `00079` (browser fallback order), `00103` (drop Edge caps at 3.0.0).
