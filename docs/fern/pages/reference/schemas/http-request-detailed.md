---
title: "HTTP request (detailed)"
---

## Referenced In

- [httpRequest](/reference/schemas/httprequest)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
url | string | Optional. URL for the HTTP request.<br/><br/>Pattern: `(^(http://|https://).*|\$[A-Za-z0-9_]+)` | 
openApi | one of:<br/>- unknown<br/>- unknown | Optional. No description provided. | 
statusCodes | array of integer | Optional. Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails. | ``[200,201]``
method | string | Optional. Method of the HTTP request<br/><br/>Accepted values: `get`, `put`, `post`, `patch`, `delete` | `get`
timeout | integer | Optional. Timeout for the HTTP request, in milliseconds. | `60000`
request | object([Request](/reference/schemas/request)) | Optional. No description provided. | 
response | object([Response](/reference/schemas/response)) | Optional. No description provided. | 
allowAdditionalFields | boolean | Optional. If `false`, the step fails when the response data contains fields not specified in the response body. | `true`
path | string | Optional. File path to save the command's output, relative to `directory`. Specify a file extension that matches the expected response type, such as `.json` for JSON content or `.txt` for strings. | 
directory | string | Optional. Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory. | 
maxVariation | number | Optional. Allowed variation in percentage of text different between the current output and previously saved output. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.<br/><br/>Minimum: 0. Maximum: 1 | `0`
overwrite | string | Optional. If `true`, overwrites the existing output at `path` if it exists.
If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.<br/><br/>Accepted values: `true`, `false`, `aboveVariation` | `aboveVariation`

## Examples

```json
{
  "url": "example",
  "statusCodes": [
    200,
    201
  ],
  "method": "get",
  "timeout": 60000,
  "request": {},
  "response": {
    "headers": {},
    "body": {}
  },
  "allowAdditionalFields": true,
  "path": "example",
  "directory": "example",
  "maxVariation": 0,
  "overwrite": "aboveVariation"
}
```
