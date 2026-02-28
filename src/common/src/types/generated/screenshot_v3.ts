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
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
 */
export type ScreenshotSimple = string;
/**
 * File path of the PNG file. Accepts absolute paths. If not specified, the file name is the ID of the step.
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
