---
title: "Go to URL (detailed)"
---

Navigate to an HTTP or HTTPS URL.

## Referenced In

- [goTo](/reference/schemas/goto)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
url | string | Required. URL to navigate to. Can be a full URL or a path. If a path is provided and `origin` is specified, prepends `origin` to `url`. If a path is provided but `origin` isn't specified, attempts to navigate relative to the current URL, if any.<br/><br/>Pattern: `(^(http://|https://|/).*|\$[A-Za-z0-9_]+)` |
origin | string | Optional. Protocol and domain to navigate to. Prepended to `url`. |
params | object | Optional. Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. | `{}` 

## Examples

```json
{
  "url": "example",
  "origin": "example"
}
```

```json
{
  "url": "/dashboard",
  "origin": "https://my-app.com",
  "params": {
    "__clerk_testing_token": "$CLERK_TESTING_TOKEN"
  }
}
```
