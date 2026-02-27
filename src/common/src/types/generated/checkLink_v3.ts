/* eslint-disable */
/**
 * Auto-generated from checkLink_v3.schema.json
 * Do not edit manually
 */

export type CheckLink = CheckLinkDetailed | CheckLinkDetailed1;
/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export type CheckLinkDetailed = string;

/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed1 {
  /**
   * URL to check. Can be a full URL or a path. If a path is provided, `origin` must be specified.
   */
  url: string;
  /**
   * Protocol and domain to navigate to. Prepended to `url`.
   */
  origin?: string;
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
}
