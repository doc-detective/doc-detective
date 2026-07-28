/* eslint-disable */
/**
 * Auto-generated from saveCookie_v3.schema.json
 * Do not edit manually
 */

/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 */
export type SaveCookie = CookieName | SaveCookieDetailed;
/**
 * Name of the specific cookie to save. Will be saved to a default file path or environment variable.
 */
export type CookieName = string;
export type SaveCookieDetailed = {
  /**
   * Optional self-describing schema URI for linters
   */
  $schema?: string;
  name: CookieName1;
  variable?: EnvironmentVariableName;
  path?: CookieFilePath;
  directory?: DirectoryPath;
  overwrite?: OverwriteExistingFile;
  domain?: CookieDomain;
} & {
  [k: string]: unknown;
};
/**
 * Name of the specific cookie to save.
 */
export type CookieName1 = string;
/**
 * Environment variable name to store the cookie as JSON string.
 */
export type EnvironmentVariableName = string;
/**
 * File path to save the cookie, relative to directory. Uses Netscape cookie format.
 */
export type CookieFilePath = string;
/**
 * Directory to save the cookie file. If not specified, uses output directory.
 */
export type DirectoryPath = string;
/**
 * Whether to overwrite existing cookie file.
 */
export type OverwriteExistingFile = boolean;
/**
 * Specific domain to filter the cookie by (optional).
 */
export type CookieDomain = string;
