---
title: "Common"
---

## Referenced In

- [Markup definition](/reference/schemas/markup-definition)
- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. JSON Schema for this object.<br/><br/>Accepted values: `https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json` | 
stepId | string | Optional. ID of the step. | 
description | string | Optional. Description of the step. | 
unsafe | boolean | Optional. Whether or not the step may be unsafe. Unsafe steps may perform actions that could modify the system or environment in unexpected ways. Unsafe steps are only performed within Docker containers or if unsafe steps are enabled with the `allowUnsafeSteps` config property or the `--allow-unsafe` flag. | `false`
outputs | object(Outputs (step)) | Optional. Outputs from step processes and user-defined expressions. Use the `outputs` object to reference outputs in subsequent steps. If a user-defined output matches the key for a step-defined output, the user-defined output takes precedence. | ``{}``
variables | object(Variables (step)) | Optional. Environment variables to set from user-defined expressions. | ``{}``
breakpoint | boolean | Optional. Whether or not this step should act as a breakpoint when debugging is enabled. When `true`, execution will pause at this step when debug mode is enabled. | `false`

## Examples

```json
{
  "$schema": "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/step_v3.schema.json",
  "stepId": "example",
  "description": "example",
  "unsafe": false,
  "outputs": {},
  "variables": {},
  "breakpoint": false
}
```
