---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Target browser windows and tabs with `surface` (browser surfaces, Phase 3)

## Context and Problem Statement

A test runs in a single browser context with one WebDriver session, and every step implicitly acts
on whatever tab happens to be focused. Docs routinely describe flows that span tabs and windows —
"click the link, which opens the cart in a new tab", "log in to the admin console in a second
window" — and today those flows cannot be tested: nothing can open a named tab, address a tab a
page opened on its own (`target="_blank"`, `window.open`), or bring a specific window back into
focus.

Phase 1 of the multi-surface design (ADR 01003) introduced the shared `surface` reference for
process targets and reserved the browser engine keywords. This phase adds the **browser** surface
kind for windows and tabs **in the active browser** — one driver session, multiple W3C window
handles — per [docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md)
Phase 3. Multiple concurrent browser sessions are Phase 4.

## Decision Drivers

* Reuse the Phase 1 vocabulary: the same flat `surface` field, additive `anyOf` branch, no
  breaking change to any existing spec (omitted `surface` stays byte-identical to today).
* One opener: windows/tabs must be created deliberately and nameably, not as a side effect of
  every step.
* Page-opened tabs (`target="_blank"`, `window.open`) must be addressable even though the W3C
  handle model is flat (no parent grouping, no creation metadata).
* Deterministic addressing: index/`-1` selectors must resolve the same way on every engine, even
  though `getWindowHandles()` ordering is not contractually stable.
* The recorder tab (an implementation detail of `record`) must never be addressable or countable.

## Considered Options

* **A. `surface` browser branch with shared `window`/`tab` selectors + a per-context first-seen
  handle registry; `goTo` `newTab`/`newWindow` as the only openers** (chosen).
* **B. A dedicated `switchTab`/`switchWindow` step** that changes focus, with all other steps
  staying surface-less.
* **C. Live-enumeration indexes** — resolve `window`/`tab` selectors directly against
  `getWindowHandles()` order with no registry.

## Decision Outcome

Chosen option: **A**. It is the shape the multi-surface design fixed up front: the same `surface`
reference every kind uses, so browser targeting composes with the existing process kind and the
future app kind without a refactor. Option **B** adds a step type that means "mutate hidden focus
state", which reads worse in docs ("switch to the tab, then click" vs "click in the cart tab") and
still needs all of A's resolution machinery. Option **C** breaks determinism — handle-enumeration
order is unspecified across engines — and cannot exclude the recorder tab or remember names.

Mechanism:

1. **Schema.** `surface_v3` gains a `browser` branch
   `{ browser: chrome|firefox|safari|webkit|edge, name?, window?, tab? }` plus a shared
   `windowOrTabSelector` (`"name"` | integer index (negative counts from the end, `-1` = newest) |
   `{ name, index, title, url }` with `title`/`url` substring-or-`/regex/`). Steps reference only
   the kinds they allow via subpath `$ref`s: `click`/`find`/`dragAndDrop`/`runBrowserScript`/
   `record`/`screenshot`/`goTo` list `byName` + `browser`; `type` and `closeSurface` keep the whole
   `surface_v3` (all kinds). `goTo` adds `newTab` (`true`|`"name"`|`{name}`) and `newWindow`
   (`true`|`"name"`|`{name, tab}`), mutually exclusive, and is the **only** opener of
   windows/tabs. `type.waitUntil` becomes kind-shaped via `if/then` guards: process surface →
   `{stdio, delayMs}`; browser surface → `{networkIdleTime, domIdleTime, find}` (goTo's readiness
   vocabulary, executed with goTo's wait machinery).
2. **Registry.** `driver.state.surfaces` (per-context, dies with the driver, like
   `state.recordings`) tracks `{ handle, order, isWindowLead, parentWindow?, windowName?,
   tabName?, internal? }`. Indexes derive from **first-seen order** (a monotonic counter seeded
   with the initial window), not live enumeration; page-opened handles are registered in the order
   a sync first observes them; ordinals are never reused after a handle closes. The recorder tab
   registers `internal: true` and is excluded from every candidate list.
3. **Resolution.** `window` omitted + `tab` selector searches **all non-internal tabs** in
   creation order — this is what makes parentless page-opened tabs addressable by
   `title`/`url`/index/`-1`. With `window` given, scope narrows to that window's lead plus tabs
   whose recorded parent is that lead. Multiple matches resolve to the **first in creation order**.
   `title`/`url` criteria are evaluated by switching to each candidate and reading
   `getTitle()`/`getUrl()`, restoring focus if nothing matches. A step that names a `surface`
   **leaves that tab focused** (active = most recently focused), so subsequent surface-less steps
   act there — this is also the documented way to screenshot/record a specific tab from
   surface-less steps.
4. **Phase 3 limits are loud, not silent.** A browser surface whose engine differs from the
   context's active browser — or one that sets `name` — FAILs with "…lands in a later phase"
   naming the active engine. `closeSurface: "<engine>"` (close the whole browser) FAILs with
   guidance to use `{browser, tab}`/`{browser, window}`; killing the only session mid-test would
   break every later step and teardown owns the session. Closing the **last** non-internal tab is
   refused (FAIL) for the same reason. Closing a tab/window whose **selector matches nothing** is
   an idempotent PASS no-op, consistent with Phase 1 `closeSurface`.
5. **Focus after close.** If the closed tab was active: its parent window's lead if alive, else
   the newest remaining non-internal tab. If it wasn't active: the previously active handle is
   restored.

## Consequences

* **Good** — docs can test multi-tab/multi-window flows end-to-end (open named tabs/windows,
  address page-opened tabs, act in a specific tab, close at tab/window granularity) with the same
  `surface` vocabulary processes already use.
* **Good** — forward-compatible: Phase 4 (multiple browsers) turns today's loud engine-mismatch /
  `name` / bare-engine-close FAILs into working behavior without changing any Phase 3 spec.
* **Good** — non-breaking: no existing spec changes meaning; every schema addition is an additive
  `anyOf` branch or optional field.
* **Trade-off (flat handles)** — the W3C model has no window→tab hierarchy, so parent grouping
  exists only for handles Doc Detective opens. A page-opened tab has no parent: it is addressable
  globally (title/url/index) but not scoped under a `window` selector.
* **Trade-off (index vs. visual order)** — indexes reflect first-seen registration order, not
  on-screen tab order. Deterministic, but authors must think "creation order", which the docs
  state explicitly.
* **Deviation from the design matrix** — `screenshot` gains `surface` even though the design's
  capability matrix omitted it (the matrix predates the decision; the design doc is updated with
  this ADR). Focus-follow made it nearly free and the UX ("screenshot the cart tab") is
  materially better.
* **Neutral** — `type` to a **bare-string** surface still resolves its kind at runtime (the
  design's acknowledged un-typeable gap): engine keyword → browser path, anything else → process
  lookup.

## Confirmation

* Schema (`src/common/test/validate.test.js`): positives for every selector form on every wired
  step, all `newTab`/`newWindow` shapes, kind-shaped `type.waitUntil`, closeSurface tab/window
  forms; negatives for process branches on browser-only steps, `newTab`+`newWindow` together,
  opener/selector conflicts, bad engine enums, empty selector objects, extra keys, and
  process-shaped `waitUntil` with a browser surface.
* Unit (`test/browserSurface.test.js`, stub driver): parse table, first-seen ordering,
  index/negative/`-1`, name/criteria/regex resolution, internal exclusion, engine-mismatch and
  no-match messages, duplicate-name rejection, focus-after-close, last-tab refusal, prune.
* End-to-end: `test/core-artifacts/multi-tab.spec.json` exercises every permutation through the
  real runner against `test/server/public/multi-tab.html` (PASS/SKIPPED only); a `runOn`-gated
  recording test proves the recorder tab is not addressable. Focused `it`s in
  `test/core-core.test.js` assert the exact FAIL paths (engine mismatch, selector no-match,
  bare-engine close, duplicate name, last-tab refusal).
