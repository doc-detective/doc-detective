/* eslint-disable */
/**
 * Auto-generated from loadState_v3.schema.json
 * Do not edit manually
 */

/**
 * Load the cookies and `localStorage` saved by `saveState`, or by Playwright's `storageState`, into the open site. Open the site with `goTo` first.
 */
export type LoadState = StateFilePath | LoadStateDetailed;
/**
 * Path of the state file, ending in `.json`. A relative path resolves against `outputDir`.
 */
export type StateFilePath = string;
/**
 * Path of the state file, ending in `.json`. A relative path resolves against `directory`, or against `outputDir` when `directory` is omitted.
 */
export type StateFilePath1 = string;
/**
 * Directory to load the state file from. A relative directory resolves against the spec file. Omit it to load from `outputDir`.
 */
export type DirectoryPath = string;

export interface LoadStateDetailed {
  path: StateFilePath1;
  directory?: DirectoryPath;
}
