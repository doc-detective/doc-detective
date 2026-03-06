---
title: "Click element (detailed)"
---

## Referenced In

- [click](/reference/schemas/click)
- [Find element (detailed)](/reference/schemas/find-element-detailed)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
button | string | Optional. Kind of click to perform.<br/><br/>Accepted values: `left`, `right`, `middle` | 
elementText | string | Optional. Display text of the element to click. If combined with `selector`, the element must match both the text and the selector. | 
selector | string | Optional. Selector of the element to click. If combined with `elementText`, the element must match both the text and the selector. | 

## Examples

```json
{
  "button": "left",
  "elementText": "example",
  "selector": "example"
}
```
