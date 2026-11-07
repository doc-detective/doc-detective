/* eslint-disable */
/**
 * Auto-generated from checkLink_v3.schema.json
 * Do not edit manually
 */

export type CheckLink = CheckLinkSimple | CheckLinkDetailed;
/**
 * Check that a URL returns an accepted status code to a GET request: an absolute `http://` or `https://` URL, a path that starts with `/`, or a value that starts with an environment variable. A path is joined to `origin` from the config.
 */
export type CheckLinkSimple = string;
/**
 * An absolute `http://` or `https://` URL, a path that starts with `/`, or a value that starts with an environment variable, such as `$BASE_URL/docs`. A path is joined to `origin`.
 */
export type TargetURL = string;
/**
 * Additional HTTP headers to include in the request. Merged on top of Doc Detective's default browser-mimicking headers. Useful for sites behind bot protection or WAFs that allowlist specific headers (for example, a Cloudflare Access service token or a `Cookie` with a `cf_clearance` value).
 */
export type RequestHeaders = RequestHeadersObject | RequestHeadersString;
export type RequestHeadersString = string;

/**
 * Check if an HTTP or HTTPS URL returns an acceptable status code from a GET request.
 */
export interface CheckLinkDetailed {
  url: TargetURL;
  /**
   * Protocol and domain to join to a `url` that starts with `/`. Overrides `origin` in the config.
   */
  origin?: string;
  /**
   * Query parameters to append to the resolved URL. Merged on top of `originParams` from config; step keys win on collision. If `url` already contains a colliding query key, the value here replaces it. Values support environment variable substitution via `$VAR` syntax. WARNING: values are embedded in the request URL and appear in test results, logs, and reports.
   */
  params?: {
    [k: string]: string;
  };
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails. A single integer is treated as a one-item list.
   */
  statusCodes?: number | number[];
  headers?: RequestHeaders;
}
export interface RequestHeadersObject {
  [k: string]: string;
}
