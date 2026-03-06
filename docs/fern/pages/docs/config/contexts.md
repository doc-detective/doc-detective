---
title: Contexts
description: Define the contexts (platform and browser combinations) where tests should run.
---

Doc Detective uses contexts to determine *where* tests should run. A context defines a combination of a target platform (operating system) and, optionally, a target browser with specific configurations.

By default, if contexts are needed but not specified, Doc Detective attempts to find a supported browser (like Chrome or Firefox) on the current platform (Windows, macOS, or Linux) and run tests there.

You define contexts using an array of context objects. Each context object specifies the target `platforms` (as a string or array) and the target `browsers` (as a string, array, or object).

When Doc Detective runs tests, it evaluates the defined contexts against the current environment. If the current platform matches one specified in a context, and if a browser is specified and available, the test runs in that specific browser on that platform. You can specify multiple contexts, and Doc Detective will attempt to run the relevant tests in each matching context.

For comprehensive options, see the [context](/reference/schemas/context) reference.

## Specifying contexts

You can specify contexts at three different levels, in order of precedence:

- **Config**: Contexts defined in the main [`config`](/reference/schemas/config) apply to all tests unless overridden.
- **Spec**: Contexts defined in a [`specification`](/reference/schemas/specification) override config-level contexts and apply to all tests within that spec unless overridden.
- **Test**: Contexts defined within a specific [`test`](/reference/schemas/test) override config- and spec-level contexts and apply only to that test.

Contexts are defined using a `runOn` array containing context objects. For example:

```json
{
  ...
  "runOn": [
    {
      "platforms": ["windows", "mac", "linux"],
      "browsers": "chrome"
    },
    {
      "platforms": ["windows", "mac", "linux"],
      "browsers": "firefox"
    },
    {
      "platforms": "mac",
      "browsers": "webkit" // or "safari"
    }
  ],
  ...
}
```

## Browsers

Doc Detective can perform browser-based tests on several browser engines. The following browser names are supported in the `browsers` property:

- **Chrome** (`chrome`): Uses Chromium.
- **Firefox** (`firefox`): Uses Firefox.
- **WebKit** (`webkit`): Uses WebKit. The name `safari` can be used as an alias for `webkit`.


### Chrome (`chrome`)

Available on Windows, macOS, and Linux.

Chrome is the only browser that currently supports video recording via the [`record`](/docs/actions/record) action.

Here's a basic Chrome context for all platforms:

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": "chrome"
}
```

Or using the object format:

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": {
    "name": "chrome"
  }
}
```

#### Chrome Dimensions and Visibility

You can specify browser window dimensions, viewport dimensions, and visibility (`headless`). `headless` must be `false` (that is, run in headed mode) to use the `record` action.

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": {
    "name": "chrome",
    "headless": false, // Required for recording
    "window": {
      "width": 1280,
      "height": 800
    },
    "viewport": {
      "width": 1200,
      "height": 720
    }
  }
}
```

### Firefox (`firefox`)

Available on Windows, macOS, and Linux.

Here's a basic Firefox context:

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": "firefox"
}
```

#### Firefox Dimensions and Visibility

You can specify dimensions and visibility (`headless`).

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": {
    "name": "firefox",
    "headless": true,
    "window": {
      "width": 1024,
      "height": 768
    }
  }
}
```

### WebKit (`webkit` or `safari`)

WebKit testing is primarily associated with Safari on macOS. Doc Detective runs tests using the WebKit driver.

You can use either `webkit` or `safari` as the browser name.

Before running tests with WebKit/Safari on macOS, you might need to enable the driver:

1. Run `safaridriver --enable` in your terminal.
2. Ensure **Develop > Allow Remote Automation** is checked in Safari's menu bar (you might need to enable the Develop menu first in Safari's Advanced preferences).

*Note: This setup is often handled automatically in CI environments like GitHub Actions.*

Here's a basic WebKit/Safari context for macOS:

```json
{
  "platforms": "mac",
  "browsers": "webkit" // or "safari"
}
```

#### WebKit/Safari Dimensions

You can specify window or viewport dimensions. WebKit/Safari does **not** support headless mode.

```json
{
  "platforms": "mac",
  "browsers": {
    "name": "webkit", // or "safari"
    "headless": false, // Headless is not supported
    "viewport": {
      "width": 1440,
      "height": 900
    }
  }
}
```

## Platforms

Doc Detective can run tests targeting the following platforms:

- Windows (`windows`)
- macOS (`mac`)
- Linux (`linux`) (Tested primarily on Ubuntu)

When you specify a platform (or multiple platforms) in a context, Doc Detective attempts to run the associated tests only when executed on a matching operating system. If `platforms` is omitted, it defaults to the current platform.

For example, this context targets only macOS:

```json
{
  "platforms": "mac",
  "browsers": "chrome"
}
```

This context targets Windows or Linux:

```json
{
  "platforms": ["windows", "linux"],
  "browsers": "firefox"
}
```

## Examples

### Basic Contexts

- Run tests in Chrome on all supported platforms:

  ```json
  {
    "platforms": ["windows", "mac", "linux"],
    "browsers": "chrome"
  }
  ```

- Run tests in Firefox on Windows and macOS:

  ```json
  {
    "platforms": ["windows", "mac"],
    "browsers": "firefox"
  }
  ```

- Run tests in WebKit/Safari on macOS:

  ```json
  {
    "platforms": "mac",
    "browsers": "webkit" // or "safari"
  }
  ```

### Contexts in a Config (`config.json`)

Specify contexts in the top-level `runOn` array. These apply to all tests unless overridden.

```json
{
  "input": ".",
  "output": "output",
  "runOn": [
    {
      "platforms": ["windows", "mac", "linux"],
      "browsers": "chrome"
    },
    {
      "platforms": ["windows", "mac", "linux"],
      "browsers": "firefox"
    },
    {
      "platforms": "mac",
      "browsers": {
        "name": "webkit",
        "window": { "width": 1280, "height": 800 }
      }
    }
  ]
}
```

### Contexts in a Specification (`*.spec.json`)

Specify contexts in the spec's `runOn` array. These override config-level contexts for tests within this spec.

```json
{
  "description": "Specification for login tests",
  "runOn": [
    {
      "platforms": ["windows", "mac"],
      "browsers": "chrome"
    }
  ],
  "tests": [
    // ... tests in this spec will run on Chrome on Windows & Mac
  ]
}
```

### Contexts in a Test

Specify contexts in the test's `runOn` array. These override config- and spec-level contexts for this specific test.

```json
{
  "description": "Main application specification",
  "tests": [
    {
      "description": "Test login form on Windows/Chrome only",
      "runOn": [
        {
          "platforms": "windows",
          "browsers": "chrome"
        }
      ],
      "steps": [
        // ... steps for this test
      ]
    },
    {
      "description": "Test dashboard on all default contexts",
      // No runOn here, inherits from spec or config
      "steps": [
        // ... steps for this test
      ]
    }
  ]
}
```
