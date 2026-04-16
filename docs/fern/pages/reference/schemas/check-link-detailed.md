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
