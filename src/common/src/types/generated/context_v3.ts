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
