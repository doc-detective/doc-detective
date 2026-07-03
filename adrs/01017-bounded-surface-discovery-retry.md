---
status: accepted
date: 2026-07-02
decision-makers: doc-detective maintainers
---

# Bounded retry for browser surface discovery

## Context and Problem Statement

Phase 3 (ADR 01016) resolves a `surface` window/tab selector with a single, synchronous
attempt: `resolveWindowTarget` calls `syncHandles` once and matches the selector against that
snapshot. If the selector doesn't match — because the handle hasn't been created yet, or its
`title`/`url` hasn't finished loading — the step FAILs immediately, naming the selector.

That single-attempt behavior is a poor fit for the most common multi-tab pattern: a `click` (or
`type`) triggers the *page* to open a tab itself (`target="_blank"`, `window.open()`). Neither
action switches focus there (WebDriver only changes the active window when something explicitly
calls `switchToWindow`), and the new tab is not created synchronously with the click returning —
its handle may not exist yet, and even once it does, its `title`/`url` may still be loading. A
following step addressing it by `title`/`url`/`-1` races the page's own navigation. Today, authors
work around this with a manual `wait` step before the addressing step, guessing a duration.

We want `find`/`click`/`type`/etc. targeting a page-opened tab to work without that manual `wait`,
while keeping the common case — an already-focused or already-registered surface — exactly as fast
as it is today.

## Decision Drivers

* Zero added latency on the common path: an omitted `surface`, the active tab, or an
  already-registered name/index must resolve in one attempt, same as before this change.
* Bounded worst case: a genuinely wrong selector (typo, never-opened tab) must not hang or add
  more than a small, fixed delay before FAILing.
* No schema change: this is an internal resolution-mechanism improvement, not a new authored
  field — `surface` selectors keep their existing shape.
* Applies uniformly wherever selectors are resolved — `switchToSurface` (every browser-targeting
  step) and `resolveCloseTargets` (`closeSurface`) — not bolted onto one call site.
* Test suite must stay fast — the retry must be overridable/fast-forwardable in unit tests, not a
  real multi-second sleep per negative-match test case.

## Considered Options

* **A. Bounded retry loop inside `resolveWindowTarget`, capped at 2000ms, ~150ms between attempts,
  first attempt pays no added latency** (chosen).
* **B. `waitUntil`/timeout field on `surface` itself.** A schema-level opt-in wait, authored per
  step.
* **C. Leave resolution single-attempt; document the manual `wait`-before-addressing pattern more
  prominently.**

## Decision Outcome

Chosen option: **A**. The failure mode this fixes — a page-opened tab not existing yet, or not
having loaded its title/url yet — is not something an author can reliably predict a wait duration
for, so **B** just moves the guessing into the schema instead of removing it, at the cost of a new
authored field. **C** keeps the status quo gap. A small, unconditional, bounded retry removes the
guesswork entirely for the common case and costs nothing when the surface already exists.

Mechanism:

1. **`resolveWindowTarget` becomes a retry loop.** Each iteration re-runs `syncHandles` (picks up
   handles opened since the last attempt) and re-evaluates the window/tab selector — including
   `title`/`url` criteria, which re-read the live page each time, so a tab whose title hasn't
   finished loading yet is retried until it has. Deadline = `Date.now() + maxWaitMs` computed
   once, checked after each failed attempt.
2. **Zero latency on success.** The first iteration never sleeps before attempting. If it matches,
   the function returns immediately — the loop's `sleep()` call only ever runs after a *failed*
   attempt, never before the first one.
3. **Defaults: `maxWaitMs = 2000`, `pollIntervalMs = 150`.** ~13 attempts in the worst case. Both
   are internal constants with an optional `opts` override — production call sites never pass
   `opts` (always the default); tests shrink them to keep negative-match assertions fast, or
   verify the bound is honored with small deterministic values.
4. **Uniform application.** `switchToSurface` (used by every browser-targeting step) and
   `resolveCloseTargets` (used by `closeSurface`) both forward `opts` to `resolveWindowTarget`.
   `resolveCloseTargets`'s window-only-close branch — previously a separate inline lead lookup —
   now delegates to `resolveWindowTarget` (with `tab` omitted, which already resolves to the
   window's lead handle), so it inherits the retry for free instead of duplicating the loop.
5. **Not retried:** `checkPhase3Limits` (engine mismatch, named surface) and `requireDriver`
   (missing driver) are checked once, before the loop — retrying a categorical failure can never
   change its outcome. The degenerate "zero windows exist at all" case (`ref.tab === undefined`,
   no window lead, no current handle, no fallback tab) also returns immediately — it isn't a
   "surface hasn't appeared yet" situation, it's a dead session.

## Consequences

* **Good** — `find`/`click`/`type`/etc. addressing a tab the page just opened work without an
  author-inserted `wait`, as long as the tab appears within 2 seconds (the common case).
* **Good** — no schema change; every existing spec's behavior is unchanged when its selector
  already matches on the first attempt (the overwhelming majority of steps: omitted `surface`,
  the active tab, or a name/index registered earlier in the same test).
* **Trade-off** — a **wrong** selector (typo, a tab that will never exist) now takes up to 2
  seconds to FAIL instead of failing instantly. Bounded and predictable, but a real cost for
  fast-failing negative tests; mitigated by keeping the bound small (2s) and by every affected
  step already carrying its own `timeout` for other reasons.
* **Trade-off** — `closeSurface` on a target that never existed (the idempotent no-op path) also
  now takes up to 2 seconds before resolving as absent, instead of instantly. Accepted as the same
  trade-off as above — the alternative (retry only on the "act" paths, not "close") would be an
  inconsistent mental model for authors.
* **Neutral** — the bound is a hardcoded internal constant, not a schema field. Making it
  author-configurable is a possible additive follow-up if 2s proves wrong for some workloads, but
  is deliberately out of scope here (Decision Driver: no schema change).

## Confirmation

* Unit (`test/browserSurface.test.js`): a tab that appears only after N `getWindowHandles` calls
  resolves within the bounded window; a selector that never matches returns the not-found message
  after the full bound elapses (using small `opts.maxWaitMs`/`pollIntervalMs` to keep the test
  fast); a selector that matches on the first attempt resolves without the retry loop sleeping
  (verified via call-count, not wall-clock, to avoid timing flakiness). Existing negative-match
  tests pass `opts: { maxWaitMs: 0 }` to preserve their original instant-fail assertions.
* One step-level test (`test/goTo-openers.test.js`, `closeSurface` re-close idempotency) uses
  `sinon` fake timers to fast-forward the retry loop's `setTimeout`-based sleep, rather than
  threading `opts` through the step-level orchestrator — consistent with the existing pattern in
  `test/recording-screenshot-coverage.test.js`'s download-timeout test.
* End-to-end: `test/core-artifacts/multi-tab.spec.json`'s page-opened-tab tests drop their manual
  `wait` step and address the new tab immediately after the triggering `click`.
