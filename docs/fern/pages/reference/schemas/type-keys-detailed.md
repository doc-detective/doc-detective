---
title: "Type keys (detailed)"
---

## Referenced In

- [Find element (detailed)](/reference/schemas/find-element-detailed)
- [type](/reference/schemas/type)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
keys | one of:<br/>- string<br/>- array of string | Required. Sequence of keys to enter. | 
inputDelay | number | Optional. Delay in milliseconds between each key press during a recording | `100`
selector | string | Optional. Selector for the element to type into. If not specified, the typing occurs in the active element. | 

## Examples

```json
{
  "keys": "example",
  "inputDelay": 100,
  "selector": "example"
}
```
