---
status: rejected
date: 2026-11-26
decision-makers: hawkeyexl
---

# Patch a real response with `mockRequest` `response.patch`

Builds on [ADR 01225](01225-mock-requests.md) and [ADR 01229](01229-mock-request-sequences-and-har-replay.md).

## Context and Problem Statement

`mockRequest` replaces a response outright. Often an author wants the real response with one field
changed: a user's `plan` set to `pro`, or a date pinned for a screenshot. Playwright does this by
fetching the real response in a route handler and fulfilling it with an edited body.

The proposed interface:

```json
{ "mockRequest": { "url": "**/api/user", "response": { "patch": { "plan": "pro" } } } }
```

`response.patch` would fetch the real response and apply an RFC 7386 JSON merge patch to its body.

webdriverio's `mock.respond(fn)` is synchronous and never sees the real body, so its mock API
can't do this. Can Doc Detective patch a real response another way, alongside webdriverio's own
mocks in Chrome?

## Decision Drivers

* Diego (D2): realistic data with one field pinned, without restating the whole response.
* A `patch` mock must coexist with every other `mockRequest` in the same test.
* No new process, proxy, or certificate setup.

## Considered Options

1. **A raw WebDriver BiDi intercept** at `beforeRequestSent`, with an async handler that
   re-fetches the request from Node, patches the body, and answers with `network.provideResponse`.
2. **Replace webdriverio's mocks with Doc Detective's own BiDi interception layer** for every
   `mockRequest`.
3. **Don't add `patch`** (chosen).

## Decision Outcome

Chosen option 3: don't add `response.patch` now. Option 1 failed its spike, and option 2 is a
rewrite of ADR 01225's mechanism that this feature alone doesn't justify.

### The spike

Chrome 158.0.8127.88, chromedriver 158.0.8127.88, webdriverio 10.2.0, through `getRunner()`, against
the 8092 test server. The spike added a raw `network.addIntercept` at `beforeRequestSent` for
`/api/patched`. Its handler copies the request's headers and cookies and fetches the request from
Node. It then merge-patches `{ "plan": "pro", "removed": null }` into the JSON and calls
`network.provideResponse`.

| Run | Patched request | webdriverio mock | Pass-through request |
|---|---|---|---|
| Raw intercept alone | Patched: `{"kept":"2","extraField":"added by server","plan":"pro"}`; cookie `session=abc123` forwarded; real headers kept | none | Real response with headers |
| Plus `browser.mock("http://localhost:8092/api/mocked")` (exact URL) | Patched | Answered `from-wdio` | Real response with headers |
| Plus `browser.mock("**/api/mocked")` (glob) | **Not patched.** The page got the real body `{"removed":"1","kept":"2",...}` before the handler's `provideResponse` | Answered `from-wdio` | Real body, **no response headers** |

The mechanism works on its own. It fails beside a glob mock, the documented and most common
`mockRequest` form. webdriverio can't express a `*` path in a BiDi URL pattern, so a glob mock adds
an intercept with no path. That intercept blocks every request. webdriverio's handler continues each
blocked request that its own pattern doesn't match, at once. It continues the request the patch
handler holds before the async Node fetch returns. A request blocked by two intercepts is released
by whichever client answers first, so the patch is lost.

### Consequences

* Good: no feature that silently does nothing when another mock is active.
* Bad: authors still restate a whole response to change one field.
* Neutral: revisit when webdriverio's `respond` accepts an async handler with the real body, or when
  Doc Detective owns its BiDi interception (option 2).

### Confirmation

The spike script and its three runs above. No code ships.

## Pros and Cons of the Options

### Option 1: a raw BiDi intercept beside webdriverio's mocks
* Good: small. One intercept, one async handler, and a pure merge-patch helper.
* Bad: loses the race to any webdriverio glob mock in the same session, as the spike showed.
* Bad: BiDi's `beforeRequestSent` carries no request body, so a patched `POST` couldn't resend its
  payload.

### Option 2: Doc Detective's own BiDi interception for every mock
* Good: one handler decides every blocked request, so `patch`, `response`, `responses`, and
  `harPath` can't race.
* Bad: rewrites ADR 01225's mechanism, URL matching, replacement, and cleanup, which webdriverio
  handles today.

### Option 3: don't add `patch`
* Good: nothing ships that only works in some tests.
* Bad: the Playwright gap stays open for this case.
