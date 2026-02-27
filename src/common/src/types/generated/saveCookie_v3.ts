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
  [k: string]: unknown;
};
