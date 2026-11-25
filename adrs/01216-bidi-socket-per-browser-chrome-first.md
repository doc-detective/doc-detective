---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Open the BiDi socket per browser, Chrome first

Supersedes the rejection in [ADR 01072](01072-bidi-socket-for-chrome-viewport-emulation.md).
Keeps [ADR 00132](00132-wdio-v9-bidi-attempt-and-classic-revert.md)'s classic element commands.

## Context and Problem Statement

Timezone and clock control in Chrome, true viewport emulation, native full-page capture and
network mocking all need a WebDriver BiDi socket on the session. Every session runs classic
WebDriver today: `wdio:enforceWebDriverClassic: true` and no `webSocketUrl`.

ADR 01072 (webdriverio 9.29, Appium 3.5) tried a socket-only setup, `webSocketUrl: true` with
element commands still classic, and rejected it for two reasons:

1. Headed Chrome with recording crashed with `Maximum call stack size exceeded`.
2. geckodriver session starts flaked with `ECONNREFUSED`.

BiDi is a long-term priority for the project. Can the socket be opened safely now, on
webdriverio 10.2.0 and Appium 4.0.0, and for which browsers?

## Decision Drivers

* No regression: every fixture that passes today still passes with the socket on.
* Session starts stay reliable: 20 starts in a row succeed.
* No fixture is more than 10% slower.
* Each browser is judged on its own evidence.
* Elements stay on classic WebDriver, so ADR 00132's element instability can't return.

## Findings

### Chrome stack overflow: root cause

The crash reproduces on webdriverio 10.2.0 (headed `test/core-artifacts/test.spec.json`,
0 of 6 steps run). It isn't the recorder. Run with `--stack-trace-limit=100000`, the recursion is
`lodash.clonedeep`'s `baseClone → arrayEach → cloneMap`, called from:

```text
webdriverio getElementObject.ts elementProperties()   clone(browser.__propertiesObject__)
webdriverio Browser.getElement / Browser.$
dist/core/tests/moveTo.js instantiateCursor()          driver.$("dd-mouse-pointer")
```

The chain:

1. With a socket, `webdriver`'s `initiateBidi()` puts `_bidiHandler` (the live `BidiHandler`)
   into the browser's `__propertiesObject__`.
2. Every BiDi command calls `handler.attachClient(this)`, so `_bidiHandler.client` becomes the
   live `Browser`.
3. `elementProperties()` deep-clones `__propertiesObject__` on **every** `$()`, so it deep-clones
   the whole `Browser`, including anything a caller hangs on it.
4. Doc Detective hangs `driver.state` on the browser. It holds the context's session registry
   (a `Map` of every session's driver, tracker and launcher) and the recording handles. That
   graph is deep enough to overflow the stack. Recording made it deep enough in ADR 01072's run.

Probing each property of `__propertiesObject__` with `clonedeep` confirmed only `_bidiHandler`
failed, and inside it only `client.state.sessionRegistry.sessions`.

**Fix (ours):** `driverStart()` defines `driver.state` as a non-enumerable property. lodash
clones only enumerable keys, so the clone skips it. Every `driver.state.x = …` and
`driver.state = …` keeps working. With that one change the same headed recording spec passes
6 of 6 steps with the socket on.

The recorder scripts didn't need to change, and webdriverio has no option to turn the managers
off. 10.2.0 is the latest webdriverio, so updating isn't a fix.

### Firefox `ECONNREFUSED`: resolved by Appium 4

On Appium 4.0.0 the `webSocketUrl` both drivers return points at the Appium server's own port,
`ws://127.0.0.1:<appium port>/bidi/<session id>`. Appium proxies the socket, so the client never
dials geckodriver's or chromedriver's own port. 20 headless Firefox session starts in a row all
passed and every socket connected.

### Go / no-go evidence (Windows 11, this machine)

Each browser fixture bundle (`general`, `recording`, `recording-2`, from
[fixtures.yml](../.github/workflows/fixtures.yml)) ran twice: socket off, then socket on for every
Chrome and Firefox context. A context-by-context diff of the two runs:

| Bundle | Contexts | Changed with the socket on |
|---|---|---|
| `general` | 1103 | 1 Firefox FAIL (below); no Chrome change |
| `recording` | 102 | none worse (2 ffmpeg contexts that flaked off passed on) |
| `recording-2` | 79 | none |

Failures with the socket **off** (`screenshot-paths`, `screenshot-reference-local`, headed ffmpeg
capture) are local-environment failures. They fail the same way without the socket.

Timing (sum of context run time per bundle, off → on): Chrome `general` 161 s → 130 s,
`recording` 229 s → 220 s, `recording-2` 142 s → 146 s. Four Chrome recording specs looked
11–41% slower in that single run, so they ran three more times, alternating off and on. Medians:
`recording-above-variation` −4.2%, `recording` −4.3%, `recording-record-preflight` +1.0%,
`recording-outputs` +0.7%, with no failures.

Session starts with the socket on: 20 of 20 headed Chrome, 20 of 20 headless Firefox.

**Firefox's one failure:** `sessions/multi-browser.spec.json` `multi-browser-cross-engine` (a
Firefox context that also opens Chrome) crashed before its first step with
`WebDriverError: Tried to run command without establishing a connection` on a classic
`switchToWindow`. That is Marionette reporting it has no connection. Three reruns with the socket
on all passed, so it's intermittent, and the cause isn't known yet.

### Verdict

* **Chrome: go.** Green bundles with recording, 20 of 20 starts, no fixture more than 10% slower.
* **Firefox: no-go for now.** The one socket-only crash in the cross-engine fixture is unexplained.
  Headed Firefox starts weren't measured.
* **Safari: not evaluated.** It needs macOS.

macOS and Linux are confirmed in CI, not on this machine.

## Considered Options

1. **Make `driver.state` non-enumerable; open the socket per context, per browser** (chosen).
2. **Hide `_bidiHandler` from webdriverio's clone** by redefining it non-enumerable on
   `__propertiesObject__`. Smaller graph per `$()`, but it edits webdriverio's private object.
3. **Patch webdriverio** (patch-package) so `elementProperties()` skips non-plain values.
4. **Keep the ADR 01072 rejection.**

## Decision Outcome

Chosen option 1.

* `driver.state` is non-enumerable, so it never enters webdriverio's clone.
* A `BIDI_BROWSERS` set in [src/core/tests.ts](../src/core/tests.ts) lists the browsers that passed:
  `["chrome"]`. Adding one is a one-line change, made with its own evidence in an ADR.
* `needsBidi(context, steps)` decides whether a context gets the socket. It returns `false` until a
  feature that needs the socket (timezone, clock, full-page capture, request mocking) adds its
  check, so every context keeps today's behavior.
* `getDriverCapabilities()` adds `webSocketUrl: true` only when `options.bidi` is set and the
  browser is in `BIDI_BROWSERS`. `wdio:enforceWebDriverClassic` stays `true` everywhere.

There's no user-facing interface: no keys, flags or messages. A BiDi start failure surfaces
through the existing context-start FAIL and its headless retry.

### Consequences

* Good: the recording crash's root cause is fixed for every caller, socket or not.
* Good: features that need BiDi can turn it on for Chrome, one context at a time.
* Neutral: webdriverio still deep-clones the whole `Browser` on every `$()` while a socket is open.
  It measured no slower here, but anything enumerable added to the driver later re-enters that
  clone. Keep per-context state on `driver.state`.
* Bad: Firefox stays classic until its intermittent crash is explained.

### Confirmation

* `test/driver-start-retry.test.js`: `driver.state` isn't an enumerable key, before or after it's
  reassigned.
* `test/context-resolution.test.js`: Chrome gets `webSocketUrl` only when `bidi` is set; a browser
  outside `BIDI_BROWSERS` never does; `needsBidi()` is `false`; `enforceWebDriverClassic` stays
  `true`.
* CI's fixture matrix on Windows, macOS and Linux confirms the other platforms once a feature
  turns the socket on.

## Pros and Cons of the Options

### Option 1: non-enumerable `driver.state`, per-browser socket
* Good: a one-property fix in our code; no dependency on webdriverio internals.
* Bad: the per-`$()` clone of the `Browser` remains upstream.

### Option 2: hide `_bidiHandler` from the clone
* Good: also removes the per-`$()` clone cost.
* Bad: mutates webdriverio's private `__propertiesObject__`; element objects lose `_bidiHandler`.

### Option 3: patch webdriverio
* Good: fixes it at the source.
* Bad: a patch to carry across upgrades; belongs upstream.

### Option 4: keep the rejection
* Good: no change.
* Bad: blocks every BiDi feature on a bug that is now understood and fixed.

## More Information

### Upstream issue draft (webdriverio; not filed)

> **`$()` deep-clones the live `Browser` through `_bidiHandler` and can overflow the stack**
>
> webdriverio 10.2.0, webdriver 10.2.0. Session with `webSocketUrl: true` (also with
> `wdio:enforceWebDriverClassic: true`).
>
> `elementProperties()` in `src/utils/getElementObject.ts` runs
> `clone(browser.__propertiesObject__)` (lodash.clonedeep) for every element lookup. With BiDi,
> `__propertiesObject__._bidiHandler` is the live `BidiHandler`, and each BiDi command calls
> `handler.attachClient(this)`, so `_bidiHandler.client` is the `Browser`. Every `$()` therefore
> deep-clones the whole browser, including user properties.
>
> Minimal repro: start a session with `webSocketUrl: true`; set
> `browser.custom = { deep: <a nested structure ~3000 levels deep> }`; call `await browser.$("body")`.
> Result: `RangeError: Maximum call stack size exceeded` in `baseClone`. Without the socket, `$()`
> succeeds.
>
> Suggested fix: skip `_bidiHandler` (and other non-plain descriptor values) when cloning, or clone
> descriptors shallowly.

### Still open

* Firefox: find the cause of `Tried to run command without establishing a connection` in the
  cross-engine fixture with the socket on, measure 20 headed starts, then rerun this evaluation.
* Safari: evaluate on macOS.
* Chromedriver's `/goog/cdp/execute` through the Appium proxy (404 in ADR 01072) wasn't retested;
  BiDi makes it unnecessary for the planned features.
