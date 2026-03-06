---
title: "context"
---

A context in which to perform tests. If no contexts are specified but a context is required by one or more tests, Doc Detective attempts to identify a supported context in the current environment and run tests against it. For example, if a browser isn't specified but is required by steps in the test, Doc Detective will search for and use a supported browser available in the current environment.

## Referenced In

- [config](/reference/schemas/config)
- [specification](/reference/schemas/specification)
- [test](/reference/schemas/test)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. JSON Schema for this object.<br/><br/>Accepted values: `https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/context_v3.schema.json` | 
contextId | string | Optional. Unique identifier for the context. | 
platforms | one of:<br/>- string<br/>- array of string | Optional. Platforms to run tests on. | 
browsers | one of:<br/>- string<br/>- object([Browser](/reference/schemas/browser))<br/>- array of one of: string, object([Browser](/reference/schemas/browser)) | Optional. Browsers to run tests on. | 

## Examples

```json
{
  "platforms": "linux",
  "browsers": "chrome"
}
```

```json
{
  "platforms": [
    "windows",
    "mac",
    "linux"
  ],
  "browsers": [
    "chrome",
    "firefox",
    "webkit"
  ]
}
```

```json
{
  "browsers": {
    "name": "chrome",
    "headless": true
  }
}
```

```json
{
  "browsers": [
    {
      "name": "chrome",
      "headless": true
    },
    {
      "name": "firefox"
    }
  ]
}
```

```json
{
  "platforms": [
    "mac",
    "linux"
  ],
  "browsers": {
    "name": "chrome",
    "headless": true
  }
}
```

```json
{
  "platforms": [
    "windows",
    "mac",
    "linux"
  ],
  "browsers": [
    {
      "name": "chrome",
      "headless": true,
      "window": {
        "width": 1920,
        "height": 1080
      },
      "viewport": {
        "width": 1600,
        "height": 900
      }
    },
    {
      "name": "firefox",
      "window": {
        "width": 1366,
        "height": 768
      }
    },
    {
      "name": "webkit",
      "headless": false,
      "viewport": {
        "width": 1440,
        "height": 900
      }
    }
  ]
}
```

```json
{
  "platforms": "mac",
  "browsers": [
    {
      "name": "safari",
      "window": {
        "width": 1280,
        "height": 800
      }
    }
  ]
}
```
