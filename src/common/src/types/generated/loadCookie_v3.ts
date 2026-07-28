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
 * Name of the specific cookie to load from default location, or file path to cookie file.
 */
export type CookieNameOrFilePath = string;
export type LoadCookieDetailed = {
  /**
   * Optional self-describing schema URI for linters
   */
  $schema?: string;
  name: CookieName;
  variable?: EnvironmentVariableName;
  path?: CookieFilePath;
  directory?: DirectoryPath;
  domain?: CookieDomain;
} & {
  [k: string]: unknown;
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
 * File path to cookie file, relative to directory. Supports Netscape cookie format.
 */
export type CookieFilePath = string;
/**
 * Directory containing the cookie file.
 */
export type DirectoryPath = string;
/**
 * Specific domain to filter the cookie by when loading from multi-cookie file (optional).
 */
export type CookieDomain = string;
