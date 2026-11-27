---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Answer mocked requests in sequence, and replay a HAR file

Amends [ADR 01225](01225-mock-requests.md), which added `mockRequest` with one fixed `response`.

## Context and Problem Statement

`mockRequest` answers every matching request with the same response. Docs that show a job
moving from "running" to "done", or a page that polls, need a different answer on each call.
Authors who already recorded a session as a HAR file want to replay it rather than restate
every response by hand. Playwright offers both (`route.fulfill` in a handler, and
`routeFromHAR`), so authors reach for it instead.

How should a `mockRequest` step answer in sequence, and replay a HAR file?

## Decision Drivers

* Diego (D2): error and state-transition tests without a backend.
* Existing `response`-only steps keep working unchanged.
* One shared shape: the schema in common is the only contract.
* `outputs.matched` keeps its meaning.

## Considered Options

1. **`responses` and `harPath` keys on `mockRequest`** (chosen).
2. **A separate `replayHar` step.**
3. **Let `response` take an array.**

## Decision Outcome

Chosen option 1.

### Interface

```json
{ "mockRequest": { "url": "**/api/jobs/1", "responses": [
    { "body": { "status": "running" } },
    { "body": { "status": "done" } } ] } }
{ "mockRequest": { "harPath": "fixtures/app.har", "url": "**/api/**" } }
```

| Key | Type | Default | Required | Effect |
|---|---|---|---|---|
| `responses` | non-empty array of `response` objects | none | no | Answers each matching request with the next entry. The last entry answers every later request. |
| `harPath` | path, relative to the spec (`relativePathBase` honored) | none | no | Answers requests with the recorded responses in a HAR 1.2 file. |
| `url` | glob | | yes, unless `harPath` is set | With `harPath`, keeps only the HAR entries whose URL matches. Omit it to use every entry. |
| `method` | enum | any | no | With `harPath`, also keeps only entries with this method. |

`response`, `responses`, and `harPath` are mutually exclusive. Setting more than one is a schema
error: ``set one of `response`, `responses`, or `harPath`.`` A step with neither `url` nor
`harPath` is a schema error: ``set `url` or `harPath`.``

HAR mapping:

* Each entry's exact URL and method become one mock. The URL is matched literally, query string
  included.
* Repeated URL and method pairs become a sequence, in file order.
* A body with `encoding: "base64"` is decoded. An entry without `content.text` sends an empty
  body. The recorded status and headers are sent as recorded, except `content-length`,
  `content-encoding`, and `transfer-encoding`, which describe the original wire format.
* Requests that aren't in the HAR reach the network.

| Case | Result | Message |
|---|---|---|
| `harPath` can't be read | FAIL | ``Couldn't read `harPath` `<absolute path>`.`` |
| `harPath` isn't HAR JSON (`log.entries` isn't an array) | FAIL | ``Couldn't parse `harPath` `<absolute path>`: it isn't HAR JSON.`` |
| No entry matches `url` and `method` | FAIL | ``Couldn't find HAR entries matching `<url>` in `<absolute path>`.`` (`*` when `url` is omitted) |
| A `responses[].bodyPath` can't be read | FAIL | ``Couldn't read `bodyPath` `<absolute path>`.`` |

Firefox and Safari skip, as in ADR 01225.

`outputs.matched`: with `responses`, the count for this `url` and `method`, as before. With
`harPath`, the total across the mocks the HAR created.

### Implementation

* Sequences use one sticky `mock.respond()` whose body, status, and headers are functions of a
  per-mock counter. webdriverio 10.2.0 can't mix `respondOnce` entries with a sticky `respond`:
  `respond` replaces the whole queue, and `respondOnce` drops the sticky entry
  (`#setOverwrite` in `webdriverio/build/node.js`). webdriverio calls the body function first, then
  headers, then status, synchronously for each request, so all three read the same entry.
* `harToMocks(har, { url, method })` in `src/core/utils.ts` is pure. It groups the entries and
  matches the `url` glob with the same rules as webdriverio: `**` collapses to `*`, a pattern
  starting `http` matches the whole URL, any other pattern matches the path.
* Each HAR mock is registered with a literal `URLPattern`, so `?`, `:` and `*` in a recorded URL
  match themselves.
* `resolvePaths` resolves `harPath` and every `responses[].bodyPath` against the spec, like
  `response.bodyPath`.

### Consequences

* Good: polling pages and multi-step flows are testable in Chrome without a backend.
* Good: a recorded HAR replaces hand-written responses.
* Neutral: a HAR replay creates one intercept per URL and method. Large HAR files should be
  filtered with `url`.
* Bad: Firefox and Safari still skip.

### Confirmation

* `src/common/test/validate.test.js`: `responses`, `harPath`, the mutual exclusion, the missing
  `url`, and an empty `responses`.
* `test/mockRequest.test.js`: order, the last entry sticking, the `matched` count, each error,
  the HAR replay, `harToMocks` grouping, base64 bodies and filters, and path resolution.
* `test/core-artifacts/http/mock-request-sequences.spec.json`: a three-call sequence, a HAR
  replay, a filtered HAR replay, and the Firefox and Safari skips.

## Pros and Cons of the Options

### Option 1: `responses` and `harPath` on `mockRequest`
* Good: one step for every way to answer a request, and the step order stays mock, then `goTo`.
* Good: replacement, cleanup and `outputs.matched` keep working.
* Bad: three mutually exclusive keys need a schema rule and its message.

### Option 2: a separate `replayHar` step
* Good: a narrower schema per step.
* Bad: a second step that shares every rule with `mockRequest`: skips, replacement, cleanup.

### Option 3: `response` takes an array
* Good: no new key.
* Bad: one key with two shapes is harder to read and to describe in the schema, and the
  singular name would hold a list.
