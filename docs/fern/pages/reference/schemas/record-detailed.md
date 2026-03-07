---
title: "Record (detailed)"
---

## Referenced In

- [record](/reference/schemas/record)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
path | string | Optional. File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.<br/><br/>Pattern: `([A-Za-z0-9_-]*\.(mp4|webm|gif)$|\$[A-Za-z0-9_]+)` | 
directory | string | Optional. Directory of the file. If the directory doesn't exist, creates the directory. | 
overwrite | string | Optional. If `true`, overwrites the existing recording at `path` if it exists.<br/><br/>Accepted values: `true`, `false` | 

## Examples

```json
{
  "path": "example",
  "directory": "example",
  "overwrite": "true"
}
```
