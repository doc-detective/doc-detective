---
status: accepted
date: 2026-11-26
decision-makers: doc-detective maintainers
---

# File page-opened tabs under the opener's window

Amends the "flat handles" trade-off of [ADR 01016](01016-target-browser-windows-and-tabs.md).

## Context and Problem Statement

ADR 01016 registered a tab the page opens (a `target="_blank"` link, `window.open`) without a parent
window, because the W3C handle model has no window grouping. A `window` selector narrows the tab
search to that window's lead and the tabs recorded under it. So a page-opened tab was reachable only
without `window`:

- `{ "browser": "firefox", "tab": 1 }` found the tab.
- `{ "browser": "firefox", "window": 0, "tab": 1 }` failed with `No tab matched 1 in the active browser.`,
  and so did `"tab": -1`.
- `closeSurface` with `{ "window": { "index": 0 }, "tab": { "index": 1 } }` passed as a no-op and left
  the tab open.

Authors read `window: 0, tab: 1` as "the second tab of the first window", which is where the browser
shows the tab. Which window should a page-opened tab belong to?

## Decision Drivers

- `window` and `tab` compose the same way for every tab, however it opened.
- The registry stays driver-agnostic: no engine-specific window APIs.
- No change for specs that address page-opened tabs without `window`.

## Considered Options

- **A. File a page-opened tab under the window of the tab focused when it's first seen** (chosen).
- **B. Keep page-opened tabs parentless** (ADR 01016 as written).
- **C. Ask the browser which window holds the tab**, through BiDi browsing contexts or CDP targets.

## Decision Outcome

Chosen option: **A**. Doc Detective never moves focus to a tab the page opens. So when a sync first
sees a new handle, the focused tab is the one whose page opened it. The new tab's parent is that
tab's window lead: the tab itself when it's a lead, else its recorded parent. That's the rule
`goTo` `newTab` already uses. When focus can't be read, the tab stays parentless, as before.

- `{ "window": 0, "tab": 1 }`, `"tab": -1`, `{ "index": … }` forms, and `title`/`url` criteria inside
  a `window` selector reach page-opened tabs.
- A tab opened from a named window (`goTo` `newWindow`) is filed under that window, not window 0.
- Closing a window closes the tabs its pages opened too, the same as a browser does.
- Closing an active page-opened tab focuses its window's lead, per ADR 01016's focus rule, instead of
  the newest remaining tab.
- `registerOpenedHandle` replaces a parent a sync guessed when it upgrades the same handle.

### Consequences

- Good: window-scoped selectors work for every tab, matching how the browser groups them.
- Good: no new driver calls, and specs without `window` resolve exactly as before.
- Bad: `window.open` with window features opens a popup window, which W3C can't tell from a tab. It's
  filed as a tab of its opener's window. Under ADR 01016 it wasn't reachable through `window` at all,
  so nothing that worked stops working.

### Confirmation

- `test/browserSurface.test.js` checks four cases:
  - sync files page-opened tabs under the focused tab's window, and a tab opened from a page-opened
    tab inherits its window;
  - unreadable focus leaves the tab parentless;
  - an upgrade to a window lead drops the guessed parent;
  - `window` + `tab` selectors (integer, `-1`, `{ index }`, title) and `resolveCloseTargets` reach a
    page-opened tab.
- Fixture `test/core-artifacts/sessions/window-scoped-tabs.spec.json`: a link and `window.open` tab
  reached, typed into, and closed through `window` + `tab` selectors, and a tab opened from a named
  window filed under it.

## Pros and Cons of the Options

### A. The focused tab's window

- Good: correct for every link and `window.open` without features.
- Bad: a feature popup is treated as a tab.

### B. Parentless

- Good: never guesses.
- Bad: `window` + `tab` fails on the tabs authors most often need, and `closeSurface` silently no-ops.

### C. Browser window APIs

- Good: exact.
- Bad: needs BiDi or CDP per engine, and Safari has neither in the shape needed.
