/* eslint-disable */
/**
 * Auto-generated from httpRequest_v3.schema.json
 * Do not edit manually
 */

/**
 * Perform a generic HTTP request, for example to an API.
 */
export type HttpRequest = HTTPRequestSimple | HTTPRequestDetailed;
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple = string;
export type HTTPRequestDetailed = {
  [k: string]: unknown;
};
