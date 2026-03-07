---
title: "record"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
record | one of:<br/>- string<br/>- object([Record (detailed)](/reference/schemas/record-detailed))<br/>- boolean | Required. Start recording the current browser viewport. Must be followed by a `stopRecord` step. Only runs in Chrome browsers when they are visible. Supported extensions: [ '.mp4', '.webm', '.gif' ] | 

## Examples

```json
{
  "record": "example"
}
```
