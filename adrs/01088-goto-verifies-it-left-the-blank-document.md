---
status: accepted
date: 2026-07-28
decision-makers: hawkeyexl
---

# `goTo` verifies the browser actually left its initial blank document

## Context and Problem Statement

`sessions/start-surface-parallel` (`start-surface-parallel-mixed`) failed
intermittently on `fixtures/proc-sessions (windows-latest)`, tracked in
[#696](https://github.com/doc-detective/doc-detective/issues/696). The reported
failure was always the same and always misleading:

```text
find { "elementText": "PAGE par1", "surface": { "browser": "chrome", "name": "par-chrome" } }
  → FAIL "Element not found within timeout"
```

Two false trails were followed and discarded before the real one:

1. **A cold-session timing flake.** Disproved: raising the find to 30s made it
   consume the full 30 029ms and still find nothing. The element was never
   arriving late; it was never there.
2. **A routing/activation bug** — the surface-less `goTo` navigating a different
   session than the `find` was scoped to. Disproved twice: first by a code audit
   of the whole active-surface layer, then conclusively by reordering the
   fixture so the "default firefox session is untouched" assertion runs *before*
   the failing find. On the next occurrence that assertion **passed**, proving
   the `goTo` did reach `par-chrome`.

That left one possibility: the `goTo` reached the right session, reported
success, and the page was still not there.

[ADR 01084](01084-retry-unnavigated-context.md) had already characterized
exactly this mode. A fresh Chromium session on `windows-latest` occasionally
stays parked on `data:,` — Chromium's initial blank document. The session is
alive, it is not a crash page, it simply never navigated. `driver.url()`
resolves, and every one of `goTo`'s wait conditions (document ready, network
idle, DOM stable) passes trivially against that blank page, so `goTo` reports
*"Opened URL and all wait conditions met."*

**Why 01084's remedy did not cover this.** It retries the context when the
post-FAIL liveness probe finds the session unnavigated — but deliberately
"checks only the primary session, because 'never navigated' is legitimate for a
secondary surface: a test can open a tab via `goTo newTab` and intentionally
leave it on `data:,`." In this fixture the primary session is the default
firefox one, which is healthy; `par-chrome` is a **secondary** session opened by
`startSurface`, so the probe never looks at it and the retry never fires.

The result is a failure that is maximally expensive to diagnose: the step that
went wrong reports success, and the error surfaces on a later, unrelated-looking
step. That cost this investigation two wrong diagnoses.

## Decision Drivers

* A step that did not do its job must not report success.
* Attribute the failure to the navigation that failed, not to whatever step next
  needs the page.
* Preserve 01084's guarantee that a legitimately-blank secondary surface is not
  disturbed.
* Don't add round-trips to healthy navigations.

## Considered Options

* **A. `goTo` checks, after its waits, that the session left `data:,`; re-issue
  once, then FAIL** (chosen).
* **B. Extend 01084's liveness probe from the primary session to all sessions.**
* **C. Compare the post-navigation URL to the requested URL.**
* **D. Nothing in product code; keep hardening the fixture.**

## Decision Outcome

Chosen: **option A**. `goTo` calls the existing `isPageUnnavigated(driver)`
predicate immediately after `driver.url()` — **before** the wait conditions run —
and re-issues the navigation once if the session is still on the empty data URL.
After the waits, a final check FAILs the step with a message naming what
happened if it never moved.

The ordering is load-bearing. Retrying *after* the waits would leave `goTo`
reporting *"all wait conditions met"* for conditions that were only ever
evaluated against the blank document, which is the same report-success-without-
verifying defect this ADR exists to remove. Re-navigating first means the
readiness gate always runs against the page the step actually asked for.

Re-issuing is safe here for the same reason 01084's predicate is safe, and the
reason is stronger in this position: this code runs only after an **explicit
navigation to a real URL**, and a page that navigated anywhere is never on
`data:,`. The ambiguity that forced 01084 to restrict itself to the primary
session does not exist once a `goTo` has run — an intentionally-blank tab is one
nobody navigated.

`about:blank` is excluded, inheriting 01084's deliberate narrowing: it is a URL
a test may navigate to on purpose. Only `/^data:,?$/` matches.

### Consequences

* Good, because the failing step is now the one that actually failed, with a
  message stating the browser never left its blank document.
* Good, because it covers **secondary** sessions, closing the gap 01084 left.
* Good, because the retry heals the transient case rather than only reporting
  it: the observed mode is a one-off, and the second navigation takes.
* Good, because healthy navigations are unaffected — one extra `getUrl()` call,
  no extra navigation. Covered by a regression test.
* Neutral, because a genuinely unnavigable target now costs one extra navigation
  attempt before failing. It still FAILs.
* Bad/limit, because this treats the symptom. Why Chromium occasionally leaves a
  `windows-latest` session on its initial document is still unknown, exactly as
  01084 noted. This makes the symptom loud, attributable, and usually
  self-healing; it does not explain the browser's behavior.
* Bad/limit, because Firefox — whose initial page is `about:blank` — remains
  uncovered, inheriting 01084's trade-off. Correctness beats symmetry.

### Confirmation

Four hermetic tests in [`test/goTo-unnavigated.test.js`](../test/goTo-unnavigated.test.js),
written red→green:

* A session that stays on `data:,` makes `goTo` **FAIL** (it previously returned
  PASS — the defect this ADR exists for).
* A session that leaves `data:,` after a re-issued navigation **PASSes**, and the
  navigation is issued exactly twice.
* The re-navigation happens **before** any wait: the recorded call order starts
  `nav, nav` and every wait follows the final navigation. Verified red by moving
  the retry back after the waits.
* A normal navigation PASSes with exactly **one** navigation — the guard against
  taxing the healthy path.
* `about:blank` is untouched.

The end-to-end confirmation is [#696](https://github.com/doc-detective/doc-detective/issues/696)'s
fixture: if the mode recurs, the run now fails (or self-heals) at the `goTo`
rather than at a later `find`.

## Pros and Cons of the Options

### A. Check and re-issue in `goTo`

* Good, because the check sits exactly where the information is: immediately
  after an explicit navigation, where `data:,` is unambiguous.
* Good, because it needs no new configuration and no change to retry semantics.
* Bad, because it adds a `getUrl()` round-trip to every `goTo`.

### B. Extend the liveness probe to all sessions

* Good, because it would reuse the existing context-retry machinery.
* Bad, because 01084 rejected this for a real reason: a secondary surface may sit
  on `data:,` legitimately, so "any session unnavigated" would spuriously retry
  contexts whose real assertion failed elsewhere.
* Bad, because it retries the whole context — far more expensive than
  re-issuing one navigation, and it discards unrelated passing work.

### C. Compare post-navigation URL to the requested URL

* Good, because it would catch more failure modes than the blank document.
* Bad, because it is wrong in the common case: redirects, canonicalisation,
  trailing slashes and fragments all make the final URL legitimately differ.
  It would need a fuzzy comparison whose failure modes are worse than the bug.

### D. Fixture-only hardening

* Good, because it touches no product code.
* Bad, because the misreporting is a product defect: every future test that
  navigates a secondary session inherits the same undiagnosable failure. Two
  wrong diagnoses in this one investigation are the evidence.

## Documentation impact

None. No user-facing surface is added, changed, or removed — no step type, action
option, config or CLI flag, engine, output format, or supported platform. The
change converts a silent wrong-success into a `FAIL` with a diagnostic message,
which is the documented contract for a step that could not complete its action.
