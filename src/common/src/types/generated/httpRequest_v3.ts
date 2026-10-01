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
} & {
  url?: HTTPRequestSimple1;
  openApi?: (string & OperationID) | (OpenApi & OpenAPIDefinitionHttpRequest);
  /**
   * Accepted status codes. If the specified URL returns a code other than what is specified here, the action fails.
   */
  statusCodes?: number[];
  /**
   * Method of the HTTP request
   */
  method?: "get" | "put" | "post" | "patch" | "delete";
  /**
   * Timeout for the HTTP request, in milliseconds.
   */
  timeout?: number;
  request?: Request;
  response?: Response;
  /**
   * If `false`, the step fails when the response data contains fields not specified in the response body.
   */
  allowAdditionalFields?: boolean;
  /**
   * File path to save the command's output, relative to `directory`. Specify a file extension that matches the expected response type, such as `.json` for JSON content or `.txt` for strings.
   */
  path?: string;
  /**
   * Directory to save the command's output. If the directory doesn't exist, creates the directory. If not specified, the directory is your media directory.
   */
  directory?: string;
  /**
   * Allowed variation in percentage of text different between the current output and previously saved output. If the difference between the current output and the previous output is greater than `maxVariation`, the step fails. If output doesn't exist at `path`, this value is ignored.
   */
  maxVariation?: number;
  /**
   * If `true`, overwrites the existing output at `path` if it exists.
   * If `aboveVariation`, overwrites the existing output at `path` if the difference between the new output and the existing output is greater than `maxVariation`.
   */
  overwrite?: "true" | "false" | "aboveVariation";
};
/**
 * URL for the HTTP request.
 */
export type HTTPRequestSimple1 = string;
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
   * Response code to use for validation, examples, and status code checking. If the response code doesn't match, the step fails. `statusCodes` overrides this value when specified.
   */
  statusCode?: number;
  /**
   * Uses the example from the OpenAPI description as the request and response data. If the request or response has multiple examples, specify `exampleKey`. If `statusCode` isn't specified, uses the first defined response code. `requestData`, `requestParams`, and `requestHeaders` override portions of request examples when specified. `responseData` overrides portions of response examples when specified.
   */
  useExample?: "request" | "response" | "both" | "none";
  /**
   * Key of the example to use from the `examples` property in the OpenAPI description. If an `examples` key isn't specified or isn't available for a given parameter or object, the `example` property value is used.
   */
  exampleKey?: string;
  headers?: OpenAPIRequestHeaders;
};
/**
 * Headers to include in the HTTP request, as return-separated values. For example, `Content-Type: application/json
 * Authorization: Bearer token`.
 */
export type RequestHeadersString = string;
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
/**
 * Request headers to add to requests. For example, to set `Authorization` headers for all requests from the specified OpenAPI document. If specified in both a config and a step, the step value overrides the config value.
 */
export interface OpenAPIRequestHeaders {
  [k: string]: string;
}
export interface OpenAPIDefinitionHttpRequest {
  [k: string]: unknown;
}
export interface Request {
  /**
   * Headers to include in the HTTP request.
   */
  headers?: RequestHeadersObject | RequestHeadersString;
  parameters?: RequestParameters;
  /**
   * The body of the HTTP request.
   */
  body?: RequestBodyObject | RequestBodyArray | RequestBodyString;
}
/**
 * Headers to include in the HTTP request, in key/value format.
 */
export interface RequestHeadersObject {
  [k: string]: unknown;
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
   * JSON object expected in the response. If one or more key/value pairs aren't present in the response, the step fails.
   */
  body?: ResponseBodyObject | ResponseBodyArray | ResponseBodyString;
  /**
   * Array of field paths that must exist in the response body. Uses dot notation for nested fields (e.g., 'user.name') and bracket notation for array indices (e.g., 'items[0].id'). Fields must be present but may have any value including null.
   */
  required?: string[];
}
/**
 * Headers expected in the response, in key/value format. If one or more `responseHeaders` entries aren't present in the response, the step fails.
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
