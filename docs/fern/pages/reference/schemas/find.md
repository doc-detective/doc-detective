---
title: "find"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
find | one of:<br/>- string<br/>- object([Find element (detailed)](/reference/schemas/find-element-detailed)) | Required. Find an element based on display text or a selector, then optionally interact with it. | 

## Examples

```json
{
  "find": "example"
}
```
