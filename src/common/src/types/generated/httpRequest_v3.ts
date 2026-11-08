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
 * Send a GET request to a URL: an absolute `http://` or `https://` URL, a path that starts with one `/`, or a value that starts with an environment variable. A path is joined to `origin` from the config.
 */
export type HTTPRequestSimple = string;
export type HTTPRequestDetailed = {
  [k: string]: unknown;
} & {
  url?: TargetURL;
  openApi?: (string & OperationID) | (OpenApi & OpenAPIDefinitionHttpRequest);
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails. A single integer is treated as a one-item list.
   */
  statusCodes?: number | number[];
  /**
   * Method of the HTTP request
   */
  method?: "get" | "put" | "post" | "patch" | "delete";
  /**
   * Maximum time in milliseconds to wait for the response. If exceeded, the step fails. At least 1.
   */
  timeout?: number;
  request?: Request;
  response?: Response;
  /**
   * If `false`, the step fails when the response data contains fields not specified in the response body.
   */
  allowAdditionalFields?: boolean;
  /**
   * File path to save the response body, relative to `directory`. Specify a file extension that matches the expected response type, such as `.json` for JSON content or `.txt` for strings.
   */
  path?: string;
  /**
   * Directory to save the response in. If the directory doesn't exist, creates the directory. A relative `directory`, or a relative `path` without one, resolves against the spec file's folder.
   */
  directory?: string;
  /**
   * Allowed variation as a fraction (0 to 1) of text different between the current output and previously saved output. For example, 0.1 means 10%. If the difference between the current output and the previous output is greater than `maxVariation`, the step returns a warning. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
};
/**
 * An absolute `http://` or `https://` URL, a path that starts with one `/`, or a value that starts with an environment variable, such as `$BASE_URL/docs`. A path is joined to `origin`.
 */
export type TargetURL = string;
/**
 * OpenAPI description and configuration.
 */
export type OpenApi = {
  [k: string]: unknown;
} & {
  /**
   * Name of the OpenAPI description, as defined in your configuration.
   */
  name?: string;
  /**
   * URL or local path to the OpenAPI description.
   */
  descriptionPath?: string;
  definition?: OpenAPIDefinition;
  /**
   * ID of the operation to use for the request.
   */
  operationId?: string;
  /**
   * Server to use for example requests. Only valid if `useExample` is `request` or `both`. If not specified but an example is used for the request, uses the first server defined in the OpenAPI description.
   */
  server?: string;
  /**
   * Validates the request and/or response against the schema in the OpenAPI description. If the request or response doesn't match the schema, the step fails.
   */
  validateAgainstSchema?: "request" | "response" | "both" | "none";
  /**
   * If `true`, doesn't make the HTTP request, but instead uses the response example or schema from the OpenAPI description as the response data. Useful for creating tests when an API isn't fully implemented yet. If `statusCode` isn't specified, uses the first defined response code.
   */
  mockResponse?: boolean;
  /**
   * Response code to use for validation, examples, and status code checking. If the response code doesn't match, the step fails. An httpRequest's `statusCodes` adds more accepted codes.
   */
  statusCode?: number;
  /**
   * Uses the example from the OpenAPI description as the request and response data. If the request or response has multiple examples, specify `exampleKey`. If `statusCode` isn't specified, uses the first defined response code. An httpRequest's `request.body`, `request.parameters`, and `request.headers` override portions of request examples when specified. Its `response.body` and `response.headers` override portions of response examples when specified.
   */
  useExample?: "request" | "response" | "both" | "none";
  /**
   * Key of the example to use from the `examples` property in the OpenAPI description. If an `examples` key isn't specified or isn't available for a given parameter or object, the `example` property value is used.
   */
  exampleKey?: string;
  headers?: OpenAPIRequestHeaders;
};
/**
 * Request headers to add to requests: an object with string values, or a string with one `Name: value` header per line. For example, to set `Authorization` headers for all requests from the specified OpenAPI document. If specified in both a config and a step, the step value overrides the config value. An httpRequest's `request.headers` override these headers by name.
 */
export type OpenAPIRequestHeaders = RequestHeadersObject | RequestHeadersString;
export type RequestHeadersString = string;
/**
 * Headers to include in the HTTP request: an object with string values, or a string with one `Name: value` header per line. With `openApi`, these override the OpenAPI `headers` with the same name.
 */
export type RequestHeaders = RequestHeadersObject1 | RequestHeadersString1;
export type RequestHeadersString1 = string;
/**
 * JSON array to include as the body of the HTTP request.
 */
export type RequestBodyArray = unknown[];
/**
 * String to include as the body of the HTTP request.
 */
export type RequestBodyString = string;
/**
 * JSON array expected in the response.
 */
export type ResponseBodyArray = unknown[];
/**
 * String expected in the response.
 */
export type ResponseBodyString = string;

/**
 * Operation ID from the OpenAPI schema. Only valid if the OpenAPI description path is specified elsewhere and the operation ID is unique among all specified OpenAPI descriptions.
 */
export interface OperationID {
  [k: string]: unknown;
}
/**
 * OpenAPI definition object loaded from the `descriptionPath`. This is a resolved version of the OpenAPI description and should not be user-defined.
 */
export interface OpenAPIDefinition {
  [k: string]: unknown;
}
export interface RequestHeadersObject {
  [k: string]: string;
}
export interface OpenAPIDefinitionHttpRequest {
  [k: string]: unknown;
}
export interface Request {
  headers?: RequestHeaders;
  parameters?: RequestParameters;
  /**
   * The body of the HTTP request.
   */
  body?: RequestBodyObject | RequestBodyArray | RequestBodyString;
}
export interface RequestHeadersObject1 {
  [k: string]: string;
}
/**
 * URL parameters to include in the HTTP request, in key/value format.
 */
export interface RequestParameters {
  [k: string]: unknown;
}
/**
 * JSON object to include as the body of the HTTP request.
 */
export interface RequestBodyObject {
  [k: string]: unknown;
}
export interface Response {
  headers?: ResponseHeaders;
  /**
   * JSON object expected in the response. If one or more key/value pairs aren't present in the response, the step fails. Omit it to skip the body check.
   */
  body?: ResponseBodyObject | ResponseBodyArray | ResponseBodyString;
  /**
   * Array of field paths that must exist in the response body. Uses dot notation for nested fields (e.g., 'user.name') and bracket notation for array indices (e.g., 'items[0].id'). Fields must be present but may have any value including null.
   */
  required?: string[];
}
/**
 * Headers expected in the response, in key/value format. If one or more `response.headers` entries aren't present in the response, the step fails.
 */
export interface ResponseHeaders {
  [k: string]: unknown;
}
/**
 * JSON key/value pairs expected in the response.
 */
export interface ResponseBodyObject {
  [k: string]: unknown;
}
