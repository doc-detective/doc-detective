/* eslint-disable */
/**
 * Auto-generated from openApi_v3.schema.json
 * Do not edit manually
 */

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
