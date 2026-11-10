---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Target browser windows and tabs with `surface` (browser surfaces, Phase 3)

## Context and Problem Statement

A test runs in a single browser context with one WebDriver session, and every step implicitly acts
on whatever tab happens to be focused. Docs routinely describe flows that span tabs and windows.
Think of "click the link, which opens the cart in a new tab", or "log in to the admin console in a
second window". Today those flows cannot be tested. Nothing can open a named tab, address a tab a
page opened on its own (`target="_blank"`, `window.open`), or bring a specific window back into
focus.

Phase 1 of the multi-surface design (ADR 01003) introduced the shared `surface` reference for
process targets and reserved the browser engine keywords. This phase adds the **browser** surface
kind for windows and tabs **in the active browser**. That's one driver session with multiple W3C
window handles, per Phase 3 of
[docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md). Multiple
concurrent browser sessions are Phase 4.

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
* **C. Live-enumeration indexes.** Resolve `window`/`tab` selectors directly against
  `getWindowHandles()` order, with no registry.

## Decision Outcome

Chosen option: **A**. It is the shape the multi-surface design fixed up front. It's the same
`surface` reference every kind uses, so browser targeting composes with the existing process kind
and the future app kind without a refactor. Option **B** adds a step type that means "mutate hidden
focus state". That reads worse in docs. Compare "switch to the tab, then click" with "click in the
cart tab". It also still needs all of A's resolution machinery. Option **C** breaks determinism,
since handle-enumeration order is unspecified across engines. It also cannot exclude the recorder
tab or remember names.

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
   tabName?, internal? }`. Indexes derive from **first-seen order**, a monotonic counter seeded
   with the initial window, rather than live enumeration. Page-opened handles are registered in the
   order a sync first observes them, and ordinals are never reused after a handle closes. The
   recorder tab registers `internal: true` and is excluded from every candidate list.
3. **Resolution.** An omitted `window` with a `tab` selector searches **all non-internal tabs** in
   creation order. That is what makes parentless page-opened tabs addressable by
   `title`/`url`/index/`-1`. With `window` given, scope narrows to that window's lead plus tabs
   whose recorded parent is that lead. Multiple matches resolve to the **first in creation order**.
   `title`/`url` criteria are evaluated by switching to each candidate and reading
   `getTitle()`/`getUrl()`, restoring focus if nothing matches. A step that names a `surface`
   **leaves that tab focused**, where active means most recently focused. So subsequent surface-less
   steps act there. That is also the documented way to screenshot or record a specific tab from
   surface-less steps.
4. **Phase 3 limits are loud, not silent.** Two cases FAIL with "…lands in a later phase", naming
   the active engine. Those are a browser surface whose engine differs from the context's active
   browser, and one that sets `name`. `closeSurface: "<engine>"`, which closes the whole browser,
   FAILs with guidance to use `{browser, tab}` or `{browser, window}`. Killing the only session
   mid-test would break every later step, and teardown owns the session. Closing the **last**
   non-internal tab is refused (FAIL) for the same reason. Closing a tab or window whose
   **selector matches nothing** is an idempotent PASS no-op, consistent with Phase 1
   `closeSurface`.
5. **Focus after close.** If the closed tab was active: its parent window's lead if alive, else
   the newest remaining non-internal tab. If it wasn't active: the previously active handle is
   restored.

## Consequences

* **Good.** Docs can test multi-tab and multi-window flows end-to-end. That covers opening named
  tabs and windows, addressing page-opened tabs, acting in a specific tab, and closing at tab or
  window granularity. It uses the same `surface` vocabulary processes already use.
* **Good, and forward-compatible.** Phase 4, with multiple browsers, turns today's loud
  engine-mismatch, `name`, and bare-engine-close FAILs into working behavior. No Phase 3 spec
  changes.
* **Good, and non-breaking.** No existing spec changes meaning. Every schema addition is an
  additive `anyOf` branch or optional field.
* **Trade-off: flat handles.** The W3C model has no window→tab hierarchy, so parent grouping
  exists only for handles Doc Detective opens. A page-opened tab has no parent. It is addressable
  globally by title, url, or index, but not scoped under a `window` selector.
* **Trade-off: index versus visual order.** Indexes reflect first-seen registration order, not
  on-screen tab order. That's deterministic, but authors must think "creation order", which the
  docs state explicitly.
* **Deviation from the design matrix.** `screenshot` gains `surface` even though the design's
  capability matrix omitted it. The matrix predates the decision, and the design doc is updated
  with this ADR. Focus-follow made it nearly free, and "screenshot the cart tab" is materially
  better for authors.
* **Neutral.** `type` to a **bare-string** surface still resolves its kind at runtime, which is the
  design's acknowledged un-typeable gap. An engine keyword takes the browser path, and anything
  else takes a process lookup.

## Confirmation

* Schema tests in `src/common/test/validate.test.js` carry positives for every selector form on
  every wired step, all `newTab`/`newWindow` shapes, kind-shaped `type.waitUntil`, and closeSurface
  tab and window forms. Negatives cover process branches on browser-only steps, `newTab` with
  `newWindow`, and opener or selector conflicts. They also cover bad engine enums, empty selector
  objects, extra keys, and process-shaped `waitUntil` with a browser surface.
* Unit tests in `test/browserSurface.test.js` use a stub driver. They cover the parse table,
  first-seen ordering, index, negative index and `-1`, and name, criteria, and regex resolution.
  They also cover internal exclusion, engine-mismatch and no-match messages, duplicate-name
  rejection, focus-after-close, last-tab refusal, and prune.
* End-to-end: `test/core-artifacts/multi-tab.spec.json` exercises every permutation through the
  real runner against `test/server/public/multi-tab.html` (PASS/SKIPPED only); a `runOn`-gated
  recording test proves the recorder tab is not addressable. Focused `it`s in
  `test/core-core.test.js` assert the exact FAIL paths (engine mismatch, selector no-match,
  bare-engine close, duplicate name, last-tab refusal).
