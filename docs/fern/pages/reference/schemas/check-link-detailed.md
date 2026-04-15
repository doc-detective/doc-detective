---
title: "Check link (detailed)"
---

Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.

## Referenced In

- [checkLink](/reference/schemas/checklink)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
url | string | Required. URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.<br/><br/>Pattern: `(^(http://|https://|/).*|\$[A-Za-z0-9_]+)` | 
origin | string | Optional. Protocol and domain to navigate to. Prepended to `url`. | 
statusCodes | one of:<br/>- integer<br/>- array of integer | Optional. Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails. | ``[200,301,302,307,308]``
headers | one of:<br/>- object<br/>- string | Optional. Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Accepts either a key/value object or a newline-separated string (for example, `X-Api-Key: abc123\nAuthorization: Bearer token`). | `{}`

## Examples

```json
{
  "url": "example",
  "origin": "example",
  "statusCodes": [
    200,
    301,
    302,
    307,
    308
  ]
}
```

```json
{
  "url": "https://portal.example.com/docs",
  "headers": {
    "X-Doc-Detective-Check": "shared-secret"
  }
}
```

## Behavior

Each `checkLink` step:

1. Issues a `GET` request with browser-mimicking default headers (`User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, `Upgrade-Insecure-Requests`, and the `Sec-Fetch-*` / `Sec-Ch-Ua*` Client Hints set) to reduce false 429/403 responses from bot-protection layers.
2. Retries up to 3 attempts with exponential backoff (1s → 2s → 4s) on `429` or `5xx` responses. If the server sends a `Retry-After` header, Doc Detective waits that duration (capped at 10 seconds) instead.
3. If the final response is still `429` or `403`, retries the URL once with a `HEAD` request — some WAFs rate-limit HTML `GET`s but allow `HEAD`s. If the `HEAD` returns an accepted status code, the step passes.
4. Compares the final status code against `statusCodes` and reports PASS or FAIL.

### Sites behind bot protection or WAFs

Some sites (Cloudflare, Akamai, AWS WAF, Imperva, PerimeterX, Vercel deployment protection, etc.) return `403`/`429` to non-browser traffic even when the URL works in your browser. If you hit this, you have three escape hatches:

- **Widen `statusCodes`** to accept the WAF's response code, e.g. `"statusCodes": [200, 301, 302, 307, 308, 403, 429]`. Pragmatic but loses signal — the check only confirms the URL exists.
- **Pass allowlist or bypass headers** via the `headers` field. Common options when you control the site:

  | Provider | Header(s) / cookie |
  | --- | --- |
  | Cloudflare Access | `CF-Access-Client-Id` + `CF-Access-Client-Secret` (service-token pair) |
  | Cloudflare Bot Management | `Cookie: cf_clearance=<value>; __cf_bm=<value>` (obtained from a browser session) |
  | AWS CloudFront / ALB | Custom allowlist header, e.g. `X-Origin-Verify: <shared-secret>` |
  | AWS API Gateway | `x-api-key: <key>` |
  | Vercel deployment protection | `x-vercel-protection-bypass: <token>` (optionally `x-vercel-set-bypass-cookie: true`) |
  | Vercel password protection | `Cookie: _vercel_jwt=<value>` |
  | Generic WAF rule | Any custom header + shared secret you allowlist on the WAF |

- **Use a browser-driven step** (`goTo`) instead of `checkLink` when the URL truly requires JavaScript or a full browser fingerprint.

If you own the site, prefer adding a WAF rule that allowlists a custom header + shared secret (e.g. `X-Doc-Detective-Check`) over trying to mimic a browser.
