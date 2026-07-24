/* eslint-disable */
/**
 * Auto-generated from context_v3.schema.json
 * Do not edit manually
 */

export type DeviceByName = string;

/**
 * A context in which to perform tests. If no contexts are specified but a context is required by one or more tests, Doc Detective attempts to identify a supported context in the current environment and run tests against it. For example, if a browser isn't specified but is required by steps in the test, Doc Detective will search for and use a supported browser available in the current environment.
 */
export interface Context {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/context_v3.schema.json";
  /**
   * Unique identifier for the context.
   */
  contextId?: string;
  /**
   * Platforms to run tests on.
   */
  platforms?: ("linux" | "mac" | "windows" | "android" | "ios") | ("linux" | "mac" | "windows" | "android" | "ios")[];
  /**
   * Browsers to run tests on. On a mobile (`android`/`ios`) platform entry, the browser runs on the managed device: `chrome` on Android, `safari` on iOS (other combinations skip the context), and it fills in automatically when omitted. Device browsers don't take desktop display config: authored `window`/`viewport` dimensions and `headless: false` are rejected on mobile entries (the device owns its display — control it via the device descriptor's `headless`/`deviceType`); `headless: true` matches this schema's default and is ignored.
   */
  browsers?:
    | ("chrome" | "firefox" | "safari" | "webkit")
    | Browser
    | (("chrome" | "firefox" | "safari" | "webkit") | Browser1)[];
  /**
   * Per-context override for the config-level [`browserFallback`](config) policy that governs whether a context whose browser can't start a driver session falls back to another available browser. Accepts the same values — `auto`, `explicit`, `off` — and, when set, takes precedence over the config-level value for the contexts this entry expands into. Omit it to inherit the config-level policy (which itself defaults to `auto`).
   */
  browserFallback?: "auto" | "explicit" | "off";
  /**
   * Per-context override for the config-level [`retries`](config) policy — how many times to re-run this context on a fresh session when its session dies mid-run. When set, takes precedence over the config-level value for the contexts this entry expands into. Omit it to inherit the config-level policy (which defaults to `1`). Set to `0` to disable retries for this context.
   */
  retries?: number;
  /**
   * Capabilities the environment must provide for this context to run. A string names a required command; an array names several; the object form checks commands (on PATH), files (paths, with `$VAR`/`$HOME` expansion), and environment variables. All entries are AND-ed. Any unmet requirement marks the context as SKIPPED — the same non-failing outcome as a `platforms` mismatch.
   */
  requires?: string | [string, ...string[]] | Requirements;
  /**
   * Default device for a mobile (`android`/`ios`) context. A string references a device by name; an object refines it. The `platform` is implied by the context, so it is not required here. When the named device doesn't already exist, Doc Detective creates it with defaults (see `deviceType`/`osVersion`), provided the toolchain is installed (`doc-detective install android` or `doc-detective install ios`). Same shape as `startSurface.device`.
   */
  device?: DeviceByName | DeviceDescriptor;
}
/**
 * Browser configuration.
 */
export interface Browser {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * Set automatically during context resolution: `true` when the author explicitly requested this browser (as opposed to it being auto-selected as the default). The runner's cross-browser fallback uses it to decide whether substituting another engine reports `PASS` (auto-selected) or `WARNING` (explicitly pinned).
   */
  explicit?: boolean;
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow;
  viewport?: BrowserViewport;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
/**
 * Browser configuration.
 */
export interface Browser1 {
  /**
   * Name of the browser.
   */
  name: "chrome" | "firefox" | "safari" | "webkit";
  /**
   * Set automatically during context resolution: `true` when the author explicitly requested this browser (as opposed to it being auto-selected as the default). The runner's cross-browser fallback uses it to decide whether substituting another engine reports `PASS` (auto-selected) or `WARNING` (explicitly pinned).
   */
  explicit?: boolean;
  /**
   * If `true`, runs the browser in headless mode.
   */
  headless?: boolean;
  window?: BrowserWindow1;
  viewport?: BrowserViewport1;
}
/**
 * Browser dimensions.
 */
export interface BrowserWindow1 {
  /**
   * Width of the browser window in pixels.
   */
  width?: number;
  /**
   * Height of the browser window in pixels.
   */
  height?: number;
}
/**
 * Viewport dimensions.
 */
export interface BrowserViewport1 {
  /**
   * Width of the viewport in pixels.
   */
  width?: number;
  /**
   * Height of the viewport in pixels.
   */
  height?: number;
}
export interface Requirements {
  /**
   * Commands that must be resolvable on the PATH.
   *
   * @minItems 1
   */
  commands?: [string, ...string[]];
  /**
   * Files that must exist. Entries support `$VAR` and `$HOME` expansion.
   *
   * @minItems 1
   */
  files?: [string, ...string[]];
  /**
   * Environment variables that must be set to a non-empty value.
   *
   * @minItems 1
   */
  env?: [string, ...string[]];
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
