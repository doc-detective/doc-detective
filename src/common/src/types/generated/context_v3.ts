/* eslint-disable */
/**
 * Auto-generated from context_v3.schema.json
 * Do not edit manually
 */

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
  platforms?: ("linux" | "mac" | "windows") | ("linux" | "mac" | "windows")[];
  /**
   * Browsers to run tests on.
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
   * Capabilities the environment must provide for this context to run. A string names a required command; an array names several; the object form checks commands (on PATH), files (paths, with `$VAR`/`$HOME` expansion), and environment variables. All entries are AND-ed. Any unmet requirement marks the context as SKIPPED — the same non-failing outcome as a `platforms` mismatch.
   */
  requires?: string | [string, ...string[]] | Requirements;
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
