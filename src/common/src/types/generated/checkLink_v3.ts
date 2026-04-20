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
 * Headers to include in the HTTP request, as newline-separated values. For example, `X-Api-Key: abc123
 * Authorization: Bearer token`.
 */
export type RequestHeadersString = string;

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
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number | number[];
  /**
   * Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Useful for sites behind bot protection or WAFs that allowlist specific headers (for example, a Cloudflare Access service token or a `Cookie` with a `cf_clearance` value).
   */
  headers?: RequestHeadersObject | RequestHeadersString;
}
/**
 * Headers to include in the HTTP request, in key/value format. Values must be strings.
 */
export interface RequestHeadersObject {
  [k: string]: string;
}
