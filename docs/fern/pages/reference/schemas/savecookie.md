---
title: "saveCookie"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
saveCookie | one of:<br/>- string<br/>- object([Save cookie (detailed)](/reference/schemas/save-cookie-detailed)) | Required. Save a specific browser cookie to a file or environment variable for later reuse. | 

## Examples

```json
{
  "saveCookie": "example"
}
```
