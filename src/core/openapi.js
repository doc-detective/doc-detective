import { replaceEnvs } from "./utils.js";
import { JSONSchemaFaker } from "json-schema-faker";
import { readFile } from "./files.js";
import parser from "@apidevtools/json-schema-ref-parser";

JSONSchemaFaker.option({ requiredOnly: true });

/**
 * Dereferences an OpenAPI or Arazzo description
 *
 * @param {String} descriptionPath - The OpenAPI or Arazzo description to be dereferenced.
 * @returns {Promise<Object>} - The dereferenced OpenAPI or Arazzo description.
 */
async function loadDescription(descriptionPath = "") {
  // Error handling
  if (!descriptionPath) {
    throw new Error("Description is required.");
  }

  // Load the definition from the URL or local file path
  const definition = await readFile({ fileURLOrPath: descriptionPath });

  // Dereference the definition
  const dereferencedDefinition = await parser.dereference(definition);

  return dereferencedDefinition;
}

/**
 * Retrieves the operation details from an OpenAPI definition based on the provided operationId.
 *
 * @param {Object} [definition={}] - The OpenAPI definition object.
 * @param {string} [operationId=""] - The unique identifier for the operation.
 * @param {string} [responseCode=""] - The HTTP response code to filter the operation.
 * @param {string} [exampleKey=""] - The key for the example to be compiled.
 * @param {string} [server=""] - The server URL to use for examples.
 * @throws {Error} Will throw an error if the definition or operationId is not provided.
 * @returns {Object|null} Returns an object containing the operation details, schemas, and example if found; otherwise, returns null.
 */
function getOperation(
  definition = {},
  operationId = "",
  responseCode = "",
  exampleKey = "",
  server = ""
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

function getSchemas(definition = {}, responseCode = "") {
  const schemas = {};

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
 * Compiles an example object based on the provided operation, path, and example key.
 *
 * @param {Object} operation - The operation object.
 * @param {string} path - The path string.
 * @param {string} exampleKey - The example key string.
 * @returns {Object} - The compiled example object.
 * @throws {Error} - If operation or path is not provided.
 */
function compileExample(
  operation = {},
  path = "",
  responseCode = "",
  exampleKey = ""
) {
  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!path) {
    throw new Error("Path is required.");
  }

  // Setup
  let example = {
    url: path,
    request: { parameters: {}, headers: {}, body: {} },
    response: { headers: {}, body: {} },
  };

  // Path parameters
  const pathParameters = getExampleParameters(operation, "path", exampleKey);
  pathParameters.forEach((param) => {
    example.url = example.url.replace(`{${param.key}}`, param.value);
  });

  // Query parameters
  const queryParameters = getExampleParameters(operation, "query", exampleKey);
  queryParameters.forEach((param) => {
    example.request.parameters[param.key] = param.value;
  });

  // Headers
  const headerParameters = getExampleParameters(
    operation,
    "header",
    exampleKey
  );
  headerParameters.forEach((param) => {
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
 * Retrieves example parameters based on the given operation, type, and example key.
 *
 * @param {object} operation - The operation object.
 * @param {string} [type=""] - The type of parameter to retrieve.
 * @param {string} [exampleKey=""] - The example key to use.
 * @returns {Array} - An array of example parameters.
 * @throws {Error} - If the operation is not provided.
 */
function getExampleParameters(operation = {}, type = "", exampleKey = "") {
  const params = [];

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
 * Retrieves an example value based on the given definition and example key.
 *
 * @param {object} definition - The definition object.
 * @param {string} exampleKey - The key of the example to retrieve.
 * @returns {object|null} - The example value.
 * @throws {Error} - If the definition is not provided.
 */
function getExample(
  definition = {},
  exampleKey = "",
  generateFromSchema = null
) {
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
 * Generates an object example based on the provided schema and example key.
 *
 * @param {object} schema - The schema object.
 * @param {string} exampleKey - The example key.
 * @returns {object} - The generated object example.
 */
function generateObjectExample(
  schema = {},
  exampleKey = "",
  generateFromSchema = null
) {
  const example = {};
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
 * Generates an array example based on the provided items and example key.
 *
 * @param {Object} items - The items object.
 * @param {string} exampleKey - The example key.
 * @returns {Array} - The generated array example.
 */
function generateArrayExample(
  items = {},
  exampleKey = "",
  generateFromSchema = null
) {
  // Debug
  // console.log({ items, exampleKey });

  const example = [];
  const itemExample = getExample(items, exampleKey, generateFromSchema);
  if (itemExample) example.push(itemExample);

  // Debug
  // console.log(example);
  return example;
}

/**
 * Checks if the provided definition object contains any examples.
 *
 * @param {Object} [definition={}] - The object to traverse for examples.
 * @param {string} [exampleKey=""] - The specific key to look for in the examples.
 * @returns {boolean} - Returns true if examples are found, otherwise false.
 */
function checkForExamples(definition = {}, exampleKey = "") {
  const examples = [];

  function traverse(obj) {
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
