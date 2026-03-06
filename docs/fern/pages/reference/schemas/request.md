---
title: "Request"
---

## Referenced In

- [HTTP request (detailed)](/reference/schemas/http-request-detailed)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
headers | one of:<br/>- object([Request headers (object)](/reference/schemas/request-headers-object))<br/>- string | Optional. Headers to include in the HTTP request. | ``{}``
parameters | object([Request parameters](/reference/schemas/request-parameters)) | Optional. URL parameters to include in the HTTP request, in key/value format. | ``{}``
body | one of:<br/>- object([Request body (object)](/reference/schemas/request-body-object))<br/>- array of unknown<br/>- string | Optional. The body of the HTTP request. | ``{}``

## Examples

```json
{
  "headers": {},
  "parameters": {},
  "body": {}
}
```
