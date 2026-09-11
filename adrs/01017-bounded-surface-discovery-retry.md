---
status: accepted
date: 2026-07-02
decision-makers: doc-detective maintainers
---

# Bounded retry for browser surface discovery

## Context and Problem Statement

Phase 3 (ADR 01016) resolves a `surface` window or tab selector with a single, synchronous
attempt. `resolveWindowTarget` calls `syncHandles` once, and matches the selector against that
snapshot. If the selector doesn't match, the step FAILs immediately, naming the selector. It might
not match because the handle hasn't been created yet, or its `title` or `url` hasn't finished
loading.

That single-attempt behavior is a poor fit for the most common multi-tab pattern. A `click`, or a
`type`, triggers the *page* to open a tab itself, through `target="_blank"` or `window.open()`.
Neither action switches focus there, since WebDriver only changes the active window when something
explicitly calls `switchToWindow`. And the new tab is not created synchronously with the click
returning. Its handle may not exist yet, and even once it does, its `title` or `url` may still be
loading. A following step addressing it by `title`, `url`, or `-1` races the page's own navigation.
Today, authors work around this with a manual `wait` step before the addressing step, guessing a
duration.

We want `find`, `click`, `type`, and the rest targeting a page-opened tab to work without that
manual `wait`. The common case must stay exactly as fast as it is today. That's an already-focused
or already-registered surface.

## Decision Drivers

* Zero added latency on the common path. An omitted `surface`, the active tab, or an
  already-registered name or index must resolve in one attempt, same as before this change.
* Bounded worst case: a genuinely wrong selector (typo, never-opened tab) must not hang or add
  more than a small, fixed delay before FAILing.
* No schema change. This is an internal resolution-mechanism improvement, not a new authored
  field, and `surface` selectors keep their existing shape.
* It applies uniformly wherever selectors are resolved, rather than being bolted onto one call site.
  That's `switchToSurface`, used by every browser-targeting step, and `resolveCloseTargets`, used by
  `closeSurface`.
* The test suite must stay fast. The retry must be overridable and fast-forwardable in unit tests,
  rather than a real multi-second sleep per negative-match test case.

## Considered Options

* **A. Bounded retry loop inside `resolveWindowTarget`, capped at 2000ms, ~150ms between attempts,
  first attempt pays no added latency** (chosen).
* **B. `waitUntil`/timeout field on `surface` itself.** A schema-level opt-in wait, authored per
  step.
* **C. Leave resolution single-attempt; document the manual `wait`-before-addressing pattern more
  prominently.**

## Decision Outcome

Chosen option: **A**. The failure mode this fixes is a page-opened tab not existing yet, or not
having loaded its title or url yet. An author can't reliably predict a wait duration for that. So
**B** just moves the guessing into the schema instead of removing it, at the cost of a new
authored field. **C** keeps the status quo gap. A small, unconditional, bounded retry removes the
guesswork entirely for the common case, and costs nothing when the surface already exists.

Mechanism:

1. **`resolveWindowTarget` becomes a retry loop.** Each iteration re-runs `syncHandles`, picking up
   handles opened since the last attempt, and re-evaluates the window or tab selector. That
   includes `title` and `url` criteria, which re-read the live page each time. So a tab whose title
   hasn't finished loading yet is retried until it has. The deadline is `Date.now() + maxWaitMs`,
   computed once and checked after each failed attempt.
2. **Zero latency on success.** The first iteration never sleeps before attempting. If it matches,
   the function returns immediately. The loop's `sleep()` call only ever runs after a *failed*
   attempt, never before the first one.
3. **Defaults: `maxWaitMs = 2000`, `pollIntervalMs = 150`.** That's ~13 attempts in the worst case.
   Both are internal constants with an optional `opts` override. Production call sites never pass
   `opts`, so they always take the default. Tests shrink them to keep negative-match assertions
   fast, or verify the bound is honored with small deterministic values.
4. **Uniform application.** `switchToSurface`, used by every browser-targeting step, and
   `resolveCloseTargets`, used by `closeSurface`, both forward `opts` to `resolveWindowTarget`.
   `resolveCloseTargets`'s window-only-close branch was previously a separate inline lead lookup. It
   now delegates to `resolveWindowTarget`, with `tab` omitted, which already resolves to the
   window's lead handle. So it inherits the retry for free, instead of duplicating the loop.
5. **Not retried.** `checkPhase3Limits`, for an engine mismatch or a named surface, and
   `requireDriver`, for a missing driver, are checked once, before the loop. Retrying a categorical
   failure can never change its outcome. The degenerate "zero windows exist at all" case also
   returns immediately. That's `ref.tab === undefined`, with no window lead, no current handle, and
   no fallback tab. It isn't a "surface hasn't appeared yet" situation. It's a dead session.

## Consequences

* **Good.** `find`, `click`, `type`, and the rest addressing a tab the page just opened now work
  without an author-inserted `wait`, as long as the tab appears within 2 seconds. That's the common
  case.
* **Good.** There's no schema change. Every existing spec's behavior is unchanged when its selector
  already matches on the first attempt. That's the overwhelming majority of steps: an omitted
  `surface`, the active tab, or a name or index registered earlier in the same test.
* **Trade-off.** A **wrong** selector now takes up to 2 seconds to FAIL, instead of failing
  instantly. That covers a typo, or a tab that will never exist. It's bounded and predictable, but a
  real cost for fast-failing negative tests. It's mitigated by keeping the bound small, at 2s, and
  by every affected step already carrying its own `timeout` for other reasons.
* **Trade-off.** `closeSurface` on a target that never existed, the idempotent no-op path, also now
  takes up to 2 seconds before resolving as absent, instead of instantly. It's accepted as the same
  trade-off as above. The alternative, retrying only on the "act" paths and not "close", would be an
  inconsistent mental model for authors.
* **Neutral.** The bound is a hardcoded internal constant, not a schema field. Making it
  author-configurable is a possible additive follow-up if 2s proves wrong for some workloads. It is
  deliberately out of scope here, per the no-schema-change decision driver.

## Confirmation

* Unit tests in `test/browserSurface.test.js` cover the retry:
  - A tab that appears only after N `getWindowHandles` calls resolves within the bounded window.
  - A selector that never matches returns the not-found message after the full bound elapses. Small
    `opts.maxWaitMs` and `pollIntervalMs` values keep that test fast.
  - A selector that matches on the first attempt resolves without the retry loop sleeping. That's
    verified through call-count rather than wall-clock, to avoid timing flakiness.
  - Existing negative-match tests pass `opts: { maxWaitMs: 0 }`, preserving their original
    instant-fail assertions.
* One step-level test uses `sinon` fake timers to fast-forward the retry loop's `setTimeout`-based
  sleep, rather than threading `opts` through the step-level orchestrator. That's the `closeSurface`
  re-close idempotency test in `test/goTo-openers.test.js`. It's consistent with the existing
  pattern in `test/recording-screenshot-coverage.test.js`'s download-timeout test.
* End-to-end: `test/core-artifacts/multi-tab.spec.json`'s page-opened-tab tests drop their manual
  `wait` step and address the new tab immediately after the triggering `click`.
