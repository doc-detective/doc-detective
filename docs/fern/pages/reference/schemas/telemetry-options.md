---
title: "Telemetry options"
---

Options around sending telemetry for Doc Detective usage.

## Referenced In

- [config](/reference/schemas/config)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
send | boolean | Required. If `true`, sends Doc Detective telemetry. | `true`
userId | string | Optional. Identifier for the organization, group, or individual running Doc Detective. | 

## Examples

```json
{
  "send": true,
  "userId": "example"
}
```
