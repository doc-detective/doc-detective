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
 * A cookie file path ending in `.txt`, or a cookie name. `session.txt` saves the cookie named `session` to `session.txt` in `outputDir`. Any other value saves the cookie with that name to the environment variable of the same name.
 */
export type CookieName = string;
export type SaveCookieDetailed = {
  [k: string]: unknown;
} & {
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
};
/**
 * Name of the specific cookie to save.
 */
export type CookieName1 = string;
/**
 * Environment variable name to store the cookie as JSON string. To read it later as `$NAME`, use only letters, digits, and underscores.
 */
export type EnvironmentVariableName = string;
/**
 * File path to save the cookie, in Netscape cookie format. A relative path resolves against `directory`, or against `outputDir` when `directory` is omitted.
 */
export type CookieFilePath = string;
/**
 * Directory to save the cookie file in. A relative directory resolves against the spec file. Omit it to save under `outputDir`.
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
