---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# One URL pattern and one header shape

Builds on [ADR 01167](01167-validate-returns-the-effective-step.md), which moved step normalization into
`validate()`.

## Context and Problem Statement

goTo, checkLink, and httpRequest each wrote their own URL pattern, and they disagreed:

- goTo accepted any string that contained a variable anywhere, so `"foo $X"` was valid.
- checkLink accepted a variable only as the whole value, so `"$BASE/docs"` was invalid.
- httpRequest accepted neither a path nor a variable prefix it could use.

Request headers came in three shapes:

- checkLink took an object of strings or a string with one header per line.
- httpRequest's `request.headers` took an object of anything or a string.
- openApi took an object of strings only.

A single status code was valid on checkLink but not on httpRequest. checkLink, saveCookie, and loadCookie still
expanded their shorthand in their handlers.

The saveCookie and loadCookie schemas said a `path` without `directory` goes under the output directory. But spec
path resolution rewrote every `path` against the spec's folder first, so the object form wrote beside the spec.
The string form `"x.txt"` went to `outputDir`. A cookie saved by one spec couldn't be loaded by a spec in another
folder unless both named a `directory`.

## Decision Drivers

- One rule per concept, written once in the schema that the docs are generated from.
- A URL that starts with a variable, such as `$BASE_URL/docs`, is the common way to target environments.
- Handlers receive effective steps (ADR 01167).
- A save and a load in different specs must agree on where a cookie file is.
- Don't break a shape that works today unless it can't do what the user meant.

## Considered Options

- **A. One shared URL component and one shared header component, with handlers fed effective steps.**
- **B. Loosen checkLink's pattern to match goTo's and leave the rest.**
- **C. Option A, and also parse header strings into objects inside `validate()`.**

## Decision Outcome

Chosen option: **A**.

- **URLs.** `goTo_v3`'s `components.schemas.url` holds the one pattern, `^(https?://|/|\$[A-Za-z0-9_]+)`. goTo,
  checkLink, and httpRequest reference it for the string form and the object's `url`. A URL is absolute
  `http://` or `https://`, a path that starts with `/`, or a value that starts with a variable.
  - `"foo $X"`, `"example.com"`, and `"docs/x"` are invalid. A spec that has one exits 2.
  - checkLink accepts `"$BASE/docs"`.
  - httpRequest accepts a path. It joins the config's `origin` and appends the config's `originParams`, as goTo and
    checkLink do. Without an `origin`, the step fails:
    ``Couldn't send the request: `/users` is a path, and the config has no `origin`. Set `origin` in the config,
    or use an absolute URL.`` A step-level `origin` and `params` on httpRequest are a separate, later decision.
- **Request headers.** `httpRequest_v3`'s `components.schemas.requestHeaders` is an object of strings or a string
  with one `Name: value` header per line. checkLink's `headers`, httpRequest's `request.headers`, and openApi's
  `headers` reference it. A header value that's an object is invalid, and a number is coerced to a string.
  - Header strings stay as authored in the effective step. They're parsed at run time by one helper,
    `parseHeaders` in `src/core/utils.ts`. It splits each line on its first colon and skips a line with no name or
    value.
  - When httpRequest uses `openApi`, its `request.headers` override the OpenAPI `headers` by name, in either
    shape.
- **Timeouts.** goTo's and httpRequest's `timeout` take `minimum: 1`, in milliseconds, under the timeout rule in
  [ADR 01171](01171-duration-bounds-with-units-kept-in-names.md). A `timeout` of `0` meant "no limit" to axios and
  "time out at once" elsewhere, so `0` and negative values make the spec invalid. This replaces ADR 01167's note
  that an authored `timeout: 0` is kept.
- **Status codes.** httpRequest's `statusCodes` accepts an integer or a list, like checkLink's. The integer branch
  comes first, so Ajv's coercion turns `"200"` into `200`. The normalizer turns a single code into a one-item
  list, so the effective step always holds a list.
- **Normalizers.** checkLink, saveCookie, and loadCookie move their shorthand and defaults out of their handlers
  (ADR 01167). httpRequest's normalizer also expands an `openApi` operation ID to `{ operationId }`.
  - A cookie string that ends in `.txt` is `{ name: <file name without .txt>, path: <string> }`. Any other string
    is `{ name, variable }`, both set to the string.
  - The object form's `variable` now accepts any cookie name, `^[A-Za-z0-9_.-]+$`. That keeps a string such as
    `"__Secure-next-auth.session-token"` valid in its effective form. A variable outside `[A-Za-z0-9_]` still
    can't be read as `$NAME`, so the description says so.
- **Cookie paths.** A saveCookie or loadCookie `path` without `directory` resolves under `outputDir`, the same as
  the string form. A `directory` resolves against the spec file, and a `path` with it resolves against that
  directory. Spec path resolution leaves a cookie `path` without `directory` for the handler to join.
- **Request data.** Spec path resolution no longer rewrites keys such as `path` or `file` inside an httpRequest's
  `request` or `response`. It only skipped the v2 names, `requestData` and the like, before.

### Consequences

- Good: one pattern and one header shape, documented once and enforced on every action that sends a request.
- Good: `$BASE_URL/...` works on checkLink, and httpRequest can use the same `origin` as goTo.
- Good: save and load agree on a cookie file across specs and folders.
- Bad: a goTo or httpRequest URL that only contains a variable, such as `"foo $X"`, now makes its spec invalid.
- Bad: a goTo or httpRequest `timeout` of `0` or less now makes its spec invalid.
- Bad: a cookie object `path` without `directory` moves from the spec's folder to `outputDir`. A spec that relied on
  the old place must add `directory: "."`.
- Bad: generated TypeScript types change names. checkLink's string form is now `CheckLinkSimple`, its object form
  `CheckLinkDetailed`, and the shared URL is `TargetURL`.
- Neutral: header strings appear in reports as authored.

### Confirmation

- `src/common/test/validate.test.js` covers the three URL forms, and the rejected ones, on all three actions. It
  also covers both header shapes on all three fields, an object header value, a single status code, timeouts below
  1, and cookie strings with no valid object form.
- `src/common/test/normalize.test.js` covers each shorthand, the status-code list, idempotence, and that a
  normalized step validates again.
- `test/cookie-paths.test.js` covers path resolution and the save and load handlers. `test/httprequest-coverage.test.js`
  covers the origin join, its failure, and header merging.
- Fixtures: `http/url-and-headers.spec.json`, `http/cookie-paths.spec.json`, and `cli/url-and-headers.spec.json`.
- `test/shorthand-ratchet.test.js` drops to 12.

## Pros and Cons of the Options

### A. Shared components, handlers fed effective steps

- Good: each rule lives in one schema component.
- Good: fixes the httpRequest path and checkLink variable gaps together.
- Bad: rejects some URLs that validated before.

### B. Loosen checkLink only

- Good: not breaking.
- Bad: keeps three patterns, and goTo keeps accepting URLs that can't be navigated to.

### C. Also parse header strings in validate()

- Good: reports would always show header objects.
- Bad: before substitution, a line that's only a variable, such as `$EXTRA_HEADERS`, has no colon and would be
  dropped. Normalizers never touch `$VAR` values.
- Bad: config and spec-level openApi headers aren't normalized steps, so run time would still need the parser.
