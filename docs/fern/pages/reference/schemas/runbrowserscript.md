---
title: "runBrowserScript"
---

## Referenced In

- [test](/reference/schemas/test)
- [Resolved context](/reference/schemas/resolved-context)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
runBrowserScript | one of:<br/>- string<br/>- object([Run browser script (detailed)](/reference/schemas/run-browser-script-detailed)) | Required. Execute arbitrary JavaScript in the browser page context. Runs via the WebDriver `executeScript` endpoint, so it has access to the page's `document`, `window`, and DOM. Doc Detective captures the script's return value in the step's `outputs.result`. Distinct from `runCode`, which runs Node/Python/bash on the host machine. | 

## Examples

```json
{
  "runBrowserScript": "return document.title;"
}
```
