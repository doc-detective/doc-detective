/* eslint-disable */
/**
 * Auto-generated from loadCookie_v3.schema.json
 * Do not edit manually
 */

/**
 * Load a specific cookie from a file or environment variable into the browser.
 */
export type LoadCookie = CookieNameOrFilePath | LoadCookieDetailed;
/**
 * A cookie file path ending in `.txt`, or a cookie name. `session.txt` loads the cookie named `session` from `session.txt` in `outputDir`. Any other value loads the cookie from the environment variable of the same name.
 */
export type CookieNameOrFilePath = string;
export type LoadCookieDetailed = {
  [k: string]: unknown;
} & {
  /**
   * Optional self-describing schema URI for linters
   */
  $schema?: string;
  name: CookieName;
  variable?: EnvironmentVariableName;
  path?: CookieFilePath;
  directory?: DirectoryPath;
  domain?: CookieDomain;
};
/**
 * Name of the specific cookie to load.
 */
export type CookieName = string;
/**
 * Environment variable name containing the cookie as JSON string.
 */
export type EnvironmentVariableName = string;
/**
 * File path to the cookie file, in Netscape cookie format. A relative path resolves against `directory`, or against `outputDir` when `directory` is omitted.
 */
export type CookieFilePath = string;
/**
 * Directory containing the cookie file. A relative directory resolves against the spec file. Omit it to load from `outputDir`.
 */
export type DirectoryPath = string;
/**
 * Specific domain to filter the cookie by when loading from multi-cookie file (optional).
 */
export type CookieDomain = string;
