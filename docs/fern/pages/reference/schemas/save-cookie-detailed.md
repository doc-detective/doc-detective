---
title: "Save cookie (detailed)"
---

## Referenced In

- [saveCookie](/reference/schemas/savecookie)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. Optional self-describing schema URI for linters | 
name | string | Required. Name of the specific cookie to save.<br/><br/>Pattern: `^[A-Za-z0-9_.-]+$` | 
variable | string | Optional. Environment variable name to store the cookie as JSON string.<br/><br/>Pattern: `^[A-Za-z_][A-Za-z0-9_]*$` | 
path | string | Optional. File path to save the cookie, relative to directory. Uses Netscape cookie format. | 
directory | string | Optional. Directory to save the cookie file. If not specified, uses output directory. | 
overwrite | boolean | Optional. Whether to overwrite existing cookie file. | `false`
domain | string | Optional. Specific domain to filter the cookie by (optional). | 

## Examples

```json
{
  "$schema": "example",
  "name": "example",
  "variable": "example",
  "path": "example",
  "directory": "example",
  "overwrite": false,
  "domain": "example"
}
```
