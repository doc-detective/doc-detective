---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# Retry a context that FAILs while still on its initial blank document

## Context and Problem Statement

[ADR 01082](01082-retries-mid-session-context-retry.md) added the `retries` policy: a context whose
session dies mid-run is retried on a fresh session, gated by an active liveness probe so a real
assertion failure is never retried away. It closed the dead-session mode and the renderer-crash
mode (`chrome-error:` / `about:neterror`), and left one explicitly uncovered:

> Bad/limit: one alive-but-broken-page sub-case remains uncovered — a page that **blanks at the same
> URL** (session responds, URL unchanged, DOM emptied). It's ambiguous with a genuine "element not on
> a correctly-loaded page" failure, so it is treated as a real FAIL and not retried.

To characterize it, 01082 shipped a debug diagnostic that logs the URL of any live, non-error-page
FAIL that wasn't retried, reasoning that "if the recording flake turns out to be the same-URL-blank
variant the logs will reveal it for a follow-up heuristic."

**The logs revealed something else.** Every observed occurrence of the long-running
`windows-latest` recording `annotate` flake logs the same URL, and it is not the fixture's URL:

```text
(DEBUG) [annotate-all-blur-redaction/windows-chrome] Context FAILed on a live,
non-error-page session (url=data:,); not retried.
```

`data:,` is Chromium's **initial blank document** — where a brand-new session parks until its first
navigation. So the page did not blank at the same URL; the context never navigated at all. The
session is alive, the page is not a crash page, and the browser is sitting exactly where it started
while a `find`/`annotate` target times out after ~20s.

### Evidence

Six occurrences across four independent CI runs, two PRs, and **two different fixture bundles** —
all `data:,`, no other URL ever observed:

| Source | Bundle | Occurrences | URL |
|---|---|---|---|
| PR #680, run 30112535469 | recording (windows) | 1 | `data:,` |
| PR #686, run 30133476495 attempt 1 | recording (windows) | 1 | `data:,` |
| PR #686, run 30133476495 attempt 2 | recording (windows) | 3 | `data:,` |
| PR #686, run 30147552708 | **nav-capture (windows)** | 1 | `data:,` |

Two properties make this a flake rather than a defect in any one fixture:

* **The affected test varies run to run on identical code** — `annotate-all-blur-redaction`,
  `annotate-persists-into-screenshot`, `multi-tab-recording-interplay`, and
  `crop-then-variation-compare`, whose failure surfaces differ ("Element not found within timeout",
  "Couldn't find element to crop") because each step type reports its own lookup failure.
* **It is not confined to one bundle.** It first looked like an `annotate`/recording problem, which
  is how ADR 01082 framed it. The nav-capture occurrence shows it is not: any `windows-chrome`
  context can start on `data:,`, and whichever step first needs the page is the one that reports the
  failure. That is why the fix belongs in the shared liveness probe rather than in a fixture.

Every occurrence is on `windows-chrome` — headed Chrome on `windows-latest`. (PR #675's recording
job failed on the same test and class but predates the diagnostic, so its mode is unverified and it
is not counted above.)

## Decision Drivers

* Close a flake that has been red across multiple PRs and survived three prior mitigation attempts
  (#677 find-guards, #678 mocha retries, #680 session-death retry).
* Preserve 01082's central guarantee: **a genuine failure on a correctly-loaded page must never be
  retried away.**
* Don't widen the retry surface on speculation — only on a signal the logs actually show.
* Keep the "is this page real?" logic in one testable place.

## Considered Options

* **A. Treat the initial blank document (`data:,`) as a broken page, on the primary session only**
  (chosen).
* **B. Extend `BROWSER_ERROR_PAGE` to include `data:,`.**
* **C. Treat any blank-ish URL, including `about:blank`, as broken.**
* **D. Do nothing; keep collecting diagnostics.**

## Decision Outcome

Chosen: **option A**. A new predicate `isPageUnnavigated(driver)` in `src/core/utils.ts` returns
true when a session's URL is Chromium's empty data URL. When the post-FAIL liveness probe finds the
context alive, not on an error page, but unnavigated, it sets the existing `_sessionDied` flag so
`runContextWithRetries` retries the context on a fresh session exactly as it does for a dead one.

```text
session dead                  -> retry   (ADR 01082)
alive, on chrome-error:       -> retry   (ADR 01082)
alive, on data:, (never went) -> retry   (this ADR)
alive, on a real page         -> FAIL, never retried (unchanged)
```

### Why this is safe where the same-URL-blank case was not

01082 declined the blank case because it is *ambiguous*: a blanked page and a correctly-loaded page
missing an element look identical. `data:,` is not ambiguous. A page under test is never legitimately
on it — reaching any fixture URL necessarily navigates away — so the predicate cannot fire on a
correctly-loaded page, and the guarantee that real failures still FAIL is preserved by construction.

Two deliberate narrowings keep it that way:

* **`about:blank` is excluded.** It is a page a test can legitimately navigate to, which is exactly
  why `isPageBroken` already excludes it. Including it (**option C**) would break the guarantee.
  Consequence: Firefox, whose initial page *is* `about:blank`, is not covered. Accepted — the
  observed flake is Chromium-only, and correctness beats symmetry.
* **Only the empty data URL matches**, via `/^data:,?$/`. A `data:` URL carrying content
  (`data:text/html,…`) is a deliberate navigation target and must not match.

### Why the primary session only

`isSessionAlive` and `isPageBroken` probe *every* session the context holds and retry if any is bad.
`isPageUnnavigated` checks only the primary session, because "never navigated" is legitimate for a
secondary surface: a test can open a tab via `goTo newTab` and intentionally leave it on `data:,`.
Applying "any" semantics there would spuriously retry a context whose real assertion failed
elsewhere. The primary session is also the one the diagnostic sampled, so it is exactly where the
evidence comes from.

### Consequences

* Good: closes the observed flake, on the same bounded `retries` budget — no new configuration.
* Good: the logic is a pure, unit-testable predicate alongside its two siblings.
* Neutral: a context that is *deterministically* unnavigable — say, a test whose first step is a
  `find` with no preceding `goTo` — now costs one extra attempt before failing. It still **FAILs**,
  because retries are bounded and the second attempt fails identically; only wall-clock is spent.
* Neutral: Firefox and app/mobile sessions are unaffected (no `data:,`, no URL).
* Bad/limit: the same-URL-blank mode 01082 described **remains uncovered and remains unretried**,
  for the same ambiguity reason. The diagnostic stays in place to catch it if it ever appears.
* Bad/limit: this treats a symptom. Why Chromium occasionally leaves a windows-latest session on its
  initial document is still unknown; retrying recovers the run without explaining the cause.

### Confirmation

* `test/core-utils-coverage.test.js` — `isPageUnnavigated`: true for `data:,` and bare `data:`;
  **false** for `about:blank`, for `data:text/html,…` and `data:,notempty`, for ordinary
  `http`/`https` pages, for a session with no `getUrl`, and when `getUrl` throws. The false cases are
  the guarantee: each is a page where a real failure must still FAIL.
* `test/core-utils-coverage.test.js` — `isPageBroken` gains a case asserting it does **not** claim
  `data:,`, keeping the two predicates disjoint so each retry reason logs its own diagnostic.
* `test/core-utils-coverage.test.js` — `classifyContextRetry`: the retry *decision*, extracted from
  `runContext` so the rules the individual predicates can't express are deterministically testable.
  Covers a dead session anywhere in the context, an error page anywhere, an unnavigated **primary**
  session, the precedence between them, the empty-session case, and — the rule this ADR turns on —
  that a context whose **secondary** session sits on `data:,` while the primary is on a real page
  does **not** retry.
* What is left untested in-process is only the two lines in `runContext` that map a non-null reason
  onto the `_sessionDied` flag and a log line. Everything with a rule in it now has a unit test, and
  the flag's downstream effect is already covered by the `runContextWithRetries` suite in
  `test/browser-fallback.test.js`. A `test/core-artifacts/` fixture is deliberately not used:
  provoking a session that silently fails to navigate is exactly the nondeterminism being fixed, so
  it cannot be scripted.

## Pros and Cons of the Options

### A. `data:,` on the primary session only (chosen)

* Good, unambiguous: preserves the never-retry-a-real-failure guarantee by construction.
* Good, narrow: one URL form, one session, one bounded retry.
* Bad, Chromium-only, and symptomatic rather than causal.

### B. Extend `BROWSER_ERROR_PAGE` to include `data:,`

* Good, smallest possible diff.
* Bad, conflates two different states — a crashed page and a never-navigated one — so both would log
  "on a browser error page", which is false and would mislead the next person reading CI logs.
* Bad, inherits "any session" semantics, reintroducing the secondary-surface false positive.

### C. Any blank-ish URL, including `about:blank`

* Good, would also cover Firefox.
* Bad, breaks the core guarantee: `about:blank` is a legitimate target, so a genuine element-not-found
  there would be retried away. `isPageBroken` already rejected this for the same reason.

### D. Do nothing, keep collecting diagnostics

* Good, zero risk.
* Bad, the diagnostic has already answered the question — six consistent samples across two PRs and
  two fixture bundles, with no competing explanation. The flake stays red and keeps costing re-runs
  and reviewer attention.
