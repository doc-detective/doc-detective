---
title: "Crop by element (detailed)"
---

Crop the screenshot to a specific element.

## Referenced In

- [Capture screenshot (detailed)](/reference/schemas/capture-screenshot-detailed)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
elementText | string | Optional. Display text of the element to screenshot. | 
selector | string | Optional. Selector of the element to screenshot. | 
padding | one of:<br/>- number<br/>- object([Padding (detailed)](/reference/schemas/padding-detailed)) | Optional. No description provided. | 

## Examples

```json
{
  "elementText": "example",
  "selector": "example",
  "padding": 42
}
```
