---
title: Contexts
description: Define the contexts (platform and browser combinations) where tests should run.
---

Doc Detective uses contexts to determine *where* tests should run. A context defines a combination of a target platform (operating system) and, optionally, a target browser with specific configurations.

By default, if contexts are needed but not specified, Doc Detective attempts to find a supported browser (like Chrome or Firefox) on the current platform (Windows, macOS, or Linux) and run tests there.

If no supported browser is available, Doc Detective skips contexts that require browser automation and reports the platform it skipped, for example: `Skipping context on 'linux': no supported browser is available in the current environment.`. This lets tests complete gracefully instead of failing with a generic driver error.

## Browser fallback

A browser context can fail to start for reasons beyond "not installed," most commonly a **broken driver**. For example, a partially downloaded `geckodriver` can exist on disk yet fail to run, which would otherwise make a Firefox context fail and skip. To stay resilient, Doc Detective validates each browser's driver by *executing* it (not just checking that it's present). When the requested browser can't start (because a component is missing or didn't install correctly), Doc Detective first tries to **repair** it once, reinstalling every component it needs (the browser and its driver), so the run can stay on the browser you asked for. It falls back to another available browser only when the repair doesn't help.

The [`browserFallback`](/reference/schemas/config) config option (or the `--browser-fallback` CLI flag) controls this fallback:

- **`auto`** (default): fall back to any other available browser. If Doc Detective auto-selected the browser (you didn't request one explicitly), the context runs on the fallback browser and reports `PASS`. If you requested the browser explicitly, the context still runs on the fallback browser but reports `WARNING`, so a degraded run never looks like a clean success.
- **`explicit`**: fall back only when Doc Detective auto-selected the browser. If you requested a browser explicitly and its driver fails to run, Doc Detective skips the context with a diagnostic reason instead of substituting another engine.
- **`off`**: never fall back across browsers. Driver validation and the diagnostic skip reason still apply.

Fallback works the same in every direction, so Chrome, Firefox, and Safari/WebKit can each fall back to one another. When no engine can start a session, Doc Detective skips the context with a diagnostic that names the requested browser and the likely cause (for example, a partially downloaded driver), so the failure stays actionable rather than generic.

You can also set `browserFallback` **per context**, on an individual `runOn` entry. A context-level value takes precedence over the config-level policy for the contexts that entry expands into, so you can, for example, default the whole run to `auto` while forcing one Safari-only context to `off`:

```json
{
  "runOn": [
    {
      "platforms": ["windows", "mac", "linux"],
      "browsers": "chrome"
    },
    {
      "platforms": ["mac"],
      "browsers": "safari",
      "browserFallback": "off"
    }
  ]
}
```

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
- **WebKit** (`webkit`): Uses WebKit. On desktop platforms, the name `safari` can be used as an alias for `webkit`. On an `ios` platform entry, `safari` instead means the real Safari browser on the managed simulator — see [Mobile browsers](#mobile-browsers-android-and-ios).

<Note>
When you use the object format for any browser, you must set `name`. If you omit it (for example, `{ "headless": true }`), Doc Detective can't resolve the browser and skips the context.
</Note>

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

### Mobile browsers (Android and iOS)

With a mobile platform entry (`android` or `ios`), `browsers` means the browser **on the managed device** — Doc Detective boots (or reuses) the emulator/simulator and drives its browser, and `goTo`, `find`, `click`, and `screenshot` behave exactly as on desktop. Element semantics are web DOM, not native accessibility, and no app descriptor is involved.

Each mobile target supports exactly one browser:

| Target | `chrome` | `safari` | `firefox` | `webkit` |
| :-- | :--: | :--: | :--: | :--: |
| `android` | ✓ | Skipped | Skipped | Skipped |
| `ios` | Skipped | ✓ | Skipped | Skipped |

Unsupported combinations skip the context with a reason naming the supported browser — the same non-failing outcome as a `platforms` mismatch. If you omit `browsers` on a mobile entry, the platform's browser fills in automatically, so this is a complete mobile-web context:

```json
{
  "platforms": "android"
}
```

And this single entry runs one web test on four targets (the `ios` leg skips, because Chrome isn't available there):

```json
{
  "platforms": ["windows", "mac", "android", "ios"],
  "browsers": "chrome"
}
```

Things that work differently on a device browser:

- **`safari` means Safari.** On an `ios` entry, `safari` is the device's real Safari (not the desktop `webkit` alias). `webkit` on `ios` is an unsupported combination and skips.
- **The device owns its display.** Authored `window`/`viewport` dimensions and `headless: false` on the browser config are rejected with an error — set [`device.headless`](/reference/schemas/device-descriptor) to control emulator visibility, and pick a different `device.deviceType` if you need another screen size. (`headless: true` matches the schema default, so it's accepted and ignored.)
- **No browser fallback.** The device browser is part of the device image, so there's no alternative engine to fall back to; [`browserFallback`](#browser-fallback) doesn't apply.
- **One browser per device.** The device browser is the context's only browser surface; tests can't open additional browsers on the device.
- **Native app steps live in separate tests.** A single mobile context can drive the device browser *or* native app surfaces ([`startSurface`](/reference/schemas/startsurface)), not both; a context mixing them skips with a pointer to split the test.
- **`localhost` is the device's own loopback.** An Android emulator reaches the host machine at `10.0.2.2` (so a local test server at `http://localhost:8092` is `http://10.0.2.2:8092` from the emulator); iOS simulators share the host network, so `localhost` works directly.

Host requirements are the same as for native mobile app testing and are checked automatically: any capable host with the Android SDK and hardware acceleration for `android` (run `doc-detective install android` to prepare one), a macOS host with Xcode for `ios` (`doc-detective install ios`). Incapable hosts skip with actionable guidance. On Android, Chrome ships with `google_apis` system images — the kind `doc-detective install android` installs; images without Chrome skip with a pointer.

## Session reuse

To run faster, Doc Detective reuses a single browser session across contexts that share the same browser configuration, instead of launching and quitting a browser for every test. Reuse is on by default and needs no configuration.

**Which browsers reuse.** Only the Chromium family (`chrome`, and Chromium-based `edge`) reuses sessions. Between contexts, Doc Detective resets the reused browser to a clean state — clearing cookies, local and session storage, IndexedDB, cache storage, service workers, granted permissions, and any extra windows — so a reused session behaves exactly like a fresh one. Firefox, WebKit/Safari, and native app surfaces always start a fresh session per context, because they have no equally complete programmatic reset.

**It never changes test outcomes.** If the reset can't complete for any reason, Doc Detective discards that session and starts a fresh one automatically. Reuse only ever makes a run faster; it can't make a passing test fail. Recording contexts also always get a fresh session.

**Opting out (`freshSession`).** Set [`freshSession: true`](/reference/schemas/browser) on a browser to force a brand-new session for every context, opting that browser out of reuse. Use it when you want to rule out any possibility of cross-context state carryover:

```json
{
  "platforms": ["windows", "mac", "linux"],
  "browsers": {
    "name": "chrome",
    "freshSession": true
  }
}
```

`freshSession` is `false` by default (reuse). It has no effect on Firefox, WebKit/Safari, or native app surfaces, which never reuse regardless.

## Platforms

Doc Detective can run tests targeting the following platforms:

- Windows (`windows`)
- macOS (`mac`)
- Linux (`linux`) (Tested primarily on Ubuntu)
- Android (`android`) — a managed emulator; see [Mobile browsers](#mobile-browsers-android-and-ios) for web tests and [startSurface](/reference/schemas/startsurface) for native apps.
- iOS (`ios`) — a managed simulator (macOS hosts only); same references as Android.

When you specify a desktop platform (or multiple platforms) in a context, Doc Detective attempts to run the associated tests only when executed on a matching operating system. If `platforms` is omitted, it defaults to the current platform.

Mobile platforms name the **target** the test runs against, not the host: an `android` context runs on any host capable of running the emulator, and an `ios` context on any macOS host with Xcode. Incapable hosts skip the context with guidance instead of failing.

The desktop platforms (`windows`, `mac`, and `linux`) run browser tests and, on Windows and macOS, [native desktop app tests](/docs/actions/startsurface). The mobile platforms drive native apps rather than a browser, with their default device set by the context's `device` field: `android` runs native Android app tests on a managed emulator (see [Run on an Android emulator](/docs/actions/startsurface#run-on-an-android-emulator)), and `ios` runs native iOS app tests on a managed simulator (see [Run on an iOS simulator](/docs/actions/startsurface#run-on-an-ios-simulator)). iOS app tests run only on a macOS host. An `ios` context on Windows or Linux skips with a reason. Mobile browser testing isn't available yet, so a mobile context with a browser step skips.

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

## Requirements (`requires`)

Use `requires` to gate a context on host capabilities beyond the operating system: commands on the PATH, files on disk, or environment variables. If any requirement is unmet, Doc Detective skips the context (the same non-failing outcome as a `platforms` mismatch) and reports each missing requirement.

`requires` accepts three shapes:

- A string names one required command:

  ```json
  {
    "platforms": ["windows", "mac", "linux"],
    "requires": "node"
  }
  ```

- An array names several required commands (all must be present):

  ```json
  {
    "requires": ["node", "ffmpeg"]
  }
  ```

- An object checks commands, files, and environment variables. File paths support `$VAR` expansion, and `$HOME` falls back to `USERPROFILE` on Windows. Environment variables must have a non-empty value.

  ```json
  {
    "platforms": ["mac", "linux"],
    "requires": {
      "commands": ["claude"],
      "files": ["$HOME/.config/app.toml"],
      "env": ["ANTHROPIC_API_KEY"]
    }
  }
  ```

All entries combine with AND. A context can consist of only a `requires` gate: with `platforms` omitted, it runs on the current platform whenever the environment meets every requirement.

You don't need `requires` for browsers or drivers, because Doc Detective's own preflight detects, installs, and repairs those automatically.

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

## Contexts and multiple browsers

`browsers` does two jobs: it names the test's **default browser surface**, and — when it lists several engines — it fans the test out to run once per engine. A test can also open **additional** browsers at runtime with a `goTo` step's `surface` field (see [Test across multiple tabs, windows, and browsers](/docs/test-docs/multiple-tabs-and-windows)). Only `goTo` opens those browsers, and `runOn` never lists them.

Pin a browser **or** fan out — not both. The engine fan-out suits browser-*agnostic* tests. A test that pins `surface: { "browser": "firefox" }` in its steps would open Firefox alongside every matrix engine, so give it a single `browsers` entry instead.
