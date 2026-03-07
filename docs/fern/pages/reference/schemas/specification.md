---
title: "specification"
---

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. JSON Schema for this object.<br/><br/>Accepted values: `https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/spec_v3.schema.json` | 
specId | string | Optional. Unique identifier for the test specification. | 
description | string | Optional. Description of the test specification. | 
specPath | string | Optional. Path to the test specification. | 
contentPath | string | Optional. Path to the content that the specification is associated with. | 
runOn | array of object([context](/reference/schemas/context)) | Optional. Contexts to run the test in. Overrides contexts defined at the config and spec levels. | 
openApi | array of unknown | Optional. No description provided. | 
tests | array of object([test](/reference/schemas/test)) | Required. [Tests](test) to perform. | 

## Examples

```json
{
  "tests": [
    {
      "steps": [
        {
          "checkLink": {
            "url": "https://www.duckduckgo.com"
          }
        }
      ]
    }
  ]
}
```

```json
{
  "specId": "Do all the things! - Spec",
  "runOn": [
    {
      "platforms": [
        "windows",
        "mac"
      ],
      "browsers": {
        "name": "firefox",
        "window": {},
        "viewport": {}
      }
    }
  ],
  "tests": [
    {
      "testId": "Do all the things! - Test",
      "description": "This test includes nearly every property across all actions.",
      "runOn": [
        {
          "platforms": "linux",
          "browsers": "firefox"
        }
      ],
      "steps": [
        {
          "loadVariables": ".env"
        },
        {
          "runShell": {
            "command": "echo",
            "args": [
              "$USER"
            ],
            "maxVariation": 0,
            "overwrite": "aboveVariation"
          },
          "variables": {}
        },
        {
          "checkLink": {
            "url": "https://www.duckduckgo.com"
          }
        },
        {
          "httpRequest": {
            "method": "post",
            "url": "https://reqres.in/api/users",
            "request": {
              "body": {
                "name": "morpheus",
                "job": "leader"
              }
            },
            "response": {
              "body": {
                "name": "morpheus",
                "job": "leader"
              }
            },
            "statusCodes": [
              200,
              201
            ],
            "maxVariation": 0,
            "overwrite": "aboveVariation"
          },
          "variables": {}
        },
        {
          "goTo": {
            "url": "https://www.duckduckgo.com"
          }
        },
        {
          "find": {
            "selector": "[title=Search]",
            "elementText": "Search",
            "timeout": 10000,
            "moveTo": true,
            "click": true,
            "type": {
              "keys": [
                "shorthair cat"
              ]
            }
          },
          "variables": {}
        },
        {
          "type": {
            "keys": [
              "$ENTER$"
            ]
          }
        },
        {
          "screenshot": {
            "maxVariation": 0,
            "overwrite": "aboveVariation"
          }
        }
      ],
      "detectSteps": true
    }
  ]
}
```

```json
{
  "specId": "Make a request from an OpenAPI definition",
  "openApi": [
    {
      "descriptionPath": "https://www.acme.com/openapi.json",
      "server": "https://api.acme.com",
      "name": "Acme"
    }
  ],
  "tests": [
    {
      "steps": [
        {
          "httpRequest": {
            "openApi": {
              "operationId": "getUserById",
              "validateAgainstSchema": "both",
              "useExample": "none",
              "exampleKey": ""
            },
            "request": {
              "parameters": {
                "id": 123
              }
            },
            "response": {},
            "maxVariation": 0,
            "overwrite": "aboveVariation"
          },
          "variables": {}
        }
      ]
    }
  ]
}
```
