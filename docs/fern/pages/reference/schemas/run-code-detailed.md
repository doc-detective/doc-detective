---
title: "Run code (detailed)"
---

## Referenced In

- [runCode](/reference/schemas/runcode)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
language | string | Required. Language of the code to run.<br/><br/>Accepted values: `python`, `bash`, `javascript` | 
code | string | Required. Code to run. | 
args | array of string | Optional. Arguments for the command. | ``[]``
workingDirectory | string | Optional. Working directory for the command. | `.`
exitCodes | array of integer | Optional. Expected exit codes of the command. If the command's actual exit code isn't in this list, the step fails. | ``[0]``
stdio | string | Optional. Content expected in the command's output. If the expected content can't be found in the command's output (either stdout or stderr), the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.*/`. | 
path | string | Optional. File path to save the command's output, relative to `directory`. | 
directory | string | Optional. Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory. | 
maxVariation | number | Optional. Allowed variation in percentage of text different between the current output and previously saved output. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.<br/><br/>Minimum: 0. Maximum: 1 | `0`
overwrite | string | Optional. If `true`, overwrites the existing output at `path` if it exists.
If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.<br/><br/>Accepted values: `true`, `false`, `aboveVariation` | `aboveVariation`
timeout | integer | Optional. Max time in milliseconds the command is allowed to run. If the command runs longer than this, the step fails. | `60000`

## Examples

```json
{
  "language": "python",
  "code": "example",
  "args": [],
  "workingDirectory": ".",
  "exitCodes": [
    0
  ],
  "stdio": "example",
  "path": "example",
  "directory": "example",
  "maxVariation": 0,
  "overwrite": "aboveVariation",
  "timeout": 60000
}
```
