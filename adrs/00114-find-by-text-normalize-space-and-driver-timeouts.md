---
status: accepted
date: 2025-05-28
decision-makers: doc-detective maintainers
---

# Whitespace-tolerant find-by-text (XPath normalize-space) and 2-minute driver init timeouts

## Context and Problem Statement

Doc Detective locates elements by their visible text, but rendered HTML routinely pads text with
leading/trailing whitespace, newlines, and collapsed runs of spaces. A literal text-equality XPath
match fails on text that *looks* identical to a reader, producing spurious FAILs that documentation
authors cannot diagnose from the page. Separately, driver/session startup (Appium + WebdriverIO)
was timing out under default WDIO timeouts on slower machines and CI. The question: how should
find-by-text normalize whitespace, and what driver init timeout gives sessions room to start?

## Decision Drivers

* Text matching should reflect what a reader sees, not raw DOM whitespace.
* Authors should not have to hand-normalize the exact whitespace of rendered text.
* Driver/session startup must tolerate slow CI and cold starts.
* Both changes are correctness/robustness fixes, not new public surface.

## Considered Options

* **A. Match text via XPath `normalize-space()` and raise driver init timeouts to 2 minutes** (chosen).
* **B. Trim/collapse text in JS after fetching every candidate element.**
* **C. Leave matching literal and document the whitespace gotcha.**

## Decision Outcome

Chosen option: **A**. Find-by-text was changed to use XPath `normalize-space()`, which collapses
internal whitespace and trims edges so a match reflects the reader-visible text. In the same work
the driver init timeouts (`connectionRetryTimeout` / `waitforTimeout`) were raised to 120000 ms
(2 minutes) so sessions have room to start under load. Commits `aee88c9`, `4f864aa`.

### Consequences

* Good: find-by-text matches reader-visible text; far fewer whitespace-only false failures.
* Good: driver sessions start reliably on slow CI/cold machines.
* Bad: `normalize-space()` cannot match text that intentionally relies on exact internal whitespace.
* Neutral: the 2-minute ceiling is itself later raised (10 minutes) as install/provisioning grows.

### Confirmation

Shipped in core commits `aee88c9` (XPath `normalize-space()`) and `4f864aa`
(`connectionRetryTimeout`/`waitforTimeout` 120000). Confirmed by the XPath expression used in
find-by-text and the WDIO timeout values.

## Pros and Cons of the Options

### A. normalize-space() + 2-min timeouts
* Good: reader-faithful matching; robust startup.
* Bad: can't assert exact internal whitespace.

### B. JS-side trim/collapse
* Good: full control in JS.
* Bad: fetch-all-then-filter is slower; reimplements what XPath already does.

### C. Leave literal, document it
* Good: no code change.
* Bad: pushes a sharp edge onto every author.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `aee88c9`, `4f864aa`. Inventory ref:
BACKFILL-INVENTORY.md Seq 172. Related: `00118` (driver timeouts later raised to 10 minutes),
`00134` (multi-criteria element finding).
