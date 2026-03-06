---
title: "Markup definition"
---

## Referenced In

- [File type (custom)](/reference/schemas/file-type-custom)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
name | string | Optional. Name of the markup definition | 
regex | one of:<br/>- string<br/>- array of string | Optional. Regular expressions to match the markup type. | 
batchMatches | boolean | Optional. If `true`, all matches are combined into a single string. | `false`
actions | one of:<br/>- string<br/>- array of one of: string, object(step) | Optional. Actions to perform when the markup type is detected. | 

## Examples

```json
{
  "name": "example",
  "batchMatches": false,
  "actions": "checkLink"
}
```
