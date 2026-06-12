---
title: "config"
---

Configuration options for Doc Detective operations.

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
$schema | string | Optional. JSON Schema for this object.<br/><br/>Accepted values: `https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/config_v3.schema.json` | 
configId | string | Optional. Identifier for the configuration. | 
configPath | string | ReadOnly. Path to the configuration file. | 
input | one of:<br/>- string<br/>- array of string | Optional. Path(s) to test specifications and documentation source files. May be paths to specific files or to directories to scan for files. | `.`
output | string | Optional. Path of the directory in which to store the output of Doc Detective commands. If a file path is specified, Doc Detective attempts to honor the file name specified, but file path behavior is controlled by the configured reporters. | `.`
reporters | array of string | Optional. Reporters to use when emitting test results. Built-in reporters: `terminal`, `json`, `html`, `runFolder`. The `runFolder` reporter (enabled by default) archives each run's results as `<output>/.doc-detective/run-<runId>/testResults.json`, beside any screenshots the run captured, in addition to the flat output the `json` reporter writes. Custom reporters registered via `registerReporter()` can also be referenced by name. | ``["terminal","json","runFolder"]``
recursive | boolean | Optional. If `true` searches `input`, `setup`, and `cleanup` paths recursively for test specifications and source files. | `true`
specFilter | array of string | Optional. Regex patterns (case-insensitive) applied to each spec's `specId`. If set, only specs whose `specId` matches at least one pattern are run. Equivalent to `--spec` on the CLI. |
testFilter | array of string | Optional. Regex patterns (case-insensitive) applied to each test's `testId`. If set, only tests whose `testId` matches at least one pattern are run. Equivalent to `--test` on the CLI. |
relativePathBase | string | Optional. Whether paths should be interpreted as relative to the current working directory (`cwd`) or to the file in which they're specified (`file`).<br/><br/>Accepted values: `cwd`, `file` | `file`
loadVariables | string | Optional. Load environment variables from the specified `.env` file. | 
origin | string | Optional. Default protocol and domain to use for relative URLs. |
originParams | object | Optional. Query parameters to append to URLs resolved against `origin`. Values support environment variable substitution via `$VAR` syntax. Step-level `params` on `goTo` / `checkLink` are merged on top of these, with step keys winning on collision. | `{}`
beforeAny | one of:<br/>- string<br/>- array of string | Optional. Path(s) to test specifications to perform before those specified by `input`. Useful for setting up testing environments. | 
afterAll | one of:<br/>- string<br/>- array of string | Optional. Path(s) to test specifications to perform after those specified by `input`. Useful for cleaning up testing environments. | 
detectSteps | boolean | Optional. Whether or not to detect steps in input files based on defined markup. | `true`
allowUnsafeSteps | boolean | Optional. Whether or not to run potentially unsafe steps, such as those that might modify files or system state. | 
crawl | boolean | Optional. If `true`, crawls sitemap.xml files specified by URL to find additional files to test. | `false`
processDitaMaps | boolean | Optional. If `true`, processes DITA maps and includes generated files as inputs. | `true`
logLevel | string | Optional. Amount of detail to output when performing an operation.<br/><br/>Accepted values: `silent`, `error`, `warning`, `info`, `debug` | `info`
runOn | array of object([context](/reference/schemas/context)) | Optional. Contexts to run the test in. Overrides contexts defined at the config and spec levels. | 
fileTypes | array of one of: string, object([File type (custom)](/reference/schemas/file-type-custom)), object([File type (executable)](/reference/schemas/file-type-executable)) | Optional. Configuration for file types and their markup detection. | ``["markdown","asciidoc","html","dita"]``
integrations | object([Integrations options](/reference/schemas/integrations-options)) | Optional. Options for connecting to external services. | 
telemetry | object([Telemetry options](/reference/schemas/telemetry-options)) | Optional. Options around sending telemetry for Doc Detective usage. | ``{"send":true}``
concurrentRunners | integer,boolean | Optional. Number of concurrent test runners. Set to true to use CPU core count (capped at 4).<br/><br/>Minimum: 1 | `1`
environment | object([Environment details](/reference/schemas/environment-details)) | ReadOnly. Environment information for the system running Doc Detective. | 
autoScreenshot | boolean | Optional. If `true`, captures a screenshot after every step that runs in a browser, in addition to any explicit `screenshot` steps. Images are saved in the per-run artifact directory (`<output>/.doc-detective/run-<runId>/`) at paths derived from spec, test, and context IDs plus the step's order, action, and ID (for example, `screenshots/<specId>/<testId>/<contextId>/01-goTo-s4f2a91c.png`). The same step lands on the same relative path in every run's folder, enabling run-over-run comparison. Specs and tests can override this value with their own `autoScreenshot` fields (test level wins over spec level, which wins over config level). Equivalent to `--auto-screenshot` on the CLI. | `false`
debug | one of:<br/>- boolean<br/>- string | Optional. Enable debugging mode. `true` allows pausing on breakpoints, waiting for user input before continuing. `stepThrough` pauses at every step, waiting for user input before continuing. `false` disables all debugging. | `false`
dryRun | boolean | Optional. If `true`, fully resolve tests (file detection, inline-test extraction, config merge, schema validation) and emit the resolved test plan as JSON, but do not execute any steps. Equivalent to `--dry-run` on the CLI. Useful for validating test configuration without running actual tests. | `false`

## Examples

```json
{}
```

```json
{
  "input": ".",
  "output": ".",
  "recursive": true,
  "loadVariables": ".env",
  "fileTypes": [
    "markdown"
  ]
}
```

```json
{
  "fileTypes": [
    {
      "extends": "markdown",
      "extensions": [
        "md",
        "markdown",
        "mdx"
      ],
      "inlineStatements": {
        "testStart": "<!--\\s*testStart\\s*(.*?)\\s*-->",
        "testEnd": "<!-- testEnd -->",
        "ignoreStart": "<!-- ignoreStart -->",
        "ignoreEnd": "<!-- ignoreEnd -->",
        "step": "<!--\\s*step\\s*(.*?)\\s*-->"
      },
      "markup": [
        {
          "name": "onscreenText",
          "regex": "\\*\\*.+?\\*\\*",
          "actions": "find"
        }
      ]
    }
  ]
}
```

```json
{
  "fileTypes": [
    {
      "name": "Jupyter Notebooks",
      "extensions": "ipynb",
      "runShell": {
        "command": "jupyter",
        "args": [
          "nbconvert",
          "--to",
          "script",
          "--execute",
          "$1",
          "--stdout"
        ]
      }
    },
    {
      "name": "JavaScript",
      "extensions": "js",
      "runShell": {
        "command": "node $1"
      }
    },
    {
      "name": "Python",
      "extensions": "py",
      "runShell": {
        "command": "python $1"
      }
    }
  ]
}
```

```json
{
  "environment": {
    "platform": "windows",
    "arch": "x64"
  }
}
```

```json
{
  "concurrentRunners": 1
}
```

```json
{
  "concurrentRunners": true
}
```

```json
{
  "concurrentRunners": 4
}
```

```json
{
  "debug": false
}
```

```json
{
  "debug": true
}
```

```json
{
  "debug": "stepThrough"
}
```

```json
{
  "integrations": {
    "docDetectiveApi": {
      "apiKey": "your-api-key-here"
    }
  }
}
```

```json
{
  "crawl": true
}
```

```json
{
  "dryRun": true
}
```

```json
{
  "origin": "https://my-app.com",
  "originParams": {
    "__clerk_testing_token": "$CLERK_TESTING_TOKEN"
  }
}
```

```json
{
  "testFilter": ["smoke", "login"],
  "specFilter": ["auth"]
}
```

```json
{
  "autoScreenshot": true,
  "output": "./test-results"
}
```
