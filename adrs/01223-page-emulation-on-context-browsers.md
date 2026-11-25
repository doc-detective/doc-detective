---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Page emulation on context browsers

Builds on [ADR 01216](01216-bidi-socket-per-browser-chrome-first.md), which opens a BiDi socket
for Chrome only.

## Context and Problem Statement

Teams pick Playwright over Doc Detective for screenshots partly because Playwright sets what the
page sees about the device. That includes the color scheme, locale, time zone, pixel density,
reduced motion, and a fixed clock. Doc Detective sets none of them, so a dark-mode or German
screenshot needs a machine set up that way.

How should a context ask for these, and what happens in a browser that can't do one?

## Decision Drivers

* A dark-mode screenshot must never be taken in light mode. With the default
  `overwrite: aboveVariation`, a wrong capture replaces the reference image.
* Elements stay on classic WebDriver (ADR 00132). BiDi is open for Chrome only (ADR 01216).
* Launch-time options work without BiDi, so they reach Firefox too.
* Each variant is its own context, so a dark and a light run never share a session.

## Considered Options

1. **Keys on the context `browser` object, launch-time where possible, BiDi for the rest,
   Skipped where neither works** (chosen).
2. **A per-step action** that sets emulation through `driver.execute`. Page JavaScript can't
   change `prefers-color-scheme`, `devicePixelRatio` or the time zone, so this can't work.
3. **Run unsupported keys anyway, with a warning.** Quietly wrong screenshots, as above.

## Decision Outcome

Chosen option 1.

### Interface

New optional keys on the context `browser` object (`context_v3`):

| Key | Type | Default | Effect |
|---|---|---|---|
| `colorScheme` | `"light"` \| `"dark"` | the system's | `prefers-color-scheme` |
| `locale` | BCP 47 tag, e.g. `de-DE` | the system's | `navigator.language`, `Intl`, `Accept-Language` |
| `timezone` | IANA name, e.g. `Europe/Berlin` | the system's | The time zone `Date` and `Intl` use |
| `deviceScaleFactor` | number, 0.5 to 4 | the system's | `devicePixelRatio` |
| `reducedMotion` | `"reduce"` \| `"no-preference"` | the system's | `prefers-reduced-motion` |
| `clock` | ISO 8601 date-time | the real time | `Date.now()` and `new Date()` stay at that instant |

The keys sit inside `browser`, so context resolution treats a dark and a light context as
different. No new report fields: the resolved context already echoes `browser`.

### Mechanism per browser

| Key | Chrome | Firefox | Safari |
|---|---|---|---|
| `colorScheme` | arg `--blink-settings=preferredColorScheme=0\|1` | pref `layout.css.prefers-color-scheme.content-override` | Skipped |
| `locale` | arg `--lang` + pref `intl.accept_languages` | prefs `intl.locale.requested`, `intl.accept_languages` | Skipped |
| `timezone` | BiDi `emulation.setTimezoneOverride` | `moz:firefoxOptions.env.TZ` on Linux and macOS; Skipped on Windows | Skipped |
| `deviceScaleFactor` | arg `--force-device-scale-factor` | pref `layout.css.devPixelsPerPx` | Skipped |
| `reducedMotion` | arg `--force-prefers-reduced-motion` or `--force-prefers-no-reduced-motion` | pref `ui.prefersReducedMotion` | Skipped |
| `clock` | BiDi `script.addPreloadScript`, which replaces `Date` | Skipped | Skipped |

Android and iOS browsers skip every key.

* `emulationCapabilities(browser)` in [src/core/utils.ts](../src/core/utils.ts) returns the Chrome
  args and prefs and the Firefox prefs and env. `getDriverCapabilities` merges them.
* `unsupportedEmulation(browser, platform)` returns the skip message for the first key the browser
  can't set. `runContext` calls it before any browser starts. It also filters the cross-browser
  fallback candidates, so a fallback engine must set every key too.
* `timezone` and `clock` run over BiDi only in a browser in `BIDI_BROWSERS`, which always has the
  socket (ADR 01216). `BIDI_BROWSERS` moved to `utils.ts` and is re-exported. Outside the set,
  `timezone` uses the Firefox `TZ` fallback or skips, and `clock` skips.
* `applyEmulation(driver, browser)` runs right after `applyBrowserSize`, for the context's session
  and for every later session a `startSurface` step opens. It sends the BiDi commands.
* `emulation.setTimezoneOverride` targets `userContexts: ["default"]`. Chrome rejects the global
  form ("Either user contexts or browsing contexts must be provided").
* The `clock` preload script keeps explicit dates, `Date.parse` and `Date.UTC` working.
* goTo's in-page idle monitors now time with `performance.now()`. Timed with `Date.now()`, a frozen
  clock stalled every goTo wait until its timeout.

### Messages

| Case | Result | Message |
|---|---|---|
| The browser can't set a key | Context SKIPPED | ``Skipped: `safari` can't set `colorScheme`.`` |
| Firefox `timezone` on Windows | Context SKIPPED | ``Skipped: `firefox` can't set `timezone` on Windows.`` |
| A managed-device browser | Context SKIPPED | ``Skipped: `chrome` can't set `colorScheme` on Android.`` |
| A later session's engine can't set a key | Step FAIL | ``Couldn't open `firefox`: `firefox` can't set `clock`.`` |
| Chrome rejects a BiDi command | Context FAIL | ``Couldn't set `timezone` to `Europe/Berlin` in `chrome`.`` |
| An invalid value | Schema validation, exit 1 | The AJV message naming the key |

### Consequences

* Good: dark-mode, localized and fixed-date screenshots run on one machine, one context each.
* Good: no row runs wrong. A browser that can't set a key skips the context.
* Neutral: Chrome contexts with `timezone` or `clock` open a BiDi socket. Others don't.
* Bad: Firefox `clock` and Windows Firefox `timezone` stay Skipped until Firefox joins
  `BIDI_BROWSERS`.
* Bad: Safari sets nothing, because safaridriver takes neither args nor prefs.

### Confirmation

* Unit tests: [test/page-emulation.test.js](../test/page-emulation.test.js) covers every key and
  browser in `emulationCapabilities`, every Skipped cell in `unsupportedEmulation`,
  the merged capabilities, `applyEmulation` and the `Date` replacement.
  [src/common/test/validate.test.js](../src/common/test/validate.test.js) covers the schema.
  [test/browser-wait.test.js](../test/browser-wait.test.js) guards the `performance.now()` change.
  [test/core-core.test.js](../test/core-core.test.js) asserts the exact skip reason end to end.
* Fixtures: [test/core-artifacts/emulation/emulation.spec.json](../test/core-artifacts/emulation/emulation.spec.json)
  has one test per key, value and browser, asserting with `runBrowserScript`. It's in the
  `general` bundle.

#### Verification on Windows 11 (local, Chrome and Firefox headless)

Every launch-time row held: the page saw the requested `prefers-color-scheme` (both values),
`navigator.language`, `devicePixelRatio` and `prefers-reduced-motion` (both values), in Chrome and
in Firefox. Chrome `timezone` and `clock` held over BiDi, alone and together with every other key.
Firefox `clock` and Windows Firefox `timezone` skipped with their messages.

Linux and macOS rows, including the riskiest, Linux `--lang` and `--blink-settings`, are confirmed
by the fixture matrix in CI. A row that fails there moves to Skipped for that browser and
platform, and this section records it.

## Pros and Cons of the Options

### Keys on the context browser, Skipped where unsupported

* Good: the context is the unit that owns a session, so launch-time options fit.
* Good: one support check, before the browser starts.
* Bad: a variant needs its own test until the roadmap's `matrix` work lands.

### A per-step action

* Good: one test could switch modes mid-run.
* Bad: page JavaScript can't set most of these values.

### Run anyway with a warning

* Good: nothing is skipped.
* Bad: wrong screenshots overwrite references, and nobody reads the warning.
