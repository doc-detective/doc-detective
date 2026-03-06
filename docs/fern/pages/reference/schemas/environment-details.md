---
title: "Environment details"
---

Environment information for the system running Doc Detective.

## Referenced In

- [config](/reference/schemas/config)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
workingDirectory | string | Optional. The current working directory of the process running Doc Detective. | 
platform | string | Required. The operating system type running Doc Detective.<br/><br/>Accepted values: `linux`, `mac`, `windows` | 
arch | string | Optional. The processor architecture of the system running Doc Detective.<br/><br/>Accepted values: `arm32`, `arm64`, `x32`, `x64` | 

## Examples

```json
{
  "workingDirectory": "example",
  "platform": "linux",
  "arch": "arm32"
}
```
