---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Run every session of a go browser on BiDi, Chrome first

Supersedes the rejection in [ADR 01072](01072-bidi-socket-for-chrome-viewport-emulation.md).
Supersedes [ADR 00132](00132-wdio-v9-bidi-attempt-and-classic-revert.md) for Chrome: Chrome runs fully
on BiDi. Firefox and Safari keep ADR 00132's classic commands.

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
* ADR 00132's element regressions (visibility, cookie `sameSite`, find timing) must not return.
* The simplest stack wins: one protocol per browser.

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

### Full BiDi for Chrome: `enforceWebDriverClassic: false`

**What the flag does in webdriverio 10.2.0.** It doesn't pick the protocol for each command.
Commands branch on `browser.isBidi`, which is `true` whenever the socket is connected.
`startWebDriverSession()` reads the flag in one place. When it's `false`, it adds
`webSocketUrl: true` and `unhandledPromptBehavior: "ignore"`.

So once the socket was on, every webdriverio command with a BiDi path already used it. That
includes `setCookies`, `getCookies` and `isDisplayed`. Flipping the flag adds only the prompt
behavior. Doc Detective has no dialog handling, and no fixture opens a dialog.

**Measured.** The three bundles ran again with Chrome on `enforceWebDriverClassic: false`. The
baseline was the socket-on classic run above, compared context by context.

| Bundle | Contexts | Changed with full BiDi |
|---|---|---|
| `general` | 1103 | none worse (the Firefox cross-engine context passed this time) |
| `recording` | 102 | none worse (2 ffmpeg contexts that flaked before passed) |
| `recording-2` | 79 | none |

Session starts: 20 of 20 headed Chrome.

Bundle sums of Chrome context time came out 18–33% higher in that single pass. Three of the most
affected specs then ran three times each, alternating the two setups. Medians with full BiDi:
`screenshot-crop-variation` −9.8%, `type-secret` −4.9%, `recording-headless-chrome` −8.2%. None
failed. The single-pass gap was run-to-run noise, not the protocol.

**ADR 00132's three regressions, rechecked:**

* **Visibility.** `findStrategies.ts` collects `isDisplayed()` and
  `isDisplayed({ withinViewport: true })` for element outputs. No find, click or visibility fixture
  changed result.
* **Cookie `sameSite` case.** webdriverio 10 now converts the case itself. `toClassicCookie()` maps
  to `Strict`/`Lax`/`None`. `toBidiCookie()` passes the value through, and a BiDi error falls back
  to classic. `cookie-test` and `cookie-paths` passed on full BiDi with no fallback warning.
  `loadCookie.ts` needs no change.
* **`findElement` timing.** ADR 00132's polling `findElement` still covers it. No find fixture timed
  out.

### Verdict

* **Chrome: go, fully on BiDi.** Green bundles with recording, 20 of 20 starts, no fixture more than
  10% slower, with the socket alone and with full BiDi.
* **Firefox: no-go for now.** The one socket-only crash in the cross-engine fixture is unexplained.
  Headed Firefox starts weren't measured.
* **Safari: not evaluated.** It needs macOS.

macOS and Linux are confirmed in CI, not on this machine.

## Considered Options

1. **Make `driver.state` non-enumerable; run every session of a go browser fully on BiDi**
   (chosen).
2. **Hide `_bidiHandler` from webdriverio's clone** by redefining it non-enumerable on
   `__propertiesObject__`. Smaller graph per `$()`, but it edits webdriverio's private object.
3. **Patch webdriverio** (patch-package) so `elementProperties()` skips non-plain values.
4. **Keep the ADR 01072 rejection.**
5. **Open the socket per context, only when a feature needs it.** Rejected: it adds a switch
   between two stacks in one browser for no measured gain.
6. **Socket on, `enforceWebDriverClassic: true`.** Rejected: in webdriverio 10 it already sends
   commands over BiDi, so the flag only misstates the stack.

## Decision Outcome

Chosen option 1.

* `driver.state` is non-enumerable, so it never enters webdriverio's clone.
* A `BIDI_BROWSERS` set in [src/core/tests.ts](../src/core/tests.ts) lists the browsers that passed:
  `["chrome"]`. Adding one is a one-line change, made with its own evidence in an ADR.
* The socket is always on for a browser in the set. `getDriverCapabilities()` adds
  `webSocketUrl: true` to every session of that browser, and to no other browser.
* `hasBidi(browserName)` reports whether a browser's sessions have the socket. A feature that needs
  BiDi runs where it's `true` and is SKIPPED everywhere else. Its name is stable.
* `wdio:enforceWebDriverClassic` is `!hasBidi(name)`. Chrome runs fully on BiDi; Firefox and
  Safari stay classic with no socket. Both 1,284-context comparisons ran with this setup on Chrome.

There's no user-facing interface: no keys, flags or messages. A BiDi start failure surfaces
through the existing context-start FAIL and its headless retry.

### Consequences

* Good: the recording crash's root cause is fixed for every caller, socket or not.
* Good: one stack per browser. Features that need BiDi check `hasBidi()` and nothing else.
* Neutral: every Chrome session now opens a socket, whether or not a step uses it.
* Neutral: webdriverio still deep-clones the whole `Browser` on every `$()` while a socket is open.
  It measured no slower here, but anything enumerable added to the driver later re-enters that
  clone. Keep per-context state on `driver.state`.
* Bad: Firefox stays classic until its intermittent crash is explained.

### Confirmation

* `test/driver-start-retry.test.js`: `driver.state` isn't an enumerable key, before or after it's
  reassigned.
* `test/context-resolution.test.js`: every Chrome session gets `webSocketUrl` and
  `enforceWebDriverClassic: false`. Firefox and Safari get neither. `hasBidi()` is `true` only for
  Chrome.
* CI's fixture matrix on Windows, macOS and Linux confirms the other platforms on this PR.

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

### Option 5: socket per context, only when needed
* Good: contexts that don't need BiDi keep the exact classic stack.
* Bad: two stacks per browser to reason about, and a gate every feature must extend.

### Option 6: socket on, classic flag kept
* Good: keeps webdriverio's default prompt handling, which Doc Detective doesn't use.
* Bad: the flag suggests classic commands while BiDi-capable commands already use the socket.

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
