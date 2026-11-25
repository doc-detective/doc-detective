---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Mock browser requests with a `mockRequest` step

Builds on [ADR 01216](01216-bidi-socket-per-browser-chrome-first.md), which opens the BiDi socket
on every session of a browser in `BIDI_BROWSERS`: Chrome only, for now.

## Context and Problem Statement

Screenshots of pages that show live data differ on every run. "Next invoice: 3 December" or an
account balance changes. A visual comparison then fails or warns for a reason unrelated to the
docs. Playwright users fix this by routing the request to a fixed response. Doc Detective
has no way to answer a browser's request.

webdriverio's `browser.mock()` intercepts requests through WebDriver BiDi `network.addIntercept`.
ADR 01216 opens BiDi on every Chrome session. How should a spec answer a
browser request with a fixed response?

## Decision Drivers

* Stable screenshots for Wren (W2), and error-state tests for Diego (D2).
* Element commands stay on classic WebDriver (ADR 00132).
* Browsers outside `BIDI_BROWSERS` skip clearly, never fail.
* One shared shape: the schema in common is the only contract.

## Considered Options

1. **A `mockRequest` step on webdriverio `browser.mock()`** (chosen).
2. **A test- or context-level `mocks` list.**
3. **A proxy server in front of the browser.**

## Decision Outcome

Chosen option 1.

### Interface

```json
{ "mockRequest": { "url": "**/api/invoices*", "response": { "body": { "next": "2026-12-03" } } } }
{ "mockRequest": { "url": "https://api.example.com/user", "method": "GET",
                   "response": { "statusCode": 200, "headers": { "content-type": "application/json" },
                                 "bodyPath": "fixtures/user.json" } } }
```

| Key | Type | Default | Required | Effect |
|---|---|---|---|---|
| `url` | glob string | | yes | Request URLs to answer. A pattern starting `http` matches the whole URL; any other matches the path. |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` | any | no | Answer only this method. |
| `response.statusCode` | integer, 100–599 | `200` | no | Response status. The runner applies the default; the schema has none. |
| `response.headers` | object of strings | none | no | Response headers. |
| `response.body` | string, object or array | empty | no | Body. An object or array is sent as JSON. |
| `response.bodyPath` | path, relative to the spec | | no | File sent as the body, as bytes. |

| Case | Result | Message |
|---|---|---|
| `hasBidi(<browser>)` is `false` | SKIPPED | ``Skipped: `safari` can't mock requests.`` (`webkit` is named `safari`) |
| `bodyPath` can't be read | FAIL | ``Couldn't read `bodyPath` `<absolute path>`.`` |
| Both `body` and `bodyPath` | schema error | ``set `body` or `bodyPath`, not both.`` |
| The session has no BiDi socket (defensive) | FAIL | ``Couldn't mock requests to `<url>`. The browser session has no WebDriver BiDi connection.`` |

Output: `outputs.matched`, the number of requests already answered for that `url` and `method`,
counting the mocks this step replaced.

### Behavior

* The mock answers before the request is sent (`fetchResponse: false`). The server never sees it.
* It lasts from its step until the test ends. The end-of-context cleanup restores every mock
  before the session closes.
* A later `mockRequest` for the same `url` and `method` replaces the earlier one. webdriverio
  restores the old intercept itself when the definition matches.
* The step runs where ADR 01216's `hasBidi(browserName)` is `true`. Every session of such a
  browser has the socket, so the step needs nothing from capabilities. Elsewhere it's SKIPPED.
* A session without the socket despite `hasBidi` FAILs the step. That's a defensive check.
* A relative `bodyPath` resolves against the spec file at detection, like other spec paths, and
  honors `relativePathBase`. `resolvePaths` doesn't descend into `response`, so it handles this
  key on its own. A step from `getRunner()` resolves against the working directory.

### Consequences

* Good: stable screenshots of live data in Chrome, with no proxy and no app changes.
* Good: one helper, `hasBidi`, decides where every BiDi feature runs.
* Neutral: `outputs.matched` is counted when the step runs. A count at the end of the test isn't
  reported.
* Bad: Firefox and Safari skip until they join `BIDI_BROWSERS`.

### Confirmation

* `src/common/test/validate.test.js`: valid shapes; a missing `url`, an unknown method, an
  out-of-range status, unknown keys, and both `body` and `bodyPath` are rejected. No `statusCode`
  default is added.
* `test/mockRequest.test.js`: skip messages, the default `200`, method filter, headers, `bodyPath`
  bytes, missing `bodyPath`, no BiDi, replacement counting, cleanup, `bodyPath` resolution and
  `hasBidi`.
* `test/core-artifacts/http/mock-request.spec.json`: a JSON body, a body file, a method filter, a
  replacement with its count, and the Firefox and Safari skips.

## Pros and Cons of the Options

### Option 1: a `mockRequest` step on `browser.mock()`
* Good: reads like every other step, and fits the step order: mock, then `goTo`.
* Good: webdriverio handles URL patterns, replacement and restore.
* Bad: BiDi only, so Chrome only for now.

### Option 2: a test- or context-level `mocks` list
* Good: declares every mock up front.
* Bad: a new non-step key on tests and contexts, and no way to change a mock mid-test.

### Option 3: a proxy server
* Good: works in every browser.
* Bad: certificates for HTTPS, a new process to manage, and browser proxy settings per engine.
