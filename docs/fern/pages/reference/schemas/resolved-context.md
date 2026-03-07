---
title: "Resolved context"
---

## Referenced In

- [test](/reference/schemas/test)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
platform | string | Optional. Platform to run the test on. This is a resolved version of the `platforms` property. | 
browser | object([Browser](/reference/schemas/browser)) | Optional. Browser configuration. | 
openApi | array of unknown | Optional. No description provided. | 
steps | array of object(step) | Optional. Steps to perform as part of the test. Performed in the sequence defined. If one or more actions fail, the test fails. By default, if a step fails, the test stops and the remaining steps are not executed. | 

## Examples

```json
{
  "platform": "example",
  "browser": {},
  "openApi": [],
  "steps": []
}
```
