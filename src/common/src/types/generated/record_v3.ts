/* eslint-disable */
/**
 * Auto-generated from record_v3.schema.json
 * Do not edit manually
 */

/**
 * Start recording. Must be followed by a `stopRecord` step. The `browser` engine captures the Chrome viewport (works under concurrency); the `ffmpeg` engine captures the screen and supports any application. On Android/iOS contexts, recording captures the device screen through the device itself — `engine` doesn't apply. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
/**
 * Browser engine keyword. Targets that browser. Steps that can only ever act on a browser (not a background process) restrict the bare-string form to this enum, so a process name here is rejected at validation time instead of failing at runtime.
 */
export type SurfaceByBrowserEngine = "chrome" | "firefox" | "safari" | "webkit" | "edge";
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
 * Which app window to act on. Omit to use the active window. Apps have windows, no tabs.
 */
export type AppWindowSelector = ByIndex2 | ByName2 | ByCriteria2;
/**
 * Index in creation order. Negative counts from the end; `-1` is the newest (e.g. a dialog the app just opened).
 */
export type ByIndex2 = number;
/**
 * Assigned window name. The integer branch is listed first because Ajv validates with coerceTypes — string-first would coerce integer indexes into name strings.
 */
export type ByName2 = string;
/**
 * Recording engine to use. Either a string shorthand selecting the engine with defaults, or an object for full control. If unset, defaults to the `browser` engine when a visible Chrome context is available and to `ffmpeg` otherwise.
 */
export type RecordingEngine = RecordingEngineSimple | RecordingEngineDetailed;
/**
 * `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
 */
export type RecordingEngineSimple = "browser" | "ffmpeg";
/**
 * Capture a checkpoint screenshot after every step while this recording is active and compare each against a persistent baseline stored beside the recording (`<path>.checkpoints/` by default). Baselines seed on the first run; on later runs, per-checkpoint variation is reported in the `stopRecord` step's outputs, and variation beyond `maxVariation` surfaces as a WARNING. If `false` or unset, no checkpoints are captured.
 */
export type RecordingCheckpoints = RecordingCheckpointsBoolean | RecordingCheckpointsDetailed;
/**
 * If `true`, enables checkpoints with default settings.
 */
export type RecordingCheckpointsBoolean = boolean;
/**
 * If `true`, starts recording — auto-selecting the `browser` engine for a visible Chrome context, the device screen on Android/iOS contexts, and the `ffmpeg` engine otherwise. If `false`, doesn't record.
 */
export type RecordBoolean = boolean;

export interface RecordDetailed {
  /**
   * The browser window/tab or app window to record. Omit to record the active surface. The targeted surface stays focused afterward. App surfaces use the object form ({ "app": … }) and are captured via the `ffmpeg` engine, cropped to the app window by default.
   */
  surface?: SurfaceByBrowserEngine | BrowserSurface | AppSurface;
  /**
   * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
   */
  path?: string;
  /**
   * Directory of the file. If the directory doesn't exist, creates the directory.
   */
  directory?: string;
  /**
   * If `true`, overwrites the existing recording at `path` if it exists. If `false`, skips the recording when the file already exists. If `aboveVariation`, always records, but replaces the existing file (and its checkpoint baselines) only when the span's checkpoint screenshots show it meaningfully changed — requires `checkpoints`, so it turns them on with defaults when `checkpoints` is omitted or `false`; set `checkpoints` to an object to tune `maxVariation` or `directory`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
  /**
   * Identifier for this recording. A later `stopRecord` step can target it by name (`stopRecord: "<name>"`), which is how you stop a specific recording when several overlap. Names must be unique among recordings that are active at the same time. If omitted, the recording is anonymous and is stopped LIFO by an untargeted `stopRecord`.
   */
  name?: string;
  engine?: RecordingEngine;
  checkpoints?: RecordingCheckpoints;
  [k: string]: unknown;
}
export interface BrowserSurface {
  /**
   * Browser engine. Selects the browser surface with that engine (or the one named by `name`). A goTo step opens the browser if it isn't open yet — you can also open one explicitly with `startSurface`; other steps require it to already be open.
   */
  browser: "chrome" | "firefox" | "safari" | "webkit" | "edge";
  /**
   * Name of the browser surface. Defaults to the engine name (the context's default browser registers under its engine). Assign distinct names to drive multiple browsers at once, including several of the same engine.
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
export interface AppSurface {
  /**
   * Name of an app surface opened by `startSurface` (its `name`, or the default derived from the app identifier).
   */
  app: string;
  window?: AppWindowSelector;
}
export interface ByCriteria2 {
  /**
   * Assigned window name.
   */
  name?: string;
  /**
   * Index in creation order. Negative counts from the end.
   */
  index?: number;
  /**
   * Window title to match. Substring, or /regex/.
   */
  title?: string;
}
export interface RecordingEngineDetailed {
  /**
   * Recording engine. `browser` records the Chrome viewport (concurrency-safe); `ffmpeg` records the screen and supports any application.
   */
  name: "browser" | "ffmpeg";
  /**
   * What the `ffmpeg` engine captures. `display` records the full screen, `window` the active window, `viewport` the browser content area. Ignored by the `browser` engine, which always captures its tab. `window` and `viewport` are best-effort (captured full-screen, then cropped). If unset, defaults to `window` when the recording's `surface` is an app surface and to `display` otherwise. `viewport` doesn't apply to app surfaces (they have no browser viewport).
   */
  target?: "display" | "window" | "viewport";
  /**
   * Capture frame rate for the `ffmpeg` engine.
   */
  fps?: number;
}
export interface RecordingCheckpointsDetailed {
  /**
   * Maximum fractional pixel difference tolerated between a checkpoint and its baseline before the drift surfaces as a WARNING.
   */
  maxVariation?: number;
  /**
   * Directory for the checkpoint baselines. If unset, defaults to a `.checkpoints` directory beside the recording (for example, `demo.mp4.checkpoints/`).
   */
  directory?: string;
}
