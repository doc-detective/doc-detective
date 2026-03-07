---
title: "loadCookie"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
loadCookie | one of:<br/>- string<br/>- object([Load cookie (detailed)](/reference/schemas/load-cookie-detailed)) | Required. Load a specific cookie from a file or environment variable into the browser. | 

## Examples

```json
{
  "loadCookie": "example"
}
```
