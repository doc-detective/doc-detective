const { validate } = require("doc-detective-common");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const { getOperation, loadDescription } = require("../openapi");
const { log, calculateFractionalDifference, replaceEnvs } = require("../utils");

exports.httpRequest = httpRequest;

async function httpRequest({ config, step, openApiDefinitions = [] }) {
  let result = { status: "", description: "", outputs: {} };
  let openApiDefinition;
  let operation;

  // Identify OpenAPI definition
  if (step.httpRequest.openApi) {
    if (step.httpRequest.openApi.descriptionPath) {
      // Load OpenAPI definition from step
      openApiDefinition = await loadDescription(
        step.httpRequest.openApi.descriptionPath
      );
    } else if (step.httpRequest.openApi.name && openApiDefinitions.length > 0) {
      // Load OpenAPI definition from config
      let integration = openApiDefinitions.find(
        (openApiConfig) => openApiConfig.name === step.httpRequest.openApi.name
      );
      openApiDefinition = integration.definition;
      step.httpRequest.openApi = {
        ...integration,
        ...step.httpRequest.openApi,
      };
      delete step.httpRequest.openApi.definition;
    } else if (openApiDefinitions.length > 0) {
      // Identify first definition that contains the operation
      for (const openApiConfig of openApiDefinitions) {
        for (const path in openApiConfig.definition.paths) {
          for (const method in openApiConfig.definition.paths[path]) {
            if (
              openApiConfig.definition.paths[path][method].operationId ===
              step.httpRequest.openApi.operationId
            ) {
              openApiDefinition = openApiConfig.definition;
              step.httpRequest.openApi = {
                ...openApiConfig,
                ...step.httpRequest.openApi,
              };
              delete step.httpRequest.openApi.definition;
              break;
            }
          }
        }
      }
    }

    if (!openApiDefinition) {
      result.status = "FAIL";
      result.description = `OpenAPI definition not found.`;
      return result;
    }

    operation = await getOperation(
      openApiDefinition,
      step.httpRequest.openApi.operationId,
      step.httpRequest.openApi.statusCode,
      step.httpRequest.openApi.exampleKey,
      step.httpRequest.openApi.server
    );
    if (!operation) {
      result.status = "FAIL";
      result.description = `Couldn't find operation '${step.httpRequest.openApi.operationId}' in OpenAPI definition.`;
      return result;
    }
    log(config, "debug", `Operation: ${JSON.stringify(operation, null, 2)}`);

    // Set request info from OpenAPI config
    // URL
    if (!step.httpRequest.url) step.httpRequest.url = operation.example.url;
    // Method
    step.httpRequest.method = operation.method;
    // Headers
    if (step.httpRequest.openApi.headers) {
      if (typeof step.httpRequest.request === "undefined")
        step.httpRequest.request = {};

      step.httpRequest.request.headers = {
        ...step.httpRequest.openApi.headers,
        ...(step.httpRequest.request.headers || {}),
      };
    }

    // Set request info from example
    if (
      step.httpRequest.openApi.useExample === "request" ||
      step.httpRequest.openApi.useExample === "both"
    ) {
      if (typeof step.httpRequest.request === "undefined")
        step.httpRequest.request = {};
      if (Object.keys(operation.example.request?.parameters).length > 0)
        step.httpRequest.request.parameters = {
          ...operation.example.request.parameters,
          ...(step.httpRequest.request.parameters || {}),
        };
      if (Object.keys(operation.example.request?.headers).length > 0)
        step.httpRequest.request.headers = {
          ...operation.example.request.headers,
          ...(step.httpRequest.request.headers || {}),
        };
      if (Object.keys(operation.example.request?.body).length > 0)
        step.httpRequest.request.body = {
          ...operation.example.request.body,
          ...(step.httpRequest?.request?.body || {}),
        };
    }
    // Set response info
    if (
      step.httpRequest.openApi.useExample === "response" ||
      step.httpRequest.openApi.useExample === "both"
    ) {
      if (typeof step.httpRequest.response === "undefined")
        step.httpRequest.response = {};
      if (Object.keys(operation.example.response?.headers).length > 0)
        step.httpRequest.response.headers = {
          ...operation.example.response.headers,
          ...(step.httpRequest.response.headers || {}),
        };
      if (Object.keys(operation.example.response?.body).length > 0)
        step.httpRequest.response.body = {
          ...operation.example.response.body,
          ...(step.httpRequest.response.body || {}),
        };
    }
    // Set status code
    if (step.httpRequest.openApi.statusCode) {
      step.httpRequest.statusCodes = [
        step.httpRequest.openApi.statusCode,
        ...(step.httpRequest.statusCodes || []),
      ];
    } else if (!step.httpRequest.statusCodes) {
      step.httpRequest.statusCodes = Object.keys(
        operation.definition.responses
      ).filter((code) => code.startsWith("2"));
    }
  }

  // Make sure there's a protocol
  if (step.httpRequest.url && !step.httpRequest.url.includes("://"))
    step.httpRequest.url = "https://" + step.httpRequest.url;

  // Load environment variables
  // Have to do it again to catch any changes made to the OpenAPI config
  step = await replaceEnvs(step);

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;
  // Resolve to object
  if (typeof step.httpRequest === "string") {
    step.httpRequest = { url: step.httpRequest };
  }
  // Set default values
  step.httpRequest = {
    ...step.httpRequest,
    method: step.httpRequest.method || "get",
    statusCodes: step.httpRequest.statusCodes || [200, 201],
    request: step.httpRequest.request || {
      params: {},
      headers: {},
      body: {},
    },
    response: {
      headers: {},
      body: {},
      required: [],
      ...(step.httpRequest.response || {}),
    },
    allowAdditionalFields:
      typeof step.httpRequest.allowAdditionalFields !== "undefined"
        ? step.httpRequest.allowAdditionalFields
        : true,
    overwrite: step.httpRequest.overwrite || "aboveVariation",
    maxVariation: step.httpRequest.maxVariation || 0,
    timeout: step.httpRequest.timeout || 60000,
  };

  // Standardize step values
  // request.headers from string to object
  if (typeof step.httpRequest.request.headers === "string") {
    // Example string: "Content-Type: application/json\nAuthorization: Bearer token"
    const headers = {};
    step.httpRequest.request.headers.split("\n").forEach((header) => {
      const [key, value] = header.split(":").map((s) => s.trim());
      if (key && value) {
        headers[key] = value;
      }
    });
    step.httpRequest.request.headers = headers;
  }
  // request.body is stringified JSON
  if (
    typeof step.httpRequest.request.body === "string" &&
    step.httpRequest.request.body.trim().startsWith("{")
  ) {
    try {
      step.httpRequest.request.body = JSON.parse(step.httpRequest.request.body);
    } catch (error) {
      result.description = `Failed to parse request body as JSON. Continued as string.`;
    }
  }

  const request = {
    url: step.httpRequest.url,
    method: step.httpRequest.method,
    headers: step.httpRequest.request.headers,
    params: step.httpRequest.request.parameters,
    data: step.httpRequest.request.body,
  };

  // Validate request payload against OpenAPI definition
  if (
    (step.httpRequest.openApi?.validateAgainstSchema === "request" ||
      step.httpRequest.openApi?.validateAgainstSchema === "both") &&
    operation.schemas.request
  ) {
    // Validate request payload against OpenAPI definition
    const ajv = new Ajv({
      strictSchema: false,
      useDefaults: true,
      allErrors: true,
      allowUnionTypes: true,
      coerceTypes: false,
    });
    const validate = ajv.compile(operation.schemas.request);
    const valid = validate(step.httpRequest.request.body);
    if (valid) {
      result.description = ` Request body matched the OpenAPI schema.`;
    } else {
      result.status = "FAIL";
      result.description = ` Request body didn't match the OpenAPI schema. ${JSON.stringify(
        validate.errors,
        null,
        2
      )}`;
      return result;
    }
  }

  let response = {};
  if (!step?.httpRequest?.openApi?.mockResponse) {
    // Perform request
    response = await axios(request)
      .then((response) => {
        return response;
      })
      .catch((error) => {
        return { error };
      });
    if (response?.error?.response) response = response.error.response;
    result.outputs.response = {
      body: response.data,
      statusCode: response.status,
      headers: response.headers,
    };
  } else {
    // Mock response
    if (
      typeof step.httpRequest.response.body === "undefined" &&
      typeof operation.example.response.body !== "undefined"
    ) {
      response.data = operation.example.response.body;
    } else {
      response.data = step.httpRequest.response.body;
    }
    result.outputs.response = {
      body: response.data,
      statusCode: step.httpRequest.statusCodes[0],
      headers: step.httpRequest.response?.headers,
    };
    response.status = step.httpRequest.statusCodes[0];
    response.headers = step.httpRequest?.response?.headers;
  }

  // Compare status codes
  if (step.httpRequest.statusCodes) {
    if (step.httpRequest.statusCodes.indexOf(response.status) >= 0) {
      result.status = "PASS";
      result.description = `Returned ${response.status}.`;
    } else {
      result.status = "FAIL";
      result.description = `Returned ${
        response.status
      }. Expected one of ${JSON.stringify(step.httpRequest.statusCodes)}.`;
    }
  }

  // Validate required fields in response
  if (step.httpRequest.response?.required?.length > 0) {
    const missingFields = [];

    for (const fieldPath of step.httpRequest.response.required) {
      if (!fieldExistsAtPath(response.data, fieldPath)) {
        missingFields.push(fieldPath);
      }
    }

    if (missingFields.length > 0) {
      result.status = "FAIL";
      result.description += ` Missing required fields: ${missingFields.join(
        ", "
      )}`;
      return result;
    }
  }

  // Validate response payload against OpenAPI definition
  if (
    (step.httpRequest.openApi?.validateAgainstSchema === "response" ||
      step.httpRequest.openApi?.validateAgainstSchema === "both") &&
    operation.schemas.response
  ) {
    // Validate request payload against OpenAPI definition
    const ajv = new Ajv({
      strictSchema: false,
      useDefaults: true,
      allErrors: true,
      allowUnionTypes: true,
      coerceTypes: false,
    });
    const validate = ajv.compile(operation.schemas.response);
    const valid = validate(response.data);
    if (valid) {
      result.description += ` Response data matched the OpenAPI schema.`;
    } else {
      result.status = "FAIL";
      result.description += ` Response data didn't match the OpenAPI schema. ${JSON.stringify(
        validate.errors,
        null,
        2
      )}`;
      return result;
    }
  }

  // Compare response.body
  if (!step.httpRequest.allowAdditionalFields) {
    // Do a deep comparison
    const dataComparison = objectExistsInObject(
      step.httpRequest.response.body,
      response.data
    );
    if (dataComparison.result.status === "FAIL") {
      result.status = "FAIL";
      result.description += " Response contained unexpected fields.";
      return result;
    }
  }

  if (typeof step.httpRequest.response?.body !== "undefined") {
    // Check if response body is the same type
    if (
      typeof step.httpRequest.response.body !== typeof response.data ||
      (typeof step.httpRequest.response.body === "object" &&
        Array.isArray(step.httpRequest.response.body) !==
          Array.isArray(response.data))
    ) {
      result.status = "FAIL";
      result.description += ` Expected response body type didn't match actual response body type.`;
      return result;
    }
    // Check if response body is a string or object
    if (typeof step.httpRequest.response.body === "string") {
      if (step.httpRequest.response.body !== response.data) {
        result.status = "FAIL";
        result.description += ` Expected response body didn't match actual response body.`;
      }
      return result;
    } else if (typeof step.httpRequest.response.body === "object") {
      const dataComparison = objectExistsInObject(
        step.httpRequest.response.body,
        response.data
      );
      if (dataComparison.result.status === "PASS") {
        if (result.status != "FAIL") result.status = "PASS";
        result.description += ` Expected response body was present in actual response body.`;
      } else {
        result.status = "FAIL";
        result.description =
          result.description + " " + dataComparison.result.description;
        return result;
      }
    }
  }

  // Compare response.headers
  if (
    typeof step.httpRequest.response?.headers !== "undefined" &&
    JSON.stringify(step.httpRequest.response?.headers) != "{}"
  ) {
    // Preprocess headers to lowercase
    const headers = {};
    Object.keys(step.httpRequest.response.headers).forEach((key) => {
      headers[key.toLowerCase()] = step.httpRequest.response.headers[key];
    });
    const responseHeaders = {};
    Object.keys(response.headers).forEach((key) => {
      responseHeaders[key.toLowerCase()] = response.headers[key];
    });
    // Perform comparison
    const dataComparison = objectExistsInObject(headers, responseHeaders);
    // Check if headers are present in actual response
    if (dataComparison.result.status === "PASS") {
      if (result.status != "FAIL") result.status = "PASS";
      result.description += ` Expected response headers were present in actual response headers.`;
    } else {
      result.status = "FAIL";
      result.description =
        result.description + " " + dataComparison.result.description;
      return result;
    }
  }

  // Check if command output is saved to a file
  if (step.httpRequest.path) {
    const dir = path.dirname(step.httpRequest.path);
    // If `dir` doesn't exist, create it
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Set filePath
    let filePath = step.httpRequest.path;
    log(config, "debug", `Saving output to file: ${filePath}`);

    // Check if file already exists
    if (!fs.existsSync(filePath)) {
      // Doesn't exist, save output to file
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(response.data, null, 2)
      );
      result.description += ` Saved output to file.`;
    } else {
      if (step.httpRequest.overwrite == "false") {
        // File already exists
        result.description += ` Didn't save output. File already exists.`;
      }

      // Read existing file
      const existingFile = fs.readFileSync(filePath, "utf8");

      // Calculate fractional diff between existing file content and command output content, not length
      const fractionalDiff = calculateFractionalDifference(
        existingFile,
        JSON.stringify(response.data, null, 2)
      );
      log(config, "debug", `Fractional difference: ${fractionalDiff}`);

      if (fractionalDiff > step.httpRequest.maxVariation) {
        if (step.httpRequest.overwrite == "aboveVariation") {
          // Overwrite file
          await fs.promises.writeFile(
            filePath,
            JSON.stringify(response.data, null, 2)
          );
          result.description += ` Saved response to file.`;
        }
        result.status = "WARNING";
        result.description += ` The difference between the existing saved response and the new response (${fractionalDiff.toFixed(
          2
        )}) is greater than the max accepted variation (${
          step.httpRequest.maxVariation
        }).`;
        return result;
      }

      if (step.httpRequest.overwrite == "true") {
        // Overwrite file
        fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));
        result.description += ` Saved response to file.`;
      }
    }
  }

  result.description = result.description.trim();
  return result;
}

/**
 * Checks if a field exists at the specified path in an object.
 * Supports dot notation and array indices.
 *
 * @param {Object} obj - The object to search
 * @param {string} path - The field path (e.g., "user.profile.name" or "items[0].id")
 * @returns {boolean} - True if the field exists, false otherwise
 */
function fieldExistsAtPath(obj, path) {
  // Parse the path into segments
  // Handle both dot notation and array brackets
  const segments = path.match(/[^.[\]]+/g);

  if (!segments) {
    return false;
  }

  let current = obj;

  // Traverse each segment
  for (const segment of segments) {
    // Treat as array index only if the segment is purely numeric (e.g., "0", "12")
    if (/^\d+$/.test(segment)) {
      const arrayIndex = parseInt(segment, 10);
      // Array access
      if (!Array.isArray(current) || current.length <= arrayIndex) {
        return false;
      }
      current = current[arrayIndex];
    } else {
      // Object property access
      // Use 'in' operator to check existence (works for null/undefined values)
      if (
        typeof current !== "object" ||
        current === null ||
        !(segment in current)
      ) {
        return false;
      }
      current = current[segment];
    }
  }

  return true;
}

function arrayExistsInArray(expected, actual) {
  let status = "PASS";
  let description = "";
  for (i = 0; i < expected.length; i++) {
    if (Array.isArray(expected[i])) {
      // Array
      //// Check if any arrays in actual
      // Gather info about array to make comparison
      numExpectedArrays = 0;
      numExpectedObjects = 0;
      expected[i].forEach((value) => {
        if (Array.isArray(value)) {
          numExpectedArrays++;
        } else if (typeof value === "object") {
          numExpectedObjects++;
        }
      });
      // Iterate through actual to find arrays that might match expected[i]
      arrayMatches = 0;
      arrayIndexMatches = [];
      actual.forEach((value) => {
        numActualArrays = 0;
        numActualObjects = 0;
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (Array.isArray(item)) {
              numActualArrays++;
            } else if (typeof value === "object") {
              numActualObjects++;
            }
          });
        }
        if (
          numActualArrays >= numExpectedArrays &&
          numActualObjects >= numExpectedObjects &&
          value.length >= expected[i].length
        ) {
          arrayIndexMatches.push(value);
        }
      });
      // Loop through and test potential array matches
      arrayIndexMatches.forEach((array) => {
        arrayMatchResult = arrayExistsInArray(expected[i], array);
        if (arrayMatchResult.result.status === "PASS") {
          arrayMatches++;
        }
      });
      if (!arrayMatches) {
        status = "FAIL";
        description =
          description +
          ` Array '${JSON.stringify(
            expected[i]
          )}' isn't present in expected array.`;
      }
    } else if (typeof expected[i] === "object") {
      // Object
      //// Check if any objects in actual
      keys = Object.keys(expected[i]);
      objectMatches = 0;
      objectKeyMatches = actual.filter(
        (value) =>
          // Is an object
          typeof value === "object" &&
          // Is not an array
          !Array.isArray(value) &&
          // Contains all the specified keys
          keys.every((key) => value.hasOwnProperty(key))
      );
      objectKeyMatches.forEach((object) => {
        objectMatchResult = objectExistsInObject(expected[i], object);
        if (objectMatchResult.result.status === "PASS") {
          objectMatches++;
        }
      });
      if (!objectMatches) {
        status = "FAIL";
        description =
          description +
          ` Object ${JSON.stringify(
            expected[i]
          )} isn't present in expected array.`;
      }
    } else {
      // Anything else that isn't present
      if (!actual.includes(expected[i])) {
        status = "FAIL";
        description =
          description +
          ` Value '${expected[i]}' isn't present in expected array.`;
      }
    }
  }
  result = { status, description };
  return { result };
}

function objectExistsInObject(expected, actual) {
  let status = "PASS";
  let description = "";
  Object.keys(expected).forEach((key) => {
    if (!actual.hasOwnProperty(key)) {
      // Key doesn't exist in actual
      description =
        description + `The '${key}' key didn't exist in returned JSON. `;
      status = "FAIL";
    } else if (typeof expected[key] === "object") {
      if (Array.isArray(expected[key])) {
        // Punt to array comparison function
        result = arrayExistsInArray(expected[key], actual[key]);
        if (result.result.status === "FAIL") status = "FAIL";
        if (result.result.description != "")
          description = description + " " + result.result.description;
      } else {
        // Nested object recursion
        result = objectExistsInObject(expected[key], actual[key]);
        if (result.result.status === "FAIL") status = "FAIL";
        if (result.result.description != "")
          description = description + " " + result.result.description;
      }
    } else if (expected[key] !== actual[key]) {
      // Actual value doesn't match expected
      description =
        description +
        `The '${key}' key didn't match the expected value. Expected: '${expected[key]}'. Actual: '${actual[key]}'. `;
      status = "FAIL";
    }

    if (status === "FAIL") {
      description = description.trim();
    }
  });
  result = { status, description };
  return { result };
}

// If run directly, perform httpRequest
if (require.main === module) {
  const config = {
    logLevel: "debug",
  };
  const step = {
    httpRequest: {
      url: `https://reqres.in/api/users`,
      method: "post",
      statusCodes: [200, 201],
      request: {
        body: {
          name: "John Doe",
          job: "Software Engineer",
        },
        headers: {
          "Content-Type": "application/json",
        },
        parameters: {},
      },
      response: {
        body: {},
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          server: "cloudflare",
        },
      },
      allowAdditionalFields: false,
      path: "response.json",
      directory: "media",
      maxVariation: 0.1,
      overwrite: "aboveVariation",
    },
  };
  httpRequest({ config, step })
    .then((result) => {
      console.log(result);
    })
    .catch((error) => {
      console.error(error);
    });
}
