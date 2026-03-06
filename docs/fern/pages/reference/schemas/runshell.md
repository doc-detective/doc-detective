---
title: "runShell"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
runShell | one of:<br/>- string<br/>- object([Run shell command (detailed)](/reference/schemas/run-shell-command-detailed)) | Required. Perform a native shell command. | 

## Examples

```json
{
  "runShell": "example"
}
```
