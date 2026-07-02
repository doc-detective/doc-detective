/* eslint-disable */
/**
 * Auto-generated from record_v3.schema.json
 * Do not edit manually
 */

/**
 * Start recording. Must be followed by a `stopRecord` step. The `browser` engine captures the Chrome viewport (works under concurrency); the `ffmpeg` engine captures the screen and supports any application. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
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
 * Recording engine to use. Either a string shorthand selecting the engine with defaults, or an object for full control. If unset, defaults to the `browser` engine when a visible Chrome context is available and to `ffmpeg` otherwise.
 */
export type RecordingEngine = RecordingEngineSimple | RecordingEngineDetailed;
/**
 * `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
 */
export type RecordingEngineSimple = "browser" | "ffmpeg";
/**
 * If `true`, starts recording — auto-selecting the `browser` engine for a visible Chrome context and the `ffmpeg` engine otherwise. If `false`, doesn't record.
 */
export type RecordBoolean = boolean;

export interface RecordDetailed {
  /**
   * The browser window/tab to record. Omit to record the active tab. The targeted tab stays focused afterward.
   */
  surface?: SurfaceByName | BrowserSurface;
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists.
   */
  overwrite?: "true" | "false";
  /**
   * Identifier for this recording. A later `stopRecord` step can target it by name (`stopRecord: "<name>"`), which is how you stop a specific recording when several overlap. Names must be unique among recordings that are active at the same time. If omitted, the recording is anonymous and is stopped LIFO by an untargeted `stopRecord`.
   */
  name?: string;
  engine?: RecordingEngine;
  [k: string]: unknown;
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
export interface RecordingEngineDetailed {
  /**
   * Recording engine. `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
   */
  name: "browser" | "ffmpeg";
  /**
   * What the `ffmpeg` engine captures. `display` records the full screen, `window` the active window, `viewport` the browser content area. Ignored by the `browser` engine, which always captures its tab. `window` and `viewport` are best-effort (captured full-screen, then cropped).
   */
  target?: "display" | "window" | "viewport";
  /**
   * Capture frame rate for the `ffmpeg` engine.
   */
  fps?: number;
}
