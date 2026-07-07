/* eslint-disable */
/**
 * Auto-generated from startSurface_v3.schema.json
 * Do not edit manually
 */

/**
 * Open (provision) one or more surfaces and register them by name so later steps can target them with `surface`. Three kinds: a native APP (Windows/macOS desktop by executable path, `.app` path, bundle ID, or UWP AppUserModelID; Android/iOS apps on managed emulators/simulators — macOS desktop additionally requires the Accessibility permission for the process that runs Doc Detective), a BROWSER session (opens blank and ready on the context's automation server; navigate it with a `goTo` step), or a background PROCESS (equivalent to `runShell` with `background` — both forms stay valid). An ARRAY of descriptors opens them all concurrently — the step completes when every one is ready, and device boots overlap. See docs/design/multi-surface-targeting.md and docs/design/native-app-surfaces.md.
 */
export type StartSurface = AppDescriptor | BrowserDescriptor | ProcessDescriptor | ParallelSurfaces;
export type DeviceByName = string;
/**
 * Wait for a specific element to exist on the app surface. Fields with no accessibility mapping on the target platform fail at runtime with the supported alternative named.
 */
export type ElementCriteria = {
  [k: string]: unknown;
};
/**
 * Open several surfaces concurrently (any mix of kinds). All descriptors launch in parallel; the step completes when every one is ready. Names must be unique within the array and across the context's open surfaces (checked at runtime). Device boots overlap — worth real wall-clock on 30–60s emulator starts.
 *
 * @minItems 1
 */
export type ParallelSurfaces = [
  AppDescriptor1 | BrowserDescriptor1 | ProcessDescriptor1,
  ...(AppDescriptor1 | BrowserDescriptor1 | ProcessDescriptor1)[],
];
export type DeviceByName1 = string;
/**
 * Wait for a specific element to exist on the app surface. Fields with no accessibility mapping on the target platform fail at runtime with the supported alternative named.
 */
export type ElementCriteria1 =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };

export interface AppDescriptor {
  /**
   * The app identifier: an executable path (`C:\\Windows\\System32\\notepad.exe`), a `.app` path, a bundle ID (`com.apple.TextEdit`), a package name (`com.example.myapp`), or a UWP AppUserModelID (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`). Disambiguated by syntax — never by a type field.
   */
  app: string;
  /**
   * Surface-registry name later steps use in `surface`. Default: the executable basename without extension, or the final dot-segment of an ID.
   */
  name?: string;
  /**
   * Launch arguments (desktop apps). On macOS they pass to the app as a real argument array. On Windows they join into a single shell-style argument string for the driver, so an argument with embedded spaces must carry its own quotes (e.g. "\"My File.txt\"").
   */
  args?: string[];
  /**
   * Working directory for the launched app. Not honored by the current desktop app drivers, so a non-default value fails with guidance: on Windows the NovaWindows driver ignores it (the app inherits the driver's own working directory), and on macOS the driver launches apps through LaunchServices, which offers no working-directory control. Launch the app via runShell if the cwd matters. Reserved for when a driver gains support. Default: the run's working directory.
   */
  workingDirectory?: string;
  /**
   * Extra environment variables for the launched app (desktop apps). Supported on macOS; not supported by the Windows driver, where any value fails with guidance (set variables in the shell that launches Doc Detective instead).
   */
  env?: {
    [k: string]: string;
  };
  /**
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Supported on Android and iOS app surfaces.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Android-only.
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app, or (in a mobile context) to use the context's default device. A string references a device by name; an object refines it. Supported on Android and iOS mobile targets.
   */
  device?:
    | DeviceByName
    | (DeviceDescriptor & {
        [k: string]: unknown;
      });
  /**
   * Escape-hatch passthrough: merged into the automation session's capabilities after the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`). Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
  waitUntil?: AppReadiness;
  /**
   * Startup ceiling in milliseconds (launch + install + readiness).
   */
  timeout?: number;
}
export interface DeviceDescriptor {
  /**
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed image/runtime for the target platform (install more with `doc-detective install android` or `doc-detective install ios`). Ignored when `name` already matches an existing device. Default: the newest installed version.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. No-op on iOS (simulators boot without the Simulator UI on CI) and ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
/**
 * Startup readiness: a fixed delay and/or an element that must exist before the surface is considered open. No condition applies by default.
 */
export interface AppReadiness {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria;
}
export interface BrowserDescriptor {
  /**
   * Browser engine to open. The session opens on the context's automation server with a blank page and registers as a surface; use a goTo step (with `surface`) to navigate it. No cross-engine fallback — the one exception is `edge`, which is Chromium and opens on the same Chrome/chromedriver stack (it registers under the `chrome` engine, and defaults its surface name to `chrome` when you don't set one).
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Surface-registry name later steps use in `surface`. Default: the engine name. Must be unique across all open surfaces — the context's default browser already owns its engine name, so name a second same-engine session explicitly. An engine keyword may only name a session of that engine.
   */
  name?: string;
  /**
   * Run this session headless. Default: the context's browser headless setting.
   */
  headless?: boolean;
  size?: BrowserWindowSize;
  viewport?: BrowserViewportSize;
  /**
   * Escape-hatch passthrough: merged into the session's capabilities after the ones Doc Detective computes. Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
}
/**
 * Outer window dimensions for this session. Default: the context's browser window size.
 */
export interface BrowserWindowSize {
  /**
   * Outer window width in pixels.
   */
  width?: number;
  /**
   * Outer window height in pixels.
   */
  height?: number;
}
/**
 * Viewport (page-content) dimensions for this session; the window is resized so the content area matches. Takes precedence over `size` when both are set.
 */
export interface BrowserViewportSize {
  /**
   * Viewport width in pixels.
   */
  width?: number;
  /**
   * Viewport height in pixels.
   */
  height?: number;
}
export interface ProcessDescriptor {
  /**
   * Shell command to start as a long-running background process (same shell semantics as runShell: pipes, `&&`, globbing, environment-variable expansion). Equivalent to a `runShell` step with `background` — both forms remain valid.
   */
  process: string;
  /**
   * Surface-registry name later steps use in `surface`, and the handle a closeSurface step stops. Unique across all open surfaces.
   */
  name: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the process.
   */
  workingDirectory?: string;
  /**
   * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the descriptor is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
   */
  tty?: boolean;
  /**
   * Conditions that must all be met before the process is considered ready and the descriptor completes. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the descriptor fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
   */
  waitUntil?: {
    /**
     * Wait until this TCP port accepts connections on localhost.
     */
    port?: number;
    /**
     * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
     */
    stdio?: string;
    /**
     * Wait until an HTTP GET request to this URL returns a 2xx status.
     */
    httpGet?: string;
    /**
     * Wait at least this many milliseconds.
     */
    delayMs?: number;
  };
  /**
   * Max time in milliseconds to wait for `waitUntil` before the descriptor fails.
   */
  timeout?: number;
}
export interface AppDescriptor1 {
  /**
   * The app identifier: an executable path (`C:\\Windows\\System32\\notepad.exe`), a `.app` path, a bundle ID (`com.apple.TextEdit`), a package name (`com.example.myapp`), or a UWP AppUserModelID (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`). Disambiguated by syntax — never by a type field.
   */
  app: string;
  /**
   * Surface-registry name later steps use in `surface`. Default: the executable basename without extension, or the final dot-segment of an ID.
   */
  name?: string;
  /**
   * Launch arguments (desktop apps). On macOS they pass to the app as a real argument array. On Windows they join into a single shell-style argument string for the driver, so an argument with embedded spaces must carry its own quotes (e.g. "\"My File.txt\"").
   */
  args?: string[];
  /**
   * Working directory for the launched app. Not honored by the current desktop app drivers, so a non-default value fails with guidance: on Windows the NovaWindows driver ignores it (the app inherits the driver's own working directory), and on macOS the driver launches apps through LaunchServices, which offers no working-directory control. Launch the app via runShell if the cwd matters. Reserved for when a driver gains support. Default: the run's working directory.
   */
  workingDirectory?: string;
  /**
   * Extra environment variables for the launched app (desktop apps). Supported on macOS; not supported by the Windows driver, where any value fails with guidance (set variables in the shell that launches Doc Detective instead).
   */
  env?: {
    [k: string]: string;
  };
  /**
   * Path to an installable artifact (`.apk`/`.app`/`.ipa`) to install on the device before launch. Supported on Android and iOS app surfaces.
   */
  install?: string;
  /**
   * Android main activity override (defaults to the package's launcher activity). Android-only.
   */
  activity?: string;
  /**
   * Device the app runs on. Omit for a host desktop app, or (in a mobile context) to use the context's default device. A string references a device by name; an object refines it. Supported on Android and iOS mobile targets.
   */
  device?:
    | DeviceByName1
    | (DeviceDescriptor1 & {
        [k: string]: unknown;
      });
  /**
   * Escape-hatch passthrough: merged into the automation session's capabilities after the ones Doc Detective computes (namespaced per driver, e.g. `appium:noReset`). Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
  waitUntil?: AppReadiness1;
  /**
   * Startup ceiling in milliseconds (launch + install + readiness).
   */
  timeout?: number;
}
export interface DeviceDescriptor1 {
  /**
   * Target platform. Selects the mobile driver. Required in `startSurface.device`; implied by the context in `context.device`.
   */
  platform?: "android" | "ios";
  /**
   * Device name and registry identity — the same name resolves to the same device. Reference form: names an existing AVD (Android) / simulator (iOS) to reuse. If no device by this name exists, Doc Detective creates one under this name using `deviceType`/`osVersion` (or their defaults), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`).
   */
  name?: string;
  /**
   * Abstract hardware profile used when creating a device (portable across `android`/`ios`). Doc Detective maps it to a built-in profile. Ignored when `name` already matches an existing device. Default: `phone`.
   */
  deviceType?: "phone" | "tablet";
  /**
   * Platform version used when creating a device; must match an installed image/runtime for the target platform (install more with `doc-detective install android` or `doc-detective install ios`). Ignored when `name` already matches an existing device. Default: the newest installed version.
   */
  osVersion?: string;
  /**
   * Run the Android emulator without a window. No-op on iOS (simulators boot without the Simulator UI on CI) and ignored where not applicable.
   */
  headless?: boolean;
  /**
   * Initial orientation. Reserved; validated now, not yet implemented.
   */
  orientation?: "portrait" | "landscape";
  /**
   * Pin a specific device/emulator instance by UDID. Reserved; validated now, not yet implemented.
   */
  udid?: string;
  /**
   * Cloud device farm configuration, keyed by provider. Reserved; validated now, not yet implemented.
   */
  provider?: {
    [k: string]: unknown;
  };
}
/**
 * Startup readiness: a fixed delay and/or an element that must exist before the surface is considered open. No condition applies by default.
 */
export interface AppReadiness1 {
  /**
   * Fixed delay (ms).
   */
  delayMs?: number;
  find?: ElementCriteria1;
}
export interface BrowserDescriptor1 {
  /**
   * Browser engine to open. The session opens on the context's automation server with a blank page and registers as a surface; use a goTo step (with `surface`) to navigate it. No cross-engine fallback — the one exception is `edge`, which is Chromium and opens on the same Chrome/chromedriver stack (it registers under the `chrome` engine, and defaults its surface name to `chrome` when you don't set one).
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Surface-registry name later steps use in `surface`. Default: the engine name. Must be unique across all open surfaces — the context's default browser already owns its engine name, so name a second same-engine session explicitly. An engine keyword may only name a session of that engine.
   */
  name?: string;
  /**
   * Run this session headless. Default: the context's browser headless setting.
   */
  headless?: boolean;
  size?: BrowserWindowSize1;
  viewport?: BrowserViewportSize1;
  /**
   * Escape-hatch passthrough: merged into the session's capabilities after the ones Doc Detective computes. Driver- and version-specific; use sparingly.
   */
  driverOptions?: {
    [k: string]: unknown;
  };
}
/**
 * Outer window dimensions for this session. Default: the context's browser window size.
 */
export interface BrowserWindowSize1 {
  /**
   * Outer window width in pixels.
   */
  width?: number;
  /**
   * Outer window height in pixels.
   */
  height?: number;
}
/**
 * Viewport (page-content) dimensions for this session; the window is resized so the content area matches. Takes precedence over `size` when both are set.
 */
export interface BrowserViewportSize1 {
  /**
   * Viewport width in pixels.
   */
  width?: number;
  /**
   * Viewport height in pixels.
   */
  height?: number;
}
export interface ProcessDescriptor1 {
  /**
   * Shell command to start as a long-running background process (same shell semantics as runShell: pipes, `&&`, globbing, environment-variable expansion). Equivalent to a `runShell` step with `background` — both forms remain valid.
   */
  process: string;
  /**
   * Surface-registry name later steps use in `surface`, and the handle a closeSurface step stops. Unique across all open surfaces.
   */
  name: string;
  /**
   * Arguments for the command.
   */
  args?: string[];
  /**
   * Working directory for the process.
   */
  workingDirectory?: string;
  /**
   * Run the process in a pseudo-terminal (PTY) instead of a pipe, so full-screen/interactive TUIs (those that check `isTTY`) render and accept keystrokes. Requires the PTY backend `@homebridge/node-pty-prebuilt-multiarch` to be installed (`npm install @homebridge/node-pty-prebuilt-multiarch`); it is not bundled, and if it is unavailable the descriptor is skipped. `stdout` and `stderr` are merged into one stream in PTY mode. PTY output includes raw ANSI escape sequences (colors, cursor movement); `waitUntil.stdio` patterns should target text that renders without interleaved control codes, or use a regex that tolerates them.
   */
  tty?: boolean;
  /**
   * Conditions that must all be met before the process is considered ready and the descriptor completes. Omit to consider the process ready as soon as it is spawned. Specify any combination; every condition given must pass before `timeout` elapses. Note: a process that forks a daemon and then exits (common for some Docker images and databases) is treated as having exited before becoming ready and the descriptor fails — use `port`, `httpGet`, or `delayMs` for those rather than a condition that depends on the foreground process staying alive.
   */
  waitUntil?: {
    /**
     * Wait until this TCP port accepts connections on localhost.
     */
    port?: number;
    /**
     * Wait until the process's output contains this content. Searches both stdout and stderr. Supports strings and regular expressions. To use a regular expression, the string must start and end with a forward slash, like in `/ready on \d+/`.
     */
    stdio?: string;
    /**
     * Wait until an HTTP GET request to this URL returns a 2xx status.
     */
    httpGet?: string;
    /**
     * Wait at least this many milliseconds.
     */
    delayMs?: number;
  };
  /**
   * Max time in milliseconds to wait for `waitUntil` before the descriptor fails.
   */
  timeout?: number;
}
