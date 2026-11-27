/* eslint-disable */
/**
 * Auto-generated from checkFile_v3.schema.json
 * Do not edit manually
 */

/**
 * Wait for a finished file, and optionally check its text. A file is finished once it has no `.crdownload` or `.part` suffix, no in-progress sibling of the same name with one of those suffixes, and its size stays the same for 250 ms. Outputs `filePath`, `fileName`, and `fileSize`.
 */
export type CheckFile = CheckFileSimple | CheckFileDetailed;
/**
 * Glob for the file to wait for. A relative path resolves against the spec file.
 */
export type CheckFileSimple = string;
export type CheckFileDetailed = {
  [k: string]: unknown;
} & {
  /**
   * Glob for the file to wait for. A relative path resolves against the spec file. When several files match, the newest finished one counts.
   */
  path?: string;
  /**
   * Glob for a file name in the context's download folder. Each `checkFile` returns the oldest finished download that no earlier `checkFile` in the context returned. Needs a desktop Chrome or Firefox context opened by an earlier step. In other contexts, the step is skipped.
   */
  download?: string;
  /**
   * Text the file must contain, read as UTF-8. A value that starts and ends with `/` is a regular expression.
   */
  content?: string;
  /**
   * Maximum time in milliseconds to wait for a finished match.
   */
  timeout?: number;
};
