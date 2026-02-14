import { replaceEnvs } from "./utils.js";
import { JSONSchemaFaker } from "json-schema-faker";
import { readFile } from "./files.js";
import parser from "@apidevtools/json-schema-ref-parser";

JSONSchemaFaker.option({ requiredOnly: true });

/**
 * Dereference an OpenAPI or Arazzo description from a file path or URL.
 *
 * @param descriptionPath - Path or URL to the OpenAPI/Arazzo description to load and dereference.
 * @throws {Error} If `descriptionPath` is empty or not provided.
 * @returns The fully dereferenced OpenAPI/Arazzo definition object.
 */
async function loadDescription(descriptionPath: string = "") {
  // Error handling
  if (!descriptionPath) {
    throw new Error("Description is required.");
  }

  // Load the definition from the URL or local file path
  const definition = await readFile({ fileURLOrPath: descriptionPath });

  // Dereference the definition
  const dereferencedDefinition = await parser.dereference(definition as any);

  return dereferencedDefinition;
}

/**
 * Retrieve operation details from an OpenAPI definition by operationId.
 *
 * @param definition - The OpenAPI document object; must include a `paths` property.
 * @param operationId - The operationId to locate within `definition.paths`.
 * @param responseCode - Optional response HTTP status code to select a specific response schema/example.
 * @param exampleKey - Optional example identifier to choose a specific example from an operation's examples.
 * @param server - Optional server base URL to use when building example URLs; if omitted, the first entry in `definition.servers` is used.
 * @throws Will throw an error if `definition` or `operationId` is not provided, or if no server URL is available when required.
 * @returns The operation descriptor containing `path`, `method`, `definition` (operation object), `schemas` (request and response schemas), and `example`, or `null` if no matching operationId is found.
 */
function getOperation(
  definition: any = {},
  operationId: string = "",
  responseCode: string = "",
  exampleKey: string = "",
  server: string = ""
) {
  // Error handling
  if (!definition) {
    throw new Error("OpenAPI definition is required.");
  }
  if (!operationId) {
    throw new Error("OperationId is required.");
  }
  // Search for the operationId in the OpenAPI definition
  for (const path in definition.paths) {
    for (const method in definition.paths[path]) {
      if (definition.paths[path][method].operationId === operationId) {
        const operation = definition.paths[path][method];
        if (!server) {
          if (definition.servers && definition.servers.length > 0) {
            server = definition.servers[0].url;
          } else {
            throw new Error(
              "No server URL provided and no servers defined in the OpenAPI definition."
            );
          }
        }
        const example = compileExample(
          operation,
          server + path,
          responseCode,
          exampleKey
        );
        const schemas = getSchemas(operation, responseCode);
        return { path, method, definition: operation, schemas, example };
      }
    }
  }
  return null;
}

/**
 * Extracts the request and response JSON Schemas for an operation definition.
 *
 * When `responseCode` is omitted, the first defined response code is selected.
 *
 * @param definition - An operation object containing optional `requestBody` and `responses` members
 * @param responseCode - Optional response status code to select; if not provided the first response key is used
 * @returns An object with `request` (request body schema, if present) and `response` (schema for the selected response)
 * @throws Error if `definition.responses` is absent or contains no responses
 */
function getSchemas(definition: any = {}, responseCode: string = "") {
  const schemas: any = {};

  // Get request schema for operation
  if (definition.requestBody) {
    schemas.request =
      definition.requestBody.content[
        Object.keys(definition.requestBody.content)[0]
      ].schema;
  }
  if (!responseCode) {
    if (definition.responses && Object.keys(definition.responses).length > 0) {
      responseCode = Object.keys(definition.responses)[0];
    } else {
      throw new Error("No responses defined for the operation.");
    }
  }
  schemas.response =
    definition.responses[responseCode].content[
      Object.keys(definition.responses[responseCode].content)[0]
    ].schema;

  return schemas;
}

/**
 * Build a runnable example for an OpenAPI operation, producing URL, request (parameters, headers, body) and response (headers, body).
 *
 * The function substitutes path parameters into `path`, populates query and header parameters, includes request and response bodies where available, and applies environment variable replacements.
 *
 * @param operation - OpenAPI operation object to derive the example from
 * @param path - URL or path template to use as the example's base (path parameters will be substituted)
 * @param responseCode - Optional response status code to select which response to use; defaults to the first defined response
 * @param exampleKey - Optional example key to prefer named examples when present
 * @returns The compiled example object with shape `{ url, request: { parameters, headers, body }, response: { headers, body } }`
 * @throws If `operation` or `path` is not provided
 */
function compileExample(
  operation: any = {},
  path: string = "",
  responseCode: string = "",
  exampleKey: string = ""
) {
  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!path) {
    throw new Error("Path is required.");
  }

  // Setup
  let example: any = {
    url: path,
    request: { parameters: {}, headers: {}, body: {} },
    response: { headers: {}, body: {} },
  };

  // Path parameters
  const pathParameters = getExampleParameters(operation, "path", exampleKey);
  pathParameters.forEach((param: any) => {
    example.url = example.url.replace(`{${param.key}}`, param.value);
  });

  // Query parameters
  const queryParameters = getExampleParameters(operation, "query", exampleKey);
  queryParameters.forEach((param: any) => {
    example.request.parameters[param.key] = param.value;
  });

  // Headers
  const headerParameters = getExampleParameters(
    operation,
    "header",
    exampleKey
  );
  headerParameters.forEach((param: any) => {
    example.request.headers[param.key] = param.value;
  });

  // Request body
  if (operation.requestBody) {
    const requestBody = getExample(operation.requestBody, exampleKey);
    if (typeof requestBody != "undefined") {
      example.request.body = requestBody;
    }
  }

  // Response
  if (!responseCode) {
    responseCode = Object.keys(operation.responses)[0];
  }
  const response = operation.responses[responseCode];

  // Response headers
  if (response.headers) {
    for (const header in response.headers) {
      const headerExample = getExample(response.headers[header], exampleKey);
      if (typeof headerExample != "undefined")
        example.response.headers[header] = headerExample;
    }
  }

  // Response body
  if (response.content) {
    for (const key in response.content) {
      const responseBody = getExample(response.content[key], exampleKey);
      if (typeof responseBody != "undefined") {
        example.response.body = responseBody;
      }
    }
  }

  // Load environment variables
  example = replaceEnvs(example);
  // console.log(JSON.stringify(example, null, 2));
  return example;
}

// Return array of query parameters for the example
/**
 * Collects example values for parameters at a given parameter location of an operation.
 *
 * @param operation - The operation object containing parameter definitions.
 * @param type - Parameter location to filter by (e.g., "path", "query", "header").
 * @param exampleKey - Optional example identifier to select a specific example from parameter examples.
 * @returns An array of `{ key: string, value: any }` pairs where `key` is the parameter name and `value` is the example value.
 * @throws If `operation` is not provided.
 */
function getExampleParameters(operation: any = {}, type: string = "", exampleKey: string = "") {
  const params: any[] = [];

  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!operation.parameters) return params;

  // Find all query parameters
  for (const parameter of operation.parameters) {
    if (parameter.in === type) {
      const value = getExample(parameter, exampleKey);
      if (value) {
        params.push({ key: parameter.name, value });
      }
    }
  }

  return params;
}

/**
 * Produce an example value for a schema/definition, preferring explicit examples and falling back to schema-based generation.
 *
 * The function returns an example chosen in this order: an entry from `definition.examples[exampleKey].value` (if present), `definition.example` (if present), or a value generated from the schema (including object/array composition or via JSONSchemaFaker) when generation is enabled or required. If no example can be produced, returns `null`.
 *
 * @param definition - The schema or parameter definition to derive an example from.
 * @param exampleKey - Optional key to select a specific example from `definition.examples`.
 * @param generateFromSchema - When `true`, force generating an example from the schema; when `false`, do not generate; when `null` (default) the function decides based on presence of examples and requiredness.
 * @returns The produced example value, or `null` if none could be produced.
 * @throws If `definition` is not provided.
 */
function getExample(
  definition: any = {},
  exampleKey: string = "",
  generateFromSchema: any = null
): any {
  // Debug
  // console.log({definition, exampleKey});

  // Setup
  let example;

  // Error handling
  if (!definition) {
    throw new Error("Definition is required.");
  }

  // If there are no examples in the definition, generate example based on definition schema
  if (generateFromSchema == null) {
    const hasExamples = checkForExamples(definition, exampleKey);
    generateFromSchema =
      !hasExamples &&
      (definition.required || definition?.schema?.required || !exampleKey);
  }

  if (generateFromSchema && definition.type) {
    try {
      example = JSONSchemaFaker.generate(definition);
      if (example) return example;
    } catch (error) {
      console.warn(`Error generating example: ${error}`);
    }
  }

  if (
    definition.examples &&
    typeof exampleKey !== "undefined" &&
    exampleKey !== "" &&
    typeof definition.examples[exampleKey] !== "undefined" &&
    typeof definition.examples[exampleKey].value !== "undefined"
  ) {
    // If the definition has an `examples` property, exampleKey is specified, and the exampleKey exists in the examples object, use that example.
    example = definition.examples[exampleKey].value;
  } else if (typeof definition.example !== "undefined") {
    // If the definition has an `example` property, use that example.
    example = definition.example;
  } else {
    // If the definition has no examples, generate an example based on the definition/properties.
    // Find the next `schema` child property in the definition, regardless of depth
    let schema;
    if (definition.schema) {
      // Parameter pattern
      schema = definition.schema;
    } else if (definition.properties) {
      // Object pattern
      schema = definition;
    } else if (definition.items) {
      // Array pattern
      schema = definition;
    } else if (definition.content) {
      // Request/response body pattern
      for (const key in definition.content) {
        if (definition.content[key]) {
          schema = definition.content[key];
          break;
        }
      }
    } else {
      return null;
    }

    if (schema.type === "object") {
      example = generateObjectExample(schema, exampleKey, generateFromSchema);
    } else if (schema.type === "array") {
      example = generateArrayExample(
        schema.items,
        exampleKey,
        generateFromSchema
      );
    } else {
      example = getExample(schema, exampleKey, generateFromSchema);
    }
  }

  // console.log(example);
  return example;
}

/**
 * Generate an example object from a schema's properties.
 *
 * @param schema - Schema object whose `properties` will be used to build the example.
 * @param exampleKey - Optional example identifier to select named examples within property definitions.
 * @param generateFromSchema - If truthy, prefer generating values from property schemas when explicit examples are absent.
 * @returns An object whose keys mirror `schema.properties` and whose values are examples derived from each property's definition; properties without examples are omitted.
 */
function generateObjectExample(
  schema: any = {},
  exampleKey: string = "",
  generateFromSchema: any = null
) {
  const example: any = {};
  for (const property in schema.properties) {
    const objectExample = getExample(
      schema.properties[property],
      exampleKey,
      generateFromSchema
    );
    if (objectExample) example[property] = objectExample;
  }
  return example;
}

/**
 * Create an array example using the example for the array's item schema.
 *
 * @param items - Schema describing the array items; used to derive the element example.
 * @param exampleKey - Optional key to select a named example from the schema.
 * @param generateFromSchema - Optional flag or hint controlling generation from the schema when explicit examples are absent.
 * @returns An array containing a single example element derived from `items`, or an empty array if no element example could be produced.
 */
function generateArrayExample(
  items: any = {},
  exampleKey: string = "",
  generateFromSchema: any = null
) {
  // Debug
  // console.log({ items, exampleKey });

  const example: any[] = [];
  const itemExample = getExample(items, exampleKey, generateFromSchema);
  if (itemExample) example.push(itemExample);

  // Debug
  // console.log(example);
  return example;
}

/**
 * Determine whether a definition object contains any example values.
 *
 * @param definition - The object to search for example entries; nested objects are traversed.
 * @param exampleKey - If provided, also checks for `examples[exampleKey].value` entries.
 * @returns `true` if any examples are found, `false` otherwise.
 */
function checkForExamples(definition: any = {}, exampleKey: string = "") {
  const examples: any[] = [];

  /**
   * Recursively walks an object tree and collects any example values it finds.
   *
   * Traverses `obj` depth-first; when a property `example` is present its value is appended to the module-scoped `examples` array. If `exampleKey` is set and `obj.examples[exampleKey].value` exists, that value is also appended. Non-object and null inputs are ignored.
   *
   * @param obj - The node to traverse; may be any value (non-objects are no-ops)
   */
  function traverse(obj: any) {
    if (typeof obj !== "object" || obj === null) return;

    if (obj.hasOwnProperty("example")) {
      examples.push(obj.example);
    }
    if (
      exampleKey &&
      Object.hasOwn(obj, "examples") &&
      Object.hasOwn(obj.examples, exampleKey) &&
      Object.hasOwn(obj.examples[exampleKey], "value")
    ) {
      examples.push(obj.examples[exampleKey].value);
    }

    for (const key in obj) {
      traverse(obj[key]);
    }
  }

  traverse(definition);
  if (examples.length) return true;
  return false;
}

export { getOperation, loadDescription };