---
title: "Load cookie (detailed)"
---

## Referenced In

- [loadCookie](/reference/schemas/loadcookie)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. Optional self-describing schema URI for linters | 
name | string | Required. Name of the specific cookie to load.<br/><br/>Pattern: `^[A-Za-z0-9_.-]+$` | 
variable | string | Optional. Environment variable name containing the cookie as JSON string.<br/><br/>Pattern: `^[A-Za-z_][A-Za-z0-9_]*$` | 
path | string | Optional. File path to cookie file, relative to directory. Supports Netscape cookie format. | 
directory | string | Optional. Directory containing the cookie file. | 
domain | string | Optional. Specific domain to filter the cookie by when loading from multi-cookie file (optional). | 

## Examples

```json
{
  "$schema": "example",
  "name": "example",
  "variable": "example",
  "path": "example",
  "directory": "example",
  "domain": "example"
}
```
