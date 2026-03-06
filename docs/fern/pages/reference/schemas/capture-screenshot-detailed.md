---
title: "Capture screenshot (detailed)"
---

## Referenced In

- [screenshot](/reference/schemas/screenshot)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
path | string | Optional. File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.<br/><br/>Pattern: `([A-Za-z0-9_-]*\.(png|PNG)$|\$[A-Za-z0-9_]+)` | 
directory | string | Optional. Directory of the PNG file. If the directory doesn't exist, creates the directory. | 
maxVariation | number | Optional. Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.<br/><br/>Minimum: 0. Maximum: 1 | `0.05`
overwrite | string | Optional. If `true`, overwrites the existing screenshot at `path` if it exists. If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.<br/><br/>Accepted values: `true`, `false`, `aboveVariation` | `aboveVariation`
crop | one of:<br/>- string<br/>- object([Crop by element (detailed)](/reference/schemas/crop-by-element-detailed)) | Optional. No description provided. | 

## Examples

```json
{
  "path": "example",
  "directory": "example",
  "maxVariation": 0.05,
  "overwrite": "aboveVariation",
  "crop": "example"
}
```
