---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# Save and load browser state

## Context and Problem Statement

Teams that capture screenshots behind a sign-in want to sign in once and reuse the session in
every test. Playwright does this with `storageState`: one JSON file holds the site's cookies and
`localStorage`. Doc Detective had `saveCookie` and `loadCookie` ([ADR 00123](00123-cookie-actions.md)),
which move **one named cookie** in Netscape format. Many apps keep a session in several cookies, or
in `localStorage`, so one cookie doesn't carry the sign-in.

The cookie handlers also held all the logic inline. That covers resolving the file, reading
cookies, and turning a saved cookie into one WebDriver accepts. Their Netscape writer dropped
`httpOnly` and `sameSite`, even though the reader already parsed both, and their messages didn't
follow the message style.

How should Doc Detective save and restore a whole sign-in, and how does that relate to the cookie
actions?

## Decision Drivers

* One step saves a whole sign-in, and one step restores it.
* Reuse files Playwright already writes, and let Playwright read ours.
* Classic WebDriver only (WebDriver BiDi is off, [ADR 00132](00132-wdio-v9-bidi-attempt-and-classic-revert.md)), so the browser only exposes the open site's cookies and storage.
* One code path for cookie handling, so a fix lands in every action at once.
* Paths follow the cookie rule ([ADR 01174](01174-one-url-pattern-and-one-header-shape.md)): a `path` without `directory` joins `outputDir`, and a `directory` resolves against the spec file.

## Considered Options

* **A. New `saveState` and `loadState` actions that use Playwright's `storageState` JSON, on helpers shared with the cookie actions** (chosen).
* **B. Extend `saveCookie` and `loadCookie` with an "all cookies" mode.**
* **C. A Doc Detective-specific state format.**

## Decision Outcome

Chosen option: **A**.

### Interface

```json
{ "saveState": "auth.json" }
{ "saveState": { "path": "auth.json", "directory": "../.auth", "overwrite": true } }
{ "loadState": "auth.json" }
{ "loadState": { "path": "auth.json", "directory": "../.auth" } }
```

| Action | Key | Type | Default | Required | Effect |
|---|---|---|---|---|---|
| both | string form | path ending in `.json` | | | Shorthand for `{ "path": ... }` |
| both | `path` | string ending in `.json` | | yes | The state file |
| both | `directory` | string | `outputDir` | no | Where a relative `path` resolves. A relative `directory` resolves against the spec file |
| `saveState` | `overwrite` | boolean | `false` | no | Replace an existing file |

* **`saveState`** writes every cookie `getCookies()` returns and the open origin's `localStorage`,
  in Playwright's `storageState` shape:
  `{ "cookies": [{ name, value, domain, path, expires, httpOnly, secure, sameSite }], "origins": [{ origin, localStorage: [{ name, value }] }] }`.
  `expires` is the WebDriver `expiry`, or `-1` for a session cookie. An empty `localStorage` writes
  no origin.
* **`loadState`** applies the cookies whose domain fits the open host, and the `localStorage`
  entries for the open origin. It needs a `goTo` first, like `loadCookie`. Follow it with another
  `goTo` so the app reads the state.
* **Outputs**, for both: `path` (absolute), `cookies` and `localStorage` (counts of what was saved
  or applied).
* **Limits.** One `saveState` captures one site, since classic WebDriver only sees the open site.
  `sessionStorage` isn't saved, which matches Playwright.

| Case | Result | Message |
|---|---|---|
| The file exists and `overwrite` isn't set | FAIL | ``Couldn't save state: `/abs/auth.json` exists. Set `overwrite` to `true` to replace it.`` |
| No site is open (`about:blank`, `data:`) on save | FAIL | ``Couldn't save state: no site is open. Use `goTo` first.`` |
| No site is open on load | FAIL | ``Couldn't load state: no site is open. Use `goTo` first.`` |
| The file is missing | FAIL | ``Couldn't load state: `/abs/auth.json` doesn't exist.`` |
| The file isn't JSON with a `cookies` or `origins` list | FAIL | ``Couldn't load state: `/abs/auth.json` isn't a valid state file.`` |
| Nothing in the file fits the open page | FAIL | ``Couldn't load state: `/abs/auth.json` has no data for `https://app.example.com`. Use `goTo` to open that site first.`` |
| The page leaves the origin before storage is written | FAIL | ``Couldn't load state: the page left `https://app.example.com` before its storage was restored.`` |
| The page leaves the origin while state is read | FAIL | ``Couldn't save state: the page left `https://app.example.com` while its state was read.`` |

Robustness rules:

* `loadState` validates every record before it touches the browser: each cookie and each
  `localStorage` entry has a string `name` and `value`, and each origin has a string `origin` and a
  `localStorage` list. A file with only cookies, or only origins, is valid.
* The `localStorage` script takes the expected origin and checks `location.origin` itself, so a page
  that navigated away gets nothing. Storage is written before cookies, so that failure sets neither.
* `saveState` reads the origin and `localStorage` in one script, and fails if that origin isn't the
  one it read first.
* `saveState` writes with the `wx` flag unless `overwrite` is `true`, so an existing file can't be
  replaced between a check and the write. The file is created with mode `0600`, because it holds
  live session tokens.

### Shared code path

`src/core/tests/browserState.ts` holds what the four actions share: `resolveStatePath`,
`readCookies`, `toDriverCookie` (the `sameSite` and `secure` rules, the localhost domain, and the
expiry), `applyCookies`, and the `localStorage` and state-file helpers. The cookie actions keep
their keys and their Netscape format. They still cover a single named cookie, including the
environment-variable form.

### Cookie fixes on the shared path

* The Netscape writer now marks an `httpOnly` cookie with curl's `#HttpOnly_` domain prefix, so a
  save-then-load round trip keeps it. The file stays at the standard 7 columns, because curl
  rejects a row with more. The format has no standard place for `sameSite`, so a cookie file
  doesn't keep it, and a loaded cookie gets the default `Lax`. A `saveState` file keeps `sameSite`.
* An expired cookie is skipped on load, never set as a session cookie. `loadCookie` fails with
  ``Couldn't load cookie: `sid` has expired.``, and `loadState` doesn't apply it, as the Netscape
  reader already did.
* The cookie messages follow the message style, for example
  ``Couldn't load cookie: `/abs/session.txt` doesn't exist.``. No status changes.

### Consequences

* Good, because one step saves and one restores a whole sign-in, `localStorage` included.
* Good, because Playwright `storageState` files work both ways.
* Good, because cookie handling lives in one place.
* Neutral, because the post-run hint for repeated sign-ins now points at `saveState`/`loadState`.
* Bad, because a sign-in that spans several sites (SSO) needs one `goTo` and one `saveState` per
  site. Only the open site's state is visible over classic WebDriver.
* Bad, because a cookie file loses `sameSite`. Use `saveState` when it matters.
* Neutral, because `loadState` restores what the file holds but can't tell whether the server still
  accepts the session. A test checks it with a `find` for something only a signed-in reader sees.

### Confirmation

* `test/browser-state.test.js` covers the shared helpers with a fake driver, and the Netscape round trip.
* `test/state.test.js` covers the file shape, a Playwright-written file, path resolution, and each message.
* `test/core-artifacts/sessions/state.spec.json` runs both forms in headless Chrome and Firefox
  against the 8092 test server. `test/core-core.test.js` asserts the expected FAILs.
* `test/core-artifacts/http/cookie-paths.spec.json` and `cookie-test.spec.json` still pass.

## Pros and Cons of the Options

### A. `saveState` and `loadState` on shared helpers

* Good, because the whole sign-in moves in one file, in a format other tools read.
* Good, because the cookie actions keep their contract.
* Bad, because there are now two ways to move cookies. The docs say when to use which.

### B. An "all cookies" mode on the cookie actions

* Good, because there are no new actions.
* Bad, because it can't carry `localStorage`, and Netscape files can't hold it.
* Bad, because `name` is required today, so the mode changes the cookie schemas' contract.

### C. A Doc Detective-specific format

* Good, because it could hold more, such as `sessionStorage`.
* Bad, because Playwright files wouldn't work, which is the main reason teams asked.
