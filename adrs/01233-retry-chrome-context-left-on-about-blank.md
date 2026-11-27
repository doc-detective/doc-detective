---
status: accepted
date: 2026-11-27
decision-makers: hawkeyexl
---

# Retry a Chrome context whose goTo never left `about:blank`

Amends [ADR 01084](01084-retry-unnavigated-context.md). Follows from
[ADR 01219](01219-bidi-socket-per-browser-chrome-first.md) and [ADR 01225](01225-mock-requests.md).

## Context and Problem Statement

On `windows-latest`, a `goTo` after a `mockRequest` step sometimes never finishes:
``Couldn't open URL: Command browsingContext.navigate with id 19 timed out after 180000ms!``
The auto-screenshot before it times out running its script, the page stays on `about:blank`, and
the context ends with `Context FAILed on a live, non-error-page session (url=about:blank); not
retried.` It hit `test/core-artifacts/http/mock-request.spec.json` on unrelated PRs and the
docs-as-tests `mockRequest` examples. The same test passes in another shard.

What we found:

* Chrome's BiDi mapper (chromium-bidi `CdpTarget.toggleFetchIfNeeded`) enables CDP `Fetch` with
  `urlPattern: '*'` for the request and response stages as soon as any BiDi intercept exists.
  Every request of the session, the top-level navigation included, is paused inside Chrome. Requests
  no intercept matches are continued by the mapper itself.
* The hang hits mocks whose URL can't match the page. `http-mock-url-exact` mocks
  `http://localhost:8092/api/plans`; the BiDi intercept carries that host, port and path, so
  webdriverio never sees the `/` navigation as blocked. Only the mapper could continue it. The loss
  is inside Chrome, not in Doc Detective or webdriverio.
* The navigate command's result only arrives about six minutes later, when the session is torn down.
  A paused request that nothing continues wedges the session: in a local emulation, re-issuing the
  navigation and removing the intercept both hung too.
* 276 local runs of the mock tests on Windows, under CPU load and up to 8 concurrent runners,
  didn't reproduce it.

ADR 01084 already retries a context whose browser never left its initial blank document, on a
fresh session. It matches only Chromium's `data:,`. ADR 01219 gave every Chrome session a BiDi
socket, and those sessions start on `about:blank`, so the retry no longer fires for Chrome.

## Decision Drivers

* A flake caused by the browser shouldn't fail a run when a fresh session passes.
* A genuine failure on a page the test meant to open must still FAIL.
* No change to the `mockRequest` contract (ADR 01225).

## Considered Options

1. **Count `about:blank` as the initial document for the retry, unless a `goTo` targeted it** (chosen).
2. **Re-issue a navigation that stalls while mocks are active.**
3. **Remove and re-add the intercepts when a navigation stalls.**
4. **Answer mocks without network interception (a page script that patches `fetch`).**

## Decision Outcome

Chosen option 1. When a context FAILs, its primary session is alive and not on an error page, and
it's still on `about:blank`, the context is retried on a fresh session, as for `data:,`. That
holds only if the context ran a `goTo` and none of its `goTo` steps targeted `about:blank`.

`isPageUnnavigated` takes the flag; `issueNavigation` and `getRunner`'s guard don't pass it, so
re-issuing a navigation still only happens on `data:,`. A `goTo` to `about:blank` doesn't fail.

### Consequences

* Good: the paused-navigation flake costs a retry, not a failed run. The `retries` config applies,
  default `1`.
* Good: Chrome regains the ADR 01084 retry for any navigation that never left the blank document.
* Bad: the retry runs after the stuck navigation's 180-second BiDi timeout.
* Neutral: a context that FAILs on `about:blank` without having targeted it, for example a script
  that set `location` to `about:blank`, retries once.

### Confirmation

* `test/core-utils-coverage.test.js`: `classifyContextRetry` retries a primary on `about:blank`
  only with `aboutBlankIsInitial`, and never when the context didn't navigate.
* `test/core-artifacts/http/mock-request.spec.json`: `mock-request-navigations` runs two
  navigations under a mock whose URL can't match them.

## Pros and Cons of the Options

### Option 1: count `about:blank` for the retry

* Good: reuses the retry path that already exists, and changes no contract.
* Bad: doesn't stop Chrome from losing the request. It recovers on a fresh session.

### Option 2: re-issue the navigation

* Bad: didn't help. In a local emulation of a paused request nothing continues, the second
  navigation and a later `network.continueRequest` hung as well.

### Option 3: remove and re-add the intercepts

* Bad: didn't help. Removing the intercept left the navigation paused in the same emulation.

### Option 4: patch `fetch` in the page

* Good: no network interception, so no navigation is ever paused.
* Bad: misses requests that don't use `fetch` or `XMLHttpRequest`, which narrows ADR 01225.
