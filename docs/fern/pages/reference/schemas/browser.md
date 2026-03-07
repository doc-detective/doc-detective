---
title: "Browser"
---

Browser configuration.

## Referenced In

- [context](/reference/schemas/context)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
name | string | Required. Name of the browser.<br/><br/>Accepted values: `chrome`, `firefox`, `safari`, `webkit` | 
headless | boolean | Optional. If `true`, runs the browser in headless mode. | `true`
window | object([Browser Window](/reference/schemas/browser-window)) | Optional. Browser dimensions. | 
viewport | object([Browser Viewport](/reference/schemas/browser-viewport)) | Optional. Viewport dimensions. | 

## Examples

```json
{
  "name": "chrome",
  "headless": true,
  "window": {
    "width": 42,
    "height": 42
  },
  "viewport": {
    "width": 42,
    "height": 42
  }
}
```
