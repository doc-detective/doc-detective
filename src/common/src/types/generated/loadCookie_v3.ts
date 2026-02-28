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
  [k: string]: unknown;
};
