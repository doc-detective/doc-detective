/* eslint-disable */
/**
 * Auto-generated from mockRequest_v3.schema.json
 * Do not edit manually
 */

/**
 * Answer matching browser requests with a fixed response, a sequence of responses, or the responses recorded in a HAR file, from this step until the test ends. A later `mockRequest` for the same `url` and `method` replaces the earlier one. Runs only in Chrome. In other browsers, the step is skipped.
 */
export type MockRequest = {
  [k: string]: unknown;
} & {
  /**
   * Glob for the request URLs to answer. `*` matches any characters. A pattern that starts with `http` matches the whole URL, such as `https://api.example.com/user`. Any other pattern matches the URL's path, such as `** /api/invoices*`. Required unless `harPath` is set. With `harPath`, keeps only the HAR entries whose URL matches.
   */
  url?: string;
  /**
   * HTTP method to answer. Omit to answer every method. With `harPath`, keeps only the HAR entries with this method.
   */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  /**
   * The response to send. Omit to send an empty `200` response. Set one of `response`, `responses`, or `harPath`.
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
  /**
   * Responses to send in order. The first matching request gets the first entry, the next request gets the next entry, and the last entry answers every later request. Set one of `response`, `responses`, or `harPath`.
   *
   * @minItems 1
   *
   * Items: A response to send.
   */
  responses?: [
    {
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
    },
    ...{
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
    }[],
  ];
  /**
   * HAR 1.2 file whose recorded responses answer matching requests, relative to the spec file. Each recorded URL and method is matched exactly, query string included. Repeated requests are answered in recorded order. Requests that aren't in the file reach the network. Set one of `response`, `responses`, or `harPath`.
   */
  harPath?: string;
};
