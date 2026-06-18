import { validate } from "../../common/src/validate.js";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import _Ajv from "ajv";
const Ajv = _Ajv as unknown as typeof _Ajv.default;
import { getOperation, loadDescription } from "../openapi.js";
import {
  log,
  calculateFractionalDifference,
  replaceEnvs,
  rollUpResults,
} from "../utils.js";

export { httpRequest };

// One articulated assertion record. See runShell.ts and
// docs/design/dynamic-routing-roadmap.md ("Assertions") for the locked shape.
interface AssertionRecord {
  statement: string;
  source: "implicit" | "custom";
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  expected?: any;
  actual?: any;
  description?: string;
}

async function httpRequest({ config, step, openApiDefinitions = [] }: { config: any; step: any; openApiDefinitions?: any[] }) {
  let result: any = { status: "", description: "", outputs: {} };
  let openApiDefinition: any;
  let operation: any;

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
        (openApiConfig: any) => openApiConfig.name === step.httpRequest.openApi.name
      );
      if (!integration) {
        result.status = "FAIL";
        result.description = `OpenAPI integration '${step.httpRequest.openApi.name}' not found in config.`;
        return result;
      }
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
      if (Object.keys(operation.example.request?.parameters ?? {}).length > 0)
        step.httpRequest.request.parameters = {
          ...operation.example.request.parameters,
          ...(step.httpRequest.request.parameters || {}),
        };
      if (Object.keys(operation.example.request?.headers ?? {}).length > 0)
        step.httpRequest.request.headers = {
          ...operation.example.request.headers,
          ...(step.httpRequest.request.headers || {}),
        };
      if (Object.keys(operation.example.request?.body ?? {}).length > 0)
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
      if (Object.keys(operation.example.response?.headers ?? {}).length > 0)
        step.httpRequest.response.headers = {
          ...operation.example.response.headers,
          ...(step.httpRequest.response.headers || {}),
        };
      if (Object.keys(operation.example.response?.body ?? {}).length > 0)
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
      ).filter((code: any) => code.startsWith("2"))
       .map((code: string) => Number(code));
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
    const headers: any = {};
    step.httpRequest.request.headers.split("\n").forEach((header: any) => {
      const [key, value] = header.split(":").map((s: any) => s.trim());
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
    timeout: step.httpRequest.timeout,
  };

  // ---------------------------------------------------------------------------
  // Articulated implicit assertions.
  //
  // The runner emits one AssertionRecord per verification check, IN THEIR
  // ORIGINAL ORDER, preserving the prior short-circuit/early-return behavior and
  // exact PASS/FAIL/WARNING outcomes. Once a check FAILs we stop *evaluating*
  // successors (their inputs may not be meaningful) but still REPORT each
  // applicable-but-not-reached check as a SKIPPED record. A check is APPLICABLE
  // only when its feature is configured; non-applicable checks are omitted.
  // The step result is the roll-up of the emitted assertions
  // (FAIL > WARNING > all-SKIPPED > PASS). The leading statusCode check is
  // always applicable and always evaluated when a status came back, so an
  // all-SKIPPED roll-up can't happen on a normal request.
  //
  // Execution errors (NOT assertions) still return FAIL with NO records:
  //   - invalid step / OpenAPI resolution failures (handled above);
  //   - request-body schema validation failure (no request is made);
  //   - total network failure with no response at all (no status came back).
  // ---------------------------------------------------------------------------
  const assertions: AssertionRecord[] = [];
  let shortCircuited = false;
  const descriptions: string[] = [];

  // (1) Request body matches OpenAPI schema. APPLICABLE only when
  // validateAgainstSchema is request/both and a request schema exists. This runs
  // BEFORE the request is made, so a failure here is an execution error: no
  // request is performed and no response/outputs exist -> FAIL, no records
  // (preserves the prior early return).
  if (
    (step.httpRequest.openApi?.validateAgainstSchema === "request" ||
      step.httpRequest.openApi?.validateAgainstSchema === "both") &&
    operation.schemas.request
  ) {
    const ajv = new Ajv({
      strictSchema: false,
      useDefaults: true,
      allErrors: true,
      allowUnionTypes: true,
      coerceTypes: false,
    });
    const validateFn = ajv.compile(operation.schemas.request);
    const valid = validateFn(step.httpRequest.request.body);
    if (valid) {
      assertions.push({
        statement: "request body matches OpenAPI schema",
        source: "implicit",
        result: "PASS",
        description: `Request body matched the OpenAPI schema.`,
      });
      descriptions.push(`Request body matched the OpenAPI schema.`);
    } else {
      // Preserve prior behavior: execution error, FAIL, no assertion records.
      result.status = "FAIL";
      result.description = ` Request body didn't match the OpenAPI schema. ${JSON.stringify(
        validateFn.errors,
        null,
        2
      )}`;
      return result;
    }
  }

  let response: any = {};
  if (!step?.httpRequest?.openApi?.mockResponse) {
    // Perform request
    response = await axios(request)
      .then((response: any) => {
        return response;
      })
      .catch((error: any) => {
        return { error };
      });
    if (response?.error?.response) response = response.error.response;
    // Total network failure: no response object came back at all (e.g. DNS
    // failure, connection refused). Per the locked ruling this is an EXECUTION
    // error, not an assertion -> FAIL, no records. Only run the statusCode
    // assertion when a status actually came back (including 4xx/5xx via
    // error.response).
    if (typeof response.status === "undefined") {
      result.outputs.response = {
        body: response.data,
        statusCode: response.status,
        headers: response.headers,
      };
      result.status = "FAIL";
      result.description = `Request to ${step.httpRequest.url} failed: no response received.`;
      return result;
    }
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

  // (2) statusCode ∈ statusCodes. Always applicable (statusCodes is defaulted)
  // and always evaluated (a status came back).
  if (step.httpRequest.statusCodes) {
    const statusPass =
      step.httpRequest.statusCodes.indexOf(response.status) >= 0;
    const statusDescription = statusPass
      ? `Returned ${response.status}.`
      : `Returned ${response.status}. Expected one of ${JSON.stringify(
          step.httpRequest.statusCodes
        )}.`;
    assertions.push({
      statement: `statusCode in ${JSON.stringify(step.httpRequest.statusCodes)}`,
      source: "implicit",
      result: statusPass ? "PASS" : "FAIL",
      expected: step.httpRequest.statusCodes,
      actual: response.status,
      description: statusDescription,
    });
    descriptions.push(statusDescription);
    if (!statusPass) shortCircuited = true;
  }

  // (3) Required response fields present. APPLICABLE only when
  // response.required is non-empty.
  if (step.httpRequest.response?.required?.length > 0) {
    const requiredStatement = `response fields present: ${JSON.stringify(
      step.httpRequest.response.required
    )}`;
    if (shortCircuited) {
      assertions.push({
        statement: requiredStatement,
        source: "implicit",
        result: "SKIPPED",
        expected: step.httpRequest.response.required,
      });
    } else {
      const missingFields: string[] = [];
      for (const fieldPath of step.httpRequest.response.required) {
        if (!fieldExistsAtPath(response.data, fieldPath)) {
          missingFields.push(fieldPath);
        }
      }
      if (missingFields.length > 0) {
        const desc = `Missing required fields: ${missingFields.join(", ")}`;
        assertions.push({
          statement: requiredStatement,
          source: "implicit",
          result: "FAIL",
          expected: step.httpRequest.response.required,
          description: desc,
        });
        descriptions.push(desc);
        shortCircuited = true;
      } else {
        assertions.push({
          statement: requiredStatement,
          source: "implicit",
          result: "PASS",
          expected: step.httpRequest.response.required,
        });
      }
    }
  }

  // (4) Response body matches OpenAPI schema. APPLICABLE only when
  // validateAgainstSchema is response/both and a response schema exists.
  if (
    (step.httpRequest.openApi?.validateAgainstSchema === "response" ||
      step.httpRequest.openApi?.validateAgainstSchema === "both") &&
    operation.schemas.response
  ) {
    const responseSchemaStatement = "response body matches OpenAPI schema";
    if (shortCircuited) {
      assertions.push({
        statement: responseSchemaStatement,
        source: "implicit",
        result: "SKIPPED",
      });
    } else {
      const ajv = new Ajv({
        strictSchema: false,
        useDefaults: true,
        allErrors: true,
        allowUnionTypes: true,
        coerceTypes: false,
      });
      const validateFn = ajv.compile(operation.schemas.response);
      const valid = validateFn(response.data);
      if (valid) {
        assertions.push({
          statement: responseSchemaStatement,
          source: "implicit",
          result: "PASS",
          description: `Response data matched the OpenAPI schema.`,
        });
        descriptions.push(`Response data matched the OpenAPI schema.`);
      } else {
        const desc = `Response data didn't match the OpenAPI schema. ${JSON.stringify(
          validateFn.errors,
          null,
          2
        )}`;
        assertions.push({
          statement: responseSchemaStatement,
          source: "implicit",
          result: "FAIL",
          description: desc,
        });
        descriptions.push(desc);
        shortCircuited = true;
      }
    }
  }

  // (5) No unexpected fields. APPLICABLE only when allowAdditionalFields is
  // false.
  if (!step.httpRequest.allowAdditionalFields) {
    const noExtraStatement = "no unexpected response fields";
    if (shortCircuited) {
      assertions.push({
        statement: noExtraStatement,
        source: "implicit",
        result: "SKIPPED",
      });
    } else {
      const dataComparison = objectExistsInObject(
        step.httpRequest.response.body,
        response.data
      );
      if (dataComparison.result.status === "FAIL") {
        const desc = `Response contained unexpected fields.`;
        assertions.push({
          statement: noExtraStatement,
          source: "implicit",
          result: "FAIL",
          description: desc,
        });
        descriptions.push(desc);
        shortCircuited = true;
      } else {
        assertions.push({
          statement: noExtraStatement,
          source: "implicit",
          result: "PASS",
        });
      }
    }
  }

  // (6) Response body type matches + body match. APPLICABLE only when
  // response.body is defined.
  if (typeof step.httpRequest.response?.body !== "undefined") {
    const bodyStatement = "response.body matches expected";
    if (shortCircuited) {
      assertions.push({
        statement: bodyStatement,
        source: "implicit",
        result: "SKIPPED",
        expected: step.httpRequest.response.body,
      });
    } else {
      // Check if response body is the same type
      if (
        typeof step.httpRequest.response.body !== typeof response.data ||
        (typeof step.httpRequest.response.body === "object" &&
          Array.isArray(step.httpRequest.response.body) !==
            Array.isArray(response.data))
      ) {
        const desc = `Expected response body type didn't match actual response body type.`;
        assertions.push({
          statement: bodyStatement,
          source: "implicit",
          result: "FAIL",
          expected: step.httpRequest.response.body,
          actual: response.data,
          description: desc,
        });
        descriptions.push(desc);
        shortCircuited = true;
      } else if (typeof step.httpRequest.response.body === "string") {
        // SANCTIONED (Phase 4a.2a): a matching string body used to `return result`
        // here, short-circuiting the response.headers check and `path` file save.
        // That early return was intentionally removed so those checks run too.
        const bodyPass = step.httpRequest.response.body === response.data;
        const desc = bodyPass
          ? undefined
          : `Expected response body didn't match actual response body.`;
        assertions.push({
          statement: bodyStatement,
          source: "implicit",
          result: bodyPass ? "PASS" : "FAIL",
          expected: step.httpRequest.response.body,
          actual: response.data,
          ...(desc ? { description: desc } : {}),
        });
        if (desc) {
          descriptions.push(desc);
          shortCircuited = true;
        }
      } else if (typeof step.httpRequest.response.body === "object") {
        const dataComparison = objectExistsInObject(
          step.httpRequest.response.body,
          response.data
        );
        if (dataComparison.result.status === "PASS") {
          const desc = `Expected response body was present in actual response body.`;
          assertions.push({
            statement: bodyStatement,
            source: "implicit",
            result: "PASS",
            expected: step.httpRequest.response.body,
            description: desc,
          });
          descriptions.push(desc);
        } else {
          assertions.push({
            statement: bodyStatement,
            source: "implicit",
            result: "FAIL",
            expected: step.httpRequest.response.body,
            actual: response.data,
            description: dataComparison.result.description,
          });
          descriptions.push(dataComparison.result.description);
          shortCircuited = true;
        }
      }
    }
  }

  // (7) Response headers subset. APPLICABLE only when response.headers is
  // non-empty.
  if (
    typeof step.httpRequest.response?.headers !== "undefined" &&
    JSON.stringify(step.httpRequest.response?.headers) != "{}"
  ) {
    const headersStatement = "response.headers contains expected";
    if (shortCircuited) {
      assertions.push({
        statement: headersStatement,
        source: "implicit",
        result: "SKIPPED",
        expected: step.httpRequest.response.headers,
      });
    } else {
      // Preprocess headers to lowercase
      const headers: any = {};
      Object.keys(step.httpRequest.response.headers).forEach((key: any) => {
        headers[key.toLowerCase()] = step.httpRequest.response.headers[key];
      });
      const responseHeaders: any = {};
      Object.keys(response.headers).forEach((key: any) => {
        responseHeaders[key.toLowerCase()] = response.headers[key];
      });
      const dataComparison = objectExistsInObject(headers, responseHeaders);
      if (dataComparison.result.status === "PASS") {
        const desc = `Expected response headers were present in actual response headers.`;
        assertions.push({
          statement: headersStatement,
          source: "implicit",
          result: "PASS",
          expected: step.httpRequest.response.headers,
          description: desc,
        });
        descriptions.push(desc);
      } else {
        assertions.push({
          statement: headersStatement,
          source: "implicit",
          result: "FAIL",
          expected: step.httpRequest.response.headers,
          description: dataComparison.result.description,
        });
        descriptions.push(dataComparison.result.description);
        shortCircuited = true;
      }
    }
  }

  // (8) Saved-file variation ≤ maxVariation. APPLICABLE only when path is set.
  // Exceeding the tolerance is a WARNING (not a FAIL). The file-write/overwrite
  // side effects are preserved exactly as before and run whenever the file
  // exists, regardless of short-circuit; only the *assertion record* honors
  // short-circuit (applicable-but-not-reached -> SKIPPED).
  if (step.httpRequest.path) {
    const variationStatement = `saved-file variation <= ${step.httpRequest.maxVariation}`;
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
      descriptions.push(`Saved output to file.`);
    } else {
      if (step.httpRequest.overwrite == "false") {
        // File already exists
        descriptions.push(`Didn't save output. File already exists.`);
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
          descriptions.push(`Saved response to file.`);
        }
        const desc = `The difference between the existing saved response and the new response (${fractionalDiff.toFixed(
          2
        )}) is greater than the max accepted variation (${
          step.httpRequest.maxVariation
        }).`;
        if (shortCircuited) {
          assertions.push({
            statement: variationStatement,
            source: "implicit",
            result: "SKIPPED",
            expected: step.httpRequest.maxVariation,
          });
        } else {
          assertions.push({
            statement: variationStatement,
            source: "implicit",
            result: "WARNING",
            expected: step.httpRequest.maxVariation,
            actual: fractionalDiff,
            description: desc,
          });
          descriptions.push(desc);
        }
      } else {
        if (step.httpRequest.overwrite == "true") {
          // Overwrite file
          fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));
          descriptions.push(`Saved response to file.`);
        }
        if (shortCircuited) {
          assertions.push({
            statement: variationStatement,
            source: "implicit",
            result: "SKIPPED",
            expected: step.httpRequest.maxVariation,
          });
        } else {
          assertions.push({
            statement: variationStatement,
            source: "implicit",
            result: "PASS",
            expected: step.httpRequest.maxVariation,
            actual: fractionalDiff,
          });
        }
      }
    }
  }

  result.assertions = assertions;
  result.status = rollUpResults(assertions);
  result.description = descriptions.join(" ").trim();
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
function fieldExistsAtPath(obj: any, path: string) {
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

function arrayExistsInArray(expected: any, actual: any): any {
  let status = "PASS";
  let description = "";
  for (let i = 0; i < expected.length; i++) {
    if (Array.isArray(expected[i])) {
      // Array
      //// Check if any arrays in actual
      // Gather info about array to make comparison
      let numExpectedArrays = 0;
      let numExpectedObjects = 0;
      expected[i].forEach((value: any) => {
        if (Array.isArray(value)) {
          numExpectedArrays++;
        } else if (typeof value === "object") {
          numExpectedObjects++;
        }
      });
      // Iterate through actual to find arrays that might match expected[i]
      let arrayMatches = 0;
      let arrayIndexMatches: any[] = [];
      actual.forEach((value: any) => {
        let numActualArrays = 0;
        let numActualObjects = 0;
        if (Array.isArray(value)) {
          value.forEach((item: any) => {
            if (Array.isArray(item)) {
              numActualArrays++;
            } else if (typeof item === "object") {
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
      arrayIndexMatches.forEach((array: any) => {
        const arrayMatchResult = arrayExistsInArray(expected[i], array);
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
      const keys = Object.keys(expected[i]);
      let objectMatches = 0;
      const objectKeyMatches = actual.filter(
        (value: any) =>
          // Is an object
          typeof value === "object" &&
          // Is not an array
          !Array.isArray(value) &&
          // Contains all the specified keys
          keys.every((key) => value.hasOwnProperty(key))
      );
      objectKeyMatches.forEach((object: any) => {
        const objectMatchResult = objectExistsInObject(expected[i], object);
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
  const result = { status, description };
  return { result };
}

function objectExistsInObject(expected: any, actual: any): any {
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
        const compResult = arrayExistsInArray(expected[key], actual[key]);
        if (compResult.result.status === "FAIL") status = "FAIL";
        if (compResult.result.description != "")
          description = description + " " + compResult.result.description;
      } else {
        // Nested object recursion
        const compResult = objectExistsInObject(expected[key], actual[key]);
        if (compResult.result.status === "FAIL") status = "FAIL";
        if (compResult.result.description != "")
          description = description + " " + compResult.result.description;
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
  const result = { status, description };
  return { result };
}
