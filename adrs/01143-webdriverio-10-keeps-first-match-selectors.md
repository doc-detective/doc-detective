---
status: accepted
date: 2026-10-23
decision-makers: doc-detective maintainers
---

# WebdriverIO 10 keeps first-match selectors

## Context and Problem Statement

Doc Detective drives browsers and native apps through `webdriverio`, a heavy dependency loaded just
in time from the runtime cache. Its Firefox driver comes from the `geckodriver` npm package. Both
had majors held back: `webdriverio` 10 and `geckodriver` 8, which upstream pairs with WebdriverIO 10.

WebdriverIO 10 makes `$` strict (webdriverio#15684). When a selector matches more than one
element, `$` throws `strict mode violation` instead of returning the first match. Doc Detective
hands user selectors straight to `$`. The `find` and `click` string shorthands do, and so do
app-surface element lookups. The docs promise the opposite of strict mode: "If multiple elements
match … the step operates on the first matched element" (`find.mdx`, `selectors/css.mdx`).

Silence would make it worse. The shorthand lookup treats a throwing strategy as "give this
strategy up" (ADR 01131), so a multi-match selector would just stop matching, and the step would
fail with "element not found". The page still has the element.

WebdriverIO 10 also removes `executeAsync` (webdriverio#15705), which the browser recording engine
used to start its `MediaRecorder`.

How does Doc Detective take the upgrade without changing what a user's spec does?

## Decision Drivers

* A spec that passes on WebdriverIO 9 passes on 10, with the same element chosen.
* Keep the documented first-match contract for every selector path, browser and app alike.
* Smallest change that covers every `$` call, including ones added later.
* Stay on supported upstream majors. Node `>=22.19` is already the engines floor.

## Considered Options

* Opt out of strict selectors per session with `strictSelectors: false`.
* Rewrite each `$(selector)` call site as `$$(selector)[0]` or `$(selector, { strict: false })`.
* Adopt strict mode and document it as a breaking change.

## Decision Outcome

Chosen option: "Opt out per session with `strictSelectors: false`". `driverStart`, the single
place every browser and app session is created, passes it to `remote()`. WebdriverIO reads it for
every `$` on that session and on elements under it, including stale-element refetches.

The recording engine's in-page starter moves from `executeAsync(fn(..., done))` to
`execute(async (...) => new Promise(done => …))`. On a Classic session, WebdriverIO 10 sends an
`async` function through Execute Async Script. That's the same endpoint `executeAsync` used.

`geckodriver` 8 keeps `download()`'s signature and return value, and it still resolves its cache
from `GECKODRIVER_CACHE_DIR`. Doc Detective never read the removed `GECKODRIVER_FILEPATH`. One
thing did break: the loader resolves heavy deps with CommonJS conditions, then `import()`s the
file. geckodriver 8's CommonJS entry is `module.exports = require('../index.js')`, a re-export of
its ESM build, and `import()` of it exposes the exports only on `default`. `loadGeckodriver`
therefore unwraps `mod.default ?? mod`, the idiom the sharp and pixelmatch loads already use.
Without it every geckodriver install fails with `gecko.download is not a function`.

The new `@wdio/logger` peer is a required peer, so npm installs it alongside `geckodriver` in the
runtime cache, with no `RUNTIME_PEER_COMPANIONS` entry needed. WebdriverIO 10's own `@wdio/utils`
now depends on `geckodriver` 8 too, so the cache holds one copy.

### Consequences

* Good, because specs keep resolving the first match. A selector that matches several elements
  passes, as it did before.
* Good, because one option covers every current and future `$` call. No per-site rewrite can be
  missed.
* Good, because `geckodriver` 8 downloads honor `NO_PROXY` and lower-case proxy variables, through
  undici's `EnvHttpProxyAgent`. `HTTPS_PROXY` and `HTTP_PROXY` keep working.
* Bad, because Doc Detective doesn't surface WebdriverIO's ambiguity signal. A user who wants it
  must write a unique selector. That matches the documented behavior.
* Neutral: WebdriverIO 10's `getValue()` always reads the element *property*. Browser sessions
  already did. For native-app elements, `outputs.element.value` comes from Get Element Property,
  not Get Element Attribute. The output is collected best-effort and is `null` when a driver
  rejects the call.

### Confirmation

* `test/driver-start-retry.test.js` asserts `driverStart` passes `strictSelectors: false`.
* `test/recording-screenshot-coverage.test.js` drives the browser recording engine with a fake
  driver that has no `executeAsync` and answers only an `async` `execute`.
* `test/runtime-browsers.test.js` installs geckodriver through a module whose exports sit on
  `default`, the shape geckodriver 8 loads with.
* `test/core-artifacts/interactions/find-multiple-matches.spec.json` runs `find` and `click`
  shorthands whose selectors match several elements. Each step asserts it acted on the first one.
  It fails on WebdriverIO 10 without the opt-out.
* The existing browser-engine recording permutations in
  `test/core-artifacts/recording/recording-permutations.spec.json` exercise the ported starter on
  headed Chrome.

## Pros and Cons of the Options

### Opt out per session with `strictSelectors: false`

* Good, because it's one line at the single session-creation point.
* Good, because it covers element-scoped `$` and refetches, not just the call sites.
* Bad, because it depends on an upstream option staying supported. The v10 error message itself
  points users to it.

### Rewrite each call site

* Good, because each site states its intent.
* Bad, because there are several sites today, and every new one must remember the rule. A missed
  site fails silently in the shorthand path.
* Bad, because `$$(selector)[0]` returns an element without the lazy not-found semantics `$` has,
  which the polling lookup relies on.

### Adopt strict mode

* Good, because ambiguous selectors become visible.
* Bad, because it breaks documented behavior and existing specs. That needs a major release and a
  migration path, not a dependency bump.
