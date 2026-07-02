/* eslint-disable */
/**
 * Auto-generated from screenshot_v3.schema.json
 * Do not edit manually
 */

/**
 * Takes a screenshot in PNG format.
 */
export type Screenshot = ScreenshotSimple | CaptureScreenshotDetailed | CaptureScreenshot;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple = string;
/**
 * Name of the surface. A browser engine keyword (chrome|firefox|safari|webkit|edge) targets that browser; any other string names a background process. To target a browser window or tab, use the object form ({ "browser": …, "window": …, "tab": … }) — a plain string is never a window/tab name.
 */
export type SurfaceByName = string;
/**
 * Which window to act on. Omit to use the active window.
 */
export type WindowTabSelector = ByIndex | ByName | ByCriteria;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName = string;
/**
 * Which tab to act on. Omit to use the active tab. Without `window`, the selector searches every tab in creation order — including tabs the page opened itself.
 */
export type WindowTabSelector1 = ByIndex1 | ByName1 | ByCriteria1;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest.
 */
export type ByIndex1 = number;
/**
 * Name assigned when the window/tab was opened (goTo `newTab`/`newWindow`). The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName1 = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step. If an `http(s)` URL is supplied, the remote image is downloaded and used as a read-only reference for comparison; the new capture is written to a local run-specific folder instead of being uploaded back to the URL.
 */
export type ScreenshotSimple1 = string;
/**
 * Display text or selector of the element to screenshot.
 */
export type CropByElementSimple = string;
/**
 * Crop the screenshot to a specific element.
 */
export type CropByElementDetailed = {
  [k: string]: unknown;
};
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;

export interface CaptureScreenshotDetailed {
  /**
   * The browser window/tab to capture. Omit to capture the active tab. The targeted tab stays focused afterward.
   */
  surface?: SurfaceByName | BrowserSurface;
  path?: ScreenshotSimple1;
  /**
   * Directory of the PNG file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of pixels between the new screenshot and the existing screenshot at `path`. If the difference between the new screenshot and the existing screenshot is greater than `maxVariation`, the step fails. If a screenshot doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing screenshot at `path` if it exists.
   * If `aboveVariation`, overwrites the existing screenshot at `path` if the difference between the new screenshot and the existing screenshot is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  crop?: CropByElementSimple | CropByElementDetailed;
  sourceIntegration?: SourceIntegration;
}
export interface BrowserSurface {
  /**
   * Browser engine. Must be the context's active browser; targeting a different browser at the same time lands in a later phase.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Reserved for multi-browser targeting (later phase).
   */
  name?: string;
  window?: WindowTabSelector;
  tab?: WindowTabSelector1;
}
export interface ByCriteria {
  /**
   * Name assigned when the window/tab was opened.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Page title to match. Substring, or /regex/.
   */
  title?: string;
  /**
   * Page URL to match. Substring, or /regex/.
   */
  url?: string;
}
export interface ByCriteria1 {
  /**
   * Name assigned when the window/tab was opened.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Page title to match. Substring, or /regex/.
   */
  title?: string;
  /**
   * Page URL to match. Substring, or /regex/.
   */
  url?: string;
}
/**
 * Information about the source integration for this screenshot, enabling upload of changed files back to the source CMS. Set automatically during test resolution for files from integrations.
 */
export interface SourceIntegration {
  /**
   * The type of integration. Currently supported: 'heretto'. Additional types may be added in the future.
   */
  type: "heretto";
  /**
   * The name of the integration configuration in the config file. Used to look up authentication credentials.
   */
  integrationName: string;
  /**
   * The unique identifier (UUID) of the file in the source CMS. If not provided, the file will be looked up by path.
   */
  fileId?: string;
  /**
   * The path of the file in the source CMS. Used for lookup if fileId is not available.
   */
  filePath?: string;
  /**
   * The local path to the file that references this source. Used for resolving relative paths.
   */
  contentPath?: string;
}
