/* eslint-disable */
/**
 * Auto-generated from spec_v3.schema.json
 * Do not edit manually
 */

/**
 * OpenAPI description and configuration.
 */
export type OpenApi = {
  [k: string]: unknown;
};
/**
 * A Doc Detective test.
 */
export type Test =
  | {
      [k: string]: unknown;
    }
  | {
      [k: string]: unknown;
    };

export interface Specification {
  /**
   * JSON Schema for this object.
   */
  $schema?: "https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/spec_v3.schema.json";
  /**
   * Unique identifier for the test specification.
   */
  specId?: string;
  /**
   * Description of the test specification.
   */
  description?: string;
  /**
   * Path to the test specification.
   */
  specPath?: string;
  /**
   * Path to the content that the specification is associated with.
   */
  contentPath?: string;
  /**
   * Contexts to run the test in. Overrides contexts defined at the config and spec levels.
   */
  runOn?: Context[];
  openApi?: (OpenApi & OpenAPIDescriptionTest)[];
  /**
   * [Tests](test) to perform.
   *
   * @minItems 1
   */
  tests: [Test, ...Test[]];
  [k: string]: unknown;
}
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
export interface OpenAPIDescriptionTest {
  [k: string]: unknown;
}
