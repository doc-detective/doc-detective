/* eslint-disable */
/**
 * Auto-generated from record_v3.schema.json
 * Do not edit manually
 */

/**
 * Start recording the current browser viewport. Must be followed by a `stopRecord` step. Only runs in Chrome browsers when they are visible. Supported extensions: [ '.mp4', '.webm', '.gif' ]
 */
export type Record = RecordSimple | RecordDetailed | RecordBoolean;
/**
 * File path of the recording. Supports the `.mp4`, `.webm`, and `.gif` extensions. If not specified, the file name is the ID of the step, and the extension is `.mp4`.
 */
export type RecordSimple = string;
/**
 * If `true`, records the current browser viewport. If `false`, doesn't record the current browser viewport.
 */
export type RecordBoolean = boolean;

export interface RecordDetailed {
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
  [k: string]: unknown;
}
