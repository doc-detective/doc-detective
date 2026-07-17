---
status: rejected
date: 2026-07-15
decision-makers: doc-detective maintainers
---

# Viewport emulation via a BiDi socket — evaluated and rejected (crashes recording)

## Context and Problem Statement

[ADR 01071](01071-warn-when-a-browser-floors-a-requested-viewport.md) made a floored viewport
*observable* (warning + realized-size reporting) but did not make sub-floor viewports *achievable*: a
375px request still renders at ~500px because Doc Detective sizes the viewport by resizing the OS
window, which is subject to the browser/OS minimum window width. The floor applies headless too.

True viewport **emulation** — setting the page *content* size directly — would fix this.
WebdriverIO v9 exposes `driver.setViewport({ width, height })` for exactly this, and it works, but it
requires a WebDriver **BiDi** socket on the session. [ADR 00132](00132-wdio-v9-bidi-attempt-and-classic-revert.md)
disabled BiDi (`wdio:enforceWebDriverClassic: true`) after a full-BiDi migration proved unstable. This
ADR evaluated whether the BiDi socket could be enabled **narrowly** — only for `setViewport`, keeping
element interaction classic — without reintroducing that instability.

## Decision Drivers

* Realize small/mobile viewports at their exact requested size, no new user-facing field.
* Do not regress any existing feature (the ADR 00132 constraint).
* Prove behavior against the real browser test suite, including recording, before shipping.

## Considered Options

1. **Enable `webSocketUrl: true` on Chrome/Firefox, keep `enforceWebDriverClassic: true`, use the
   socket only for `setViewport`.** The hypothesis: element interaction stays classic, so ADR 00132's
   instability (element semantics) doesn't recur.
2. **Conditionally enable the socket only for contexts that request a viewport**, so recording
   contexts stay classic.
3. **Keep only ADR 01071's warning** (no emulation).

## Decision Outcome

**Rejected — keep option 3 (ADR 01071's warning only).** Option 1 was implemented and tested live. It
delivered exact viewport realization (a 375px Chrome request rendered at exactly 375px) and passed
element-interaction fixtures (navigation, find/goTo/close). But two blocking regressions surfaced:

1. **It crashes headed recording contexts.** With the BiDi socket enabled on Chrome, the end-to-end
   `test.spec.json` context (headed Chrome + `startRecording`) crashed during setup with
   `Context 'default' crashed: Maximum call stack size exceeded`, before any step ran. Removing
   `webSocketUrl` made the identical spec pass (7/7). Reproduced deterministically both ways.
2. **It flakes Firefox startup.** Enabling the socket on Firefox produced intermittent geckodriver
   session-start failures (`ECONNREFUSED`).

Option 2 (gate the socket to viewport contexts) does **not** rescue it: recording and viewport are a
supported, tested combination — `test/core-artifacts/recording/autorecord.spec.json` and
`recording-permutations.spec.json` both set a viewport — so any context that records *and* sets a
viewport would still get the socket and crash. There is no clean gate. Enabling the BiDi socket at all
reintroduces exactly the cross-driver instability ADR 00132 documented; the "narrow, socket-only"
hypothesis is false because the socket's mere presence destabilizes the recording path.

Shipped behavior therefore remains ADR 01071: resize the window, read the viewport back, and warn when
the browser/OS floored the request — on every engine. Sub-floor viewport fidelity via window sizing is
not achievable on this stack; mobile-device emulation is the recommended path for true small widths.

### Consequences

* Good: no regression — recording, element interaction, and existing viewport behavior are unchanged.
* Good: the evaluation is recorded with reproduced evidence, so the next person doesn't re-run it. The
  BiDi socket is confirmed unsafe here for a concrete, non-obvious reason (recording stack overflow),
  strengthening ADR 00132 beyond "element semantics."
* Bad: sub-500px viewports still render at the floor; the ADR 01071 warning is the only mitigation.
* Neutral: revisiting is possible if a future WebdriverIO/driver release makes the BiDi socket coexist
  with recording, or if a non-BiDi CDP path becomes reachable through Appium (chromedriver's
  `/goog/cdp/execute` currently 404s through the Appium proxy).

### Confirmation

* Live repro: `test.spec.json` (headed Chrome + recording) crashes with "Maximum call stack size
  exceeded" when `webSocketUrl` is on Chrome; passes (7/7) when it is off. Firefox socket caused an
  ECONNREFUSED session-start failure.
* The shipped resize-and-warn behavior is confirmed by ADR 01071's tests and the live 375→501 warning.

## Pros and Cons of the Options

### Option 1 — BiDi socket, classic elements, setViewport-only
* Good: exact viewport realization on Chrome; element interaction unaffected.
* Bad: crashes headed recording contexts (stack overflow); flakes Firefox startup.

### Option 2 — socket only for viewport contexts
* Good: would spare recording-only contexts.
* Bad: viewport+recording is a supported combo, so it still crashes; no clean gate.

### Option 3 — warning only (ADR 01071)
* Good: no regression; the mismatch is still surfaced honestly.
* Bad: sub-floor widths remain unrealizable by window sizing.

## More Information

Extends [ADR 00132](00132-wdio-v9-bidi-attempt-and-classic-revert.md) with a concrete new failure mode
(BiDi socket + recording → stack overflow). Builds on
[ADR 01071](01071-warn-when-a-browser-floors-a-requested-viewport.md). Origin: external report
(Diana Payton, "The Browser Had a Floor I Didn't Know About").
