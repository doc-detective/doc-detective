---
title: "Find element (detailed)"
---

## Referenced In

- [find](/reference/schemas/find)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
elementText | string | Optional. Display text of the element to find. If combined with `selector`, the element must match both the text and the selector. | 
selector | string | Optional. Selector of the element to find. If combined with `elementText`, the element must match both the text and the selector. | 
timeout | integer | Optional. Max duration in milliseconds to wait for the element to exist. | `5000`
moveTo | boolean | Optional. Move to the element. If the element isn't visible, it's scrolled into view. | `true`
click | one of:<br/>- one of:<br/>- string<br/>- object([Click element (detailed)](/reference/schemas/click-element-detailed))<br/>- boolean<br/>- object([Find element and click](/reference/schemas/find-element-and-click)) | Optional. Click the element. | 
type | unknown | Optional. Type keys after finding the element. Either a string or an object with a `keys` field as defined in [`type`](type). To type in the element, make the element active with the `click` parameter. | 

## Examples

```json
{
  "elementText": "example",
  "selector": "example",
  "timeout": 5000,
  "moveTo": true
}
```
