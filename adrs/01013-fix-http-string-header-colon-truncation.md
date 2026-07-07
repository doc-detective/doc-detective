---
status: accepted
date: 2026-06-30
decision-makers: doc-detective maintainers
---

# Fix httpRequest string-header parser truncating values that contain a colon

## Context and Problem Statement

The `httpRequest` action ([src/core/tests/httpRequest.ts](../src/core/tests/httpRequest.ts)) accepts
`request.headers` as either an object (`{ "Name": "value" }`) or a convenience **string block** —
one `Name: value` header per line, e.g. `"Content-Type: application/json\nAuthorization: Bearer token"`.
When the value is a string, the runner normalizes it to an object before handing it to axios.

The normalizer ([#438](https://github.com/doc-detective/doc-detective/issues/438)) split each line on
**every** colon:

```ts
const [key, value] = header.split(":").map((s) => s.trim());
if (key && value) headers[key] = value;
```

`String.prototype.split(":")` breaks on *all* colons and destructuring keeps only the first two
segments, so any value that itself contains a colon is truncated at its first internal colon. A line
like `X-Callback: https://example.com/cb` parses to key `X-Callback`, value `"https"` — the rest of
the URL is silently dropped. This corrupts every common colon-bearing value: URLs
(`https://…`), timestamps (`Date: … 12:00:00 GMT`), and `host:port` values (`Host: example.com:8080`).

The intended contract was always "one `Name: value` pair per line" (the header name is the token
before the first colon; everything after is the value). This is a parsing bug, not a contract change.
Notably, the **object-shaped** `httpRequest` action definition in `src/common` already parses header
lines with `indexOf(":")` (first-colon split), so the two code paths disagreed.

## Decision Drivers

* Correctly preserve colon-bearing header values (URLs, timestamps, host:port) — the common case.
* Preserve existing behavior for normal `Name: value` lines and for colon-less lines (which have no
  key/value pair and must continue to be skipped).
* Leave the object-form headers path untouched.
* Mirror the `indexOf(":")` approach already used by `src/common`, so both paths agree.

## Considered Options

* **Split on the first colon only via `indexOf(":")`** (slice key/value around the first colon).
* **`split(":")` with a limit / rejoin the tail** (e.g. `split(":")` then `slice(1).join(":")`).
* **Regex capture** (`/^([^:]+):(.*)$/`).

## Decision Outcome

Chosen: **split on the first colon only via `indexOf(":")`**. For each line, find the first colon; a
line with no colon is skipped (`idx === -1`), preserving prior behavior. Otherwise the key is the
trimmed text before the colon and the value is the trimmed remainder of the line — colons in the value
are kept intact:

```ts
const idx = header.indexOf(":");
if (idx === -1) return;
const key = header.slice(0, idx).trim();
const value = header.slice(idx + 1).trim();
if (key && value) headers[key] = value;
```

This mirrors the `src/common` object-shaped action, so the string-block and object header paths now
use the same first-colon rule.

### Consequences

* Good: colon-bearing header values (URLs, `12:00:00 GMT` dates, `host:port`) survive intact.
* Good: normal `Name: value` lines and the colon-less-line-skipped behavior are unchanged.
* Good: the string-block parser now agrees with the object-shaped action in `src/common`.
* Neutral: a value that was previously truncated will now be sent in full. This is a bug fix, so the
  behavior change is intended; no correctly-formed single-colon header is affected.
* Trade-off: `split`+rejoin and regex were rejected as less direct than a first-colon slice.

### Confirmation

A unit test in [test/httprequest-coverage.test.js](../test/httprequest-coverage.test.js) ("keeps colons
in string-header values (splits on the first colon only)") asserts that a string block
`"X-Callback: https://example.com/cb\nAuthorization: Bearer t"` yields the full URL
`https://example.com/cb` for `X-Callback` (not the truncated `https`) and `Bearer t` for
`Authorization`. The pre-existing "parses a string headers block into an object" test continues to
assert normal `Name: value` parsing and the colon-less-line-skipped behavior. The full
`httprequest-coverage` suite passes (62 tests) under the root coverage job.

## Docs impact

The string-header **form** already documented in
[docs/fern/pages/reference/schemas/httprequest.md](../docs/fern/pages/reference/schemas/httprequest.md)
is unchanged — the same `"Name: value\nName: value"` shape is accepted; only the buggy truncation of
colon-bearing values is fixed. That reference example uses colon-free values, so it is not misleading
and needs no edit. This fix restores the documented convenience form's intended behavior; no
user-facing flag, option, output, or documentation page requires changes.

## Pros and Cons of the Options

### Split on the first colon via `indexOf(":")`
* Good: direct; keeps the value verbatim after the first colon; matches the `src/common` action.
* Bad: none of note.

### `split(":")` with a limit / rejoin the tail
* Good: works.
* Bad: extra allocation and a re-join step; easy to get the rejoin separator wrong.

### Regex capture
* Good: single expression.
* Bad: less obvious than a first-colon slice; needs care with leading/trailing whitespace and greedy
  matching.
