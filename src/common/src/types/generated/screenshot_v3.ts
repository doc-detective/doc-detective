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
export type CaptureScreenshotDetailed = AppCapturesDonTSupportCropYet;
/**
 * If `true`, captures a screenshot. If `false`, doesn't capture a screenshot.
 */
export type CaptureScreenshot = boolean;

export interface AppCapturesDonTSupportCropYet {
  [k: string]: unknown;
}
