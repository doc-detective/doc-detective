/* eslint-disable */
/**
 * Auto-generated from saveState_v3.schema.json
 * Do not edit manually
 */

/**
 * Save the open site's cookies and `localStorage` to a JSON file in Playwright's `storageState` format, so later tests can sign in with `loadState`.
 */
export type SaveState = StateFilePath | SaveStateDetailed;
/**
 * Path of the state file, ending in `.json`. A relative path resolves against `outputDir`.
 */
export type StateFilePath = string;
/**
 * Path of the state file, ending in `.json`. A relative path resolves against `directory`, or against `outputDir` when `directory` is omitted.
 */
export type StateFilePath1 = string;
/**
 * Directory to save the state file in. A relative directory resolves against the spec file. Omit it to save under `outputDir`.
 */
export type DirectoryPath = string;
/**
 * Whether to replace an existing state file.
 */
export type OverwriteExistingFile = boolean;

export interface SaveStateDetailed {
  path: StateFilePath1;
  directory?: DirectoryPath;
  overwrite?: OverwriteExistingFile;
}
