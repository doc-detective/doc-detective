---
title: "Run browser script (detailed)"
---

## Referenced In

- [runBrowserScript](/reference/schemas/runbrowserscript)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
script | string | Required. JavaScript to evaluate in the browser page context. Supports `return` to capture a value into `outputs.result`. The script reads arguments supplied in `args` through the `arguments` object (`arguments[0]`, `arguments[1]`, and so on). | 
args | array of string | Optional. Arguments passed positionally to the script. Available inside the script via the `arguments` object. | ``[]``
output | string | Optional. Content expected in the script's serialized return value. Doc Detective serializes non-string return values to JSON before matching. If the serialized return value doesn't contain the expected content, the step fails. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/^hello-world.*/`. | 
path | string | Optional. File path to save the script's serialized return value, relative to `directory`. | 
directory | string | Optional. Directory to save the script's return value. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory. | 
maxVariation | number | Optional. Allowed variation as a fraction (0 to 1) of text different between the current return value and previously saved value. If the difference between the current value and the previous value is greater than `maxVariation`, the step returns a warning. If no output exists at `path`, Doc Detective ignores this value.<br/><br/>Minimum: 0. Maximum: 1 | `0`
overwrite | string | Optional. If `true`, overwrites the existing output at `path` if it exists. If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.<br/><br/>Accepted values: `true`, `false`, `aboveVariation` | `aboveVariation`
timeout | integer | Optional. Maximum time in milliseconds the script may run. If the script runs longer than this, the step fails. | `60000`

## Examples

```json
{
  "script": "return arguments[0] + arguments[1];",
  "args": ["foo", "bar"],
  "output": "foobar"
}
```
