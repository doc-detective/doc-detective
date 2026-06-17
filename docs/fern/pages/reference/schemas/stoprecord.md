---
title: "stopRecord"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
stopRecord | one of:<br/>- boolean<br/>- null<br/>- string<br/>- object | Required. Stop a recording started by an earlier `record` step. With no target (`true`/`null`), stops the most recently started recording that is still active (LIFO). To stop a specific recording when several overlap, target it by name with a string (`stopRecord: "<name>"`) or an object (`stopRecord: { "name": "<name>" }`). | 

## Examples

```json
{
  "stopRecord": true
}
```

```json
{
  "stopRecord": "demo"
}
```

```json
{
  "stopRecord": {
    "name": "demo"
  }
}
```
