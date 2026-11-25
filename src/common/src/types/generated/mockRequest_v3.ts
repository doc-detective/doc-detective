/* eslint-disable */
/**
 * Auto-generated from mockRequest_v3.schema.json
 * Do not edit manually
 */

/**
 * Answer matching browser requests with a fixed response, from this step until the test ends. A later `mockRequest` for the same `url` and `method` replaces the earlier one. Runs only in browsers that support WebDriver BiDi (Chrome). In other browsers, the step is skipped.
 */
export interface MockRequest {
  /**
   * Glob for the request URLs to answer. `*` matches any characters. A pattern that starts with `http` matches the whole URL, such as `https://api.example.com/user`. Any other pattern matches the URL's path, such as `** /api/invoices*`.
   */
  url: string;
  /**
   * HTTP method to answer. Omit to answer every method.
   */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  /**
   * The response to send. Omit to send an empty `200` response.
   */
  response?: {
    /**
     * HTTP status code of the response. Omit to send `200`.
     */
    statusCode?: number;
    /**
     * Response headers, as header names and string values.
     */
    headers?: {
      [k: string]: string;
    };
    /**
     * Response body. A string is sent as is. An object or array is sent as JSON. Set `body` or `bodyPath`, not both.
     */
    body?:
      | string
      | {
          [k: string]: unknown;
        }
      | unknown[];
    /**
     * File to send as the response body, relative to the spec file. Set `body` or `bodyPath`, not both.
     */
    bodyPath?: string;
  };
}
