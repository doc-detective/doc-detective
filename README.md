# Doc Detective: The Documentation Testing Framework

Unit test documentation to validate UX flows, in-GUI text, and images. Primarily useful for process docs, Doc Detective supports test definitions single-sourced in documentation or defined in separate test files to suit your infrastructure needs.

Doc Detective ingests text files, parses them for test actions, then executes those actions in a headless Chromium browser. The results (PASS/FAIL and context) are output as a JSON object so that other pieces of infrastructure can parse and manipulate them as needed.

This project handles test parsing and web-based UI testing--it doesn't support results reporting or notifications. This framework is a part of testing infrastructures and needs to be complimented by other components.

Doc Detective uses `puppeteer` to install, launch, and drive Chromium to perform tests. `puppeteer` removes the requirement to manually configure a local web browser and enables easy screenshotting and video recording. In the event `puppeteer` fails to launch Chromium, Doc Detective tries to fall back to local installs of Chromium, Chrome, and Firefox.

**Note:** By default, `puppeteer`'s Chromium doesn't run in Docker containers, which means that `puppeteer` doesn't work either. Don't run Doc Detective in a Docker container unless you first confirm that you have a custom implementation of headless Chrome/Chromium functional in the container. The approved answer to [this question](https://askubuntu.com/questions/79280/how-to-install-chrome-browser-properly-via-command-line) works for me, but it may not work in all environments.

## Get started

You can use Doc Detective as an [NPM package](#npm-package) or a standalone [CLI tool](#cli-tool).

### NPM package

Doc Detective integrates with Node projects as an NPM package. When using the NPM package, you must specify all options in the `run()` method's `config` argument, which is a JSON object with the same structure as [config.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json).

1.  In a terminal, navigate to your Node project, then install Doc Detective:

    ```bash
    npm i doc-detective
    ```

1.  Add a reference to the package in your project:

    ```node
    const { run } = require("doc-detective");
    ```

1.  Run tests with the `run()` method:

    ```node
    run(config);
    ```

### CLI tool

You can run Doc Detective as a standalone CLI tool. When running as a CLI tool, you can specify default configuration options in [config.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json) and override those defaults with command-line arguments. (For a list of arguments, complete the following steps and run `npm run test -- -h`.)

0.  Install prerequisites:

    - [Node.js](https://nodejs.org/)

1.  In a terminal, clone the repo and install dependencies:

    ```bash
    git clone https://github.com/hawkeyexl/doc-detective.git
    cd doc-detective
    npm install
    ```

1.  Run tests according to your config. The `-c` argument is required and specifies the path to your config. The following example runs tests in the [sample/](https://github.com/hawkeyexl/doc-detective/tree/master/sample) directory:

    ```bash
    npm run test -- -c sample/config.json
    ```

To customize your test, file type, and directory options, update [sample/config.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json).

## Tests

You can define tests within your documentation (see [doc-content.md](https://github.com/hawkeyexl/doc-detective/blob/master/sample/doc-content.md)), or as separate files. Non-JSON files only support single-line test action definitions, so make sure to keep the entire action definition on one line.

JSON files must follow the format and structure defined in [testDefinition](https://github.com/hawkeyexl/doc-detective/blob/master/ref/testDefinition.json). For an example, see [samples/tests.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/tests.json).

## Actions

Each test is composed of multiple actions. Actions in a test perform sequentially as they're defined. If one or more actions fail, the test fails.

For information on each field, see [testDefinition](https://github.com/hawkeyexl/doc-detective/blob/master/ref/testDefinition.json).

### goTo

Navigate to a specified URI.

Format:

```json
{
  "action": "goTo",
  "uri": "https://www.google.com"
}
```

### Find

Identify if an element is on the current page based on CSS selectors.

Optionally, `find` canperform additional actions on the element in the specified order: [`wait`](#wait) (always waiting for the `css` value) > `find` > [`matchText`](#match-text) > [`moveMouse`](#move-mouse) > [`click`](#click) > [`type`](#type). Payloads for these additional actions are nested within the `find` action's definition and (other than omitting the `css` field) match the format for running each action separately.

Simple format:

```json
{
  "action": "find",
  "css": "[title=Search]"
}
```

Advanced format:

```json
{
  "action": "find",
  "css": "[title=Search]",
  "wait": {
    "duration": 10000
  },
  "matchText": {
    "text": "Search"
  },
  "moveMouse": {
    "alignH": "center",
    "alignV": "center",
    "offsetX": 0,
    "offsetY": 0
  },
  "click": {},
  "type": {
    "keys": "$SHORTHAIR_CAT_SEARCH",
    "trailingSpecialKey": "Enter",
    "env": "./sample/variables.env"
  }
}
```

### Match text

Identify if an element displays the expected text.

Format:

```json
{
  "action": "matchText",
  "css": "#gbqfbb",
  "text": "I'm Feeling Lucky"
}
```

### Click

Click an element specified by CSS selectors.

Format:

```json
{
  "action": "click",
  "css": "#gbqfbb",
  "alignH": "center",
  "alignV": "center",
  "offsetX": 10,
  "offsetY": 10
}
```

### Type

Enter text in an element specified by CSS selectors.

`keys` can be either a string or an environment variable. Environment variables are identified by a leading '$', and you can set environment variables by passing a .env file ([sample](https://github.com/hawkeyexl/doc-detective/blob/master/sample/variables.env)) to the `env` field. If the variable is undefined on the machine running the test, the `keys` value is typed as a string. For example, if `keys` is "$KITTENS" and the `KITTENS` environment variable is set to "cute kittens", the test types "cute kittens", but if the `KITTENS` environment variable isn't defined, the test types the string "$KITTENS".

**Warning:** If you want to pass sensitive strings like usernames or passwords into the `type` action, store those values in a local .env file, point `env` to that file, and reference the variable in `keys`. Don't include cleartext passwords in your tests. Don't check .env files with sensitive data into a repository. Be careful with your credentials! Consult your security team if you have concerns.

Format:

```json
{
  "action": "type",
  "css": "[title=Search]",
  "keys": "kittens",
  "trailingSpecialKey": "Enter"
}
```

Advanced format with an environment variable:

```json
{
  "action": "type",
  "css": "input#password",
  "keys": "$PASSWORD",
  "trailingSpecialKey": "Enter",
  "env": "./sample/variables.env"
}
```

### Move mouse

Move the mouse to an element specified by CSS selectors. Only runs if a test is being recorded.

**Note:** The mouse cursor is visible in both recordings and screenshots.

Format:

```json
{
  "action": "moveMouse",
  "css": "[title=Search]",
  "alignH": "center",
  "alignV": "center",
  "offsetX": 10,
  "offsetY": 10
}
```

### Scroll

Scroll the current page by a specified number of pixels. Only runs if a test is being recorded.

For `x`, positive values scroll right and negative values scroll left. For `y`, positive values scroll down and negative values scroll up.

Format:

```json
{
  "action": "scroll",
  "x": 100,
  "y": 100
}
```

### Wait

Pause before performing the next action. If `css` is set, this action waits until the element is available or the `duration` is met, whichever comes first. If not set, `duration` defaults to `10000` milliseconds.

Format:

```json
{
  "action": "wait",
  "css": "[title=Search]",
  "duration": 500
}
```

### Screenshot

Capture an image of the current browser viewport. Supported extensions: .png

To match previously captured screenshots to the current viewport, set `matchPrevious` to `true` and specify a `matchThreshold` value. `matchThreshold` is a value between 0 and 1 that specifies what percentage of a screenshot can change before the action fails. For example, a `matchThreshold` value of `0.1` makes the action pass if the screenshots are up to 10% different or fail if the screenshots are 11% or more different. Screenshot comparison is based on pixel-level image analysis.

Format:

```json
{
  "action": "screenshot",
  "mediaDirectory": "samples",
  "filename": "results.png",
  "matchPrevious": true,
  "matchThreshold": 0.1
}
```

### HTTP request

Perform a generic HTTP request, for example to a REST API. Checks if the server returns an acceptable status code. If `uri` doesn't include a protocol, the protocol defaults to HTTPS. If `statusCodes` isn't specified, defaults to `[200]`.

Format:

```json
{
  "action": "httpRequest",
  "env": "path/to/variables.env",
  "uri": "https://www.api-server.com",
  "method": "post",
  "requestHeaders": {
    "header": "value"
  },
  "requestParams": {
    "param": "value"
  },
  "requestData": {
    "field": "value"
  },
  "responseHeaders": {
    "header": "value"
  },
  "responseData": {
    "field": "value"
  },
  "statusCodes": [200]
}
```

| Field             | Description                                                                                                                                                                                                                                                                                                                                                                                             | Example                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `action`          | Required. The action to perform.                                                                                                                                                                                                                                                                                                                                                                        | `"httpRequest"`                                                                                                                                                                            |
| `env`             | Optional. File path for a .env file of variables to load.                                                                                                                                                                                                                                                                                                                                               | `"./path/to/variables.env"`                                                                                                                                                                |
| `uri`             | Required. The URI to send the request to.<br>Supports setting values from environment variables.                                                                                                                                                                                                                                                                                                        | <ul><li>`"https://www.api-server.com"`</li><li>`"$URI"`</li></ul>                                                                                                                          |
| `method`          | Optional. The HTTP method for the request. Similar to curl's `-X` option.<br>Defaults to "get". Accepted values: ["get", "post", "put", "patch", "delete"]                                                                                                                                                                                                                                              | `"get"`                                                                                                                                                                                    |
| `requestHeaders`  | Optional. Headers to include in the request formatted as a JSON object. Similar to curl's `-H` option. <br> Supports setting the whole headers object and individual header values from environment variables.                                                                                                                                                                                          | <ul><li>`{ "Content-Type": "application/json" }`</li><li>`"$REQUEST_HEADERS"`</li><li>`{ "Content-Type": "$CONTENT_TYPE" }`</li></ul>                                                      |
| `requestData`     | Optional. Data to send with the request. Similar to curl's `-d` option. <br> Supports setting the whole data object and individual data values from environment variables.                                                                                                                                                                                                                              | <ul><li>`{ "id": 1, "first_name": "George", "last_name": "Washington" }`</li><li>`"$REQUEST_DATA"`</li><li>`{ "id": 1, "first_name": "$FIRST_NAME", "last_name": "$LAST_NAME" }`</li></ul> |
| `responseHeaders` | Optional. A non-exhaustive object of headers that should be included in the response. If a specified header is missing, or if a specified header value is incorrect, the action fails. If the response headers include headers that aren't specified by this option, the test can still pass. <br> Supports setting the whole headers object and individual header values from environment variables.   | <ul><li>`{ "Content-Type": "application/json" }`</li><li>`$RESPONSE_HEADERS`</li><li>`{ "Content-Type": "$CONTENT_TYPE" }`</li></ul>                                                       |
| `responseData`    | Optional. A non-exhaustive data object that should be included in the response. If a specified data field is missing, or if a specified value is incorrect, the action fails. If the response data payload includes additional fields that aren't specified by this option, the test can still pass. <br> Supports setting the whole data object and individual data values from environment variables. | <ul><li>`{ "id": 1, "last_name": "Washington" }`</li><li>`"$REQUEST_DATA"`</li><li>`{ "id": 1, "last_name": "$LAST_NAME" }`</li></ul>                                                      |
| `statusCodes`     | Optional. An array of accepted HTTP status response codes. Defaults to `[200]`. If the response's status code isn't included in this array, the action fails.                                                                                                                                                                                                                                           | [ 200, 204 ]                                                                                                                                                                               |

### Check a link

Check if a link returns an acceptable status code from a GET request. If `uri` doesn't include a protocol, the protocol defaults to HTTPS. If `statusCodes` isn't specified, defaults to `[200]`.

Format:

```json
{
  "action": "checkLink",
  "uri": "https://www.google.com",
  "statusCodes": [200]
}
```

### Start recording

Start recording the current browser viewport. Must be followed by a `stopRecording` action. Supported extensions: .mp4, .webm, .gif

**Note:** `.gif` format is **not** recommended. Because of file format and encoding differences, `.gif` files tend to be ~6.5 times larger than `.mp4` files, and with lower visual fidelity. But if `.gif` is a hard requirement for you, it's here.

Format:

```json
{
  "action": "startRecording",
  "overwrite": false,
  "mediaDirectory": "./samples",
  "filename": "results.mp4",
  "fps": 30,
  "width": 1200,
  "height": 800
}
```

### Stop recording

Stop recording the current browser viewport.

Format:

```json
{
  "action": "stopRecording"
}
```

### Run shell command

Perform a native shell command on the machine running Doc Detective. This can be a single command or a script. Set environment variables before running the command by specifying an env file in the `env` field. For reference, see [variables.env](https://github.com/hawkeyexl/doc-detective/blob/master/sample/variables.env).

Returns `PASS` if the command has an exit code of `0`. Returns `FAIL` if the command had a non-`0` exit code and outputs a `stderr` value.

Format:

```json
{
  "action": "runShell",
  "command": "echo $username",
  "env": "./variables.env"
}
```

## Analytics

By default, Doc Detective doesn't collect any information about tests, devices, users, or documentation and doesn't check in with any external service or server. If you want to help inform decisions about the future development of Doc Detective—such as feature development and documentation creation—you can opt into sending anonymized analytics after you run tests at one of the multiple levels of detail.

There are multiple ways to turn on analytics:

- config setting: In your [config](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json), set `analytics.send` to true.
- CLI argument: When running Doc Detective as a CLI tool, include `-a true` or `--analytics true`. This overrides any setting you specified in your config.

Most fields are self-explanatory, but a few merit additional description:

- `version` is populated with the version of your Doc Detective instance.
- `userId` is whatever arbitrary string, if any, you specify to identify the individual, workgroup, or organization running the tests.
- `detailLevel` must match one of the four supported levels of detail:
  - `run` indicates that tests were run, and that's about it. It omits the `tests`, `actions`, and `actionDetails` objects.
  - `test` includes aggregate data on the number of tests you ran and the tests' PASS/FAIL rates. It omits the `actions`, and `actionDetails` objects.
  - `action-simple` includes aggregate data on the number of actions in tests you ran and the actions' PASS/FAIL rates. It omits the `actionDetails` object.
  - `action-detailed` includes aggregate data on the kinds of actions you ran and the actions' PASS/FAIL rates. It doesn't omit any objects.

The analytics object has the following schema:

```json
{
  "version": "0.1.8",
  "userId": "",
  "detailLevel": "action-detailed",
  "tests": {
    "numberTests": 0,
    "passed": 0,
    "failed": 0
  },
  "actions": {
    "numberActions": 0,
    "averageNumberActionsPerTest": 0,
    "maxActionsPerTest": 0,
    "minActionsPerTest": 0,
    "passed": 0,
    "failed": 0
  },
  "actionDetails": {
    "goTo": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "uri": 0
    },
    "find": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "wait": {
        "numberInstances": 0,
        "duration": 0
      },
      "matchText": {
        "numberInstances": 0,
        "text": 0
      },
      "moveMouse": {
        "numberInstances": 0,
        "alignH": 0,
        "alignV": 0,
        "offsetX": 0,
        "offsetY": 0
      },
      "click": {
        "numberInstances": 0
      },
      "type": {
        "numberInstances": 0,
        "keys": 0,
        "trailingSpecialKey": 0,
        "env": 0
      }
    },
    "matchText": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "css": 0,
      "text": 0
    },
    "click": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "css": 0
    },
    "type": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "css": 0,
      "keys": 0,
      "trailingSpecialKey": 0,
      "env": 0
    },
    "moveMouse": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "css": 0,
      "alignH": 0,
      "alignV": 0,
      "offsetX": 0,
      "offsetY": 0
    },
    "scroll": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "x": 0,
      "y": 0
    },
    "wait": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "duration": 0,
      "css": 0
    },
    "screenshot": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "mediaDirectory": 0,
      "filename": 0,
      "matchPrevious": 0,
      "matchThreshold": 0
    },
    "startRecording": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "mediaDirectory": 0,
      "filename": 0,
      "gifFps": 0,
      "gifWidth": 0
    },
    "stopRecording": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0
    },
    "checkLink": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "uri": 0,
      "statusCodes": 0
    },
    "runShell": {
      "numberInstances": 0,
      "passed": 0,
      "failed": 0,
      "command": 0,
      "env": 0
    }
  }
}
```

### Custom analytics servers

If you opt into sending analytics, you can add additional servers that Doc Detective should send the analytics object to. Custom servers are specified in your config and have the following schema.

`params` and `headers` are optional.

```json
{
  "analytics": {
    "customServers": [
      {
        "name": "My Analytics Server",
        "method": "post",
        "url": "https://my.analytics-server.com/endpoint",
        "params": {
          "param_secret": "LifeTheUniverseAndEverything"
        },
        "headers": {
          "header_secret": "42"
        }
      }
    ]
  }
}
```

### Turn off analytics

Analytics reporting is off by default. If you want to make extra sure that Doc Detective doesn't collect analytics, you have a few options:

- config setting: In your [config](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json), set `analytics.send` to false.
- CLI argument: When running Doc Detective as a CLI tool, include `-a false` or `--analytics false`. This overrides any setting you specified in your config.
- Modify the code (if you're paranoid):
  1. In [src/index.js](https://github.com/hawkeyexl/doc-detective/blob/master/src/index.js), remove all references to `sendAnalytics()`.
  1. Delete [src/libs/analytics.js](https://github.com/hawkeyexl/doc-detective/blob/master/src/libs/analytics.js).

**Note:** Updating Doc Detective may revert any modified code, so be ready to make code edits repeatedly.

## Potential future updates

- Docker image with bundled Chromium/Chrome/Firefox.
- Additional input sanitization and improved config/action defaults.
- Refactor tests into individual files.
- New/upgraded test actions:
  - New: Test if a referenced image (such as an icon) is present in the captured screenshot.
  - Upgrade: `startRecording` and `stopRecording` to support start, stop, and intermediate test action state image matching to track differences between video captures from different runs.
- Content coverage analysis based on in-content test statements and markup declarations.
- Suggest tests by parsing document text.
  - Automatically insert suggested tests based on document text.
  - Detailed field descriptions per action.
- Web-based GUI:
  - Build/update config.
  - Build/update/run tests.
  - Run content coverage analysis.
  - Run test suggestions.
  - Build tests by clicking elements in an iframe and identifying CSS values.
- Browser extension to build tests by clicking elements in a browser and identifying CSS values.

## License

This project uses the [MIT license](https://github.com/hawkeyexl/doc-detective/blob/master/LICENSE).
