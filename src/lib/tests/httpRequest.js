const axios = require("axios");
const jq = require("node-jq");
const { exit } = require("process");
const { setEnvs, loadEnvs, log } = require("../utils");

exports.httpRequest = httpRequest;

async function httpRequest(action, config) {
  const methods = ["get", "post", "put", "patch", "delete"];

  let status;
  let description;
  let result;
  let uri;
  let method;
  let statusCodes = [];
  let request = {};
  let response;
  let defaultPayload = {
    uri: "",
    method: "get",
    requestHeaders: {},
    requestParams: {},
    requestData: {},
    responseHeaders: {},
    responseData: {},
    statusCodes: ["200"],
    envsFromResponseData: [],
  };

  // Load environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }

  // URI
  //// Define
  uri = loadEnvs(action.uri) || defaultPayload.uri;

  //// Validate
  if (!uri || typeof uri != "string") {
    //Fail
  } else if (uri.indexOf("://") < 0) {
    // Insert HTTPS if no protocol present
    uri = `https://${uri}`;
  }
  //// Set request
  request.url = uri;

  // Method
  //// Define
  method = loadEnvs(action.method) || defaultPayload.method;

  //// Sanitize
  method = method.toLowerCase();
  //// Validate
  if (!method || typeof method != "string" || methods.indexOf(method) < 0) {
    // No/undefined method, method isn't a string, method isn't an accepted enum
    status = "FAIL";
    description = `Invalid HTTP method: ${method}`;
    result = { status, description };
    return { result };
  }
  //// Set request
  request.method = method;

  // Headers
  if (
    (action.requestHeaders && JSON.stringify(action.requestHeaders) != "{}") ||
    (action.headers && JSON.stringify(action.headers) != "{}")
  ) {
    //// Define
    requestHeaders =
      loadEnvs(action.requestHeaders) ||
      loadEnvs(action.headers) ||
      defaultPayload.requestHeaders;

    //// Validate
    //// Set request
    if (JSON.stringify(requestHeaders) != "{}")
      request.headers = requestHeaders;
  }

  // Params
  if ((action.requestParams && JSON.stringify(action.requestParams) != "{}") || (action.params && JSON.stringify(action.params) != "{}")) {
    //// Define
    requestParams =
      loadEnvs(action.requestParams) ||
      loadEnvs(action.params) ||
      defaultPayload.requestParams;

    //// Validate
    //// Set request
    if (JSON.stringify(requestParams) != "{}") request.params = requestParams;
  }

  // requestData
  if (action.requestData) {
    //// Define
    requestData = loadEnvs(action.requestData) || defaultPayload.requestData;

    //// Validate
    //// Set request
    if (requestData != {}) request.data = requestData;
  }

  // responseData
  //// Define
  responseData = loadEnvs(action.responseData) || defaultPayload.responseData;

  //// Validate

  // responseHeaders
  //// Define
  responseHeaders =
    loadEnvs(action.responseHeaders) || defaultPayload.responseHeaders;

  //// Validate

  // Status codes
  //// Define
  statusCodes = action.statusCodes || defaultPayload.statusCodes;
  //// Sanitize
  for (i = 0; i < statusCodes.length; i++) {
    if (typeof statusCodes[i] === "string")
      statusCodes[i] = Number(statusCodes[i]);
  }
  //// Validate
  if (statusCodes === []) statusCodes = defaultPayload.statusCodes;

  // Envs from response data
  //// Define
  envsFromResponseData =
    action.envsFromResponseData || defaultPayload.envsFromResponseData;
  //// Sanitize
  for (i = 0; i < envsFromResponseData.length; i++) {
    if (typeof statusCodes[i] === "string")
      statusCodes[i] = Number(statusCodes[i]);
  }
  //// Validate
  let validEnvs = envsFromResponseData.every(
    (env) =>
      typeof env === "object" &&
      env.name.match(/^[a-zA-Z0-9_]+$/gm) &&
      typeof env.jqFilter === "string" &&
      env.jqFilter.length > 1
  );
  if (!validEnvs) {
    envsFromResponseData = [];
    log(
      config,
      "warning",
      "Not setting environment variables. One or more invalid variable definitions."
    );
  }
  if (envsFromResponseData === [])
    envsFromResponseData = defaultPayload.envsFromResponseData;

  // Send request
  response = await axios(request)
    .then((response) => {
      return response;
    })
    .catch((error) => {
      return { error };
    });

  // If request returned an error
  if (response.error) {
    status = "FAIL";
    description = `Error: ${JSON.stringify(response.error.message)}`;
    result = { status, description };
    return { result };
  }

  // Compare status codes
  if (statusCodes.indexOf(response.status) >= 0) {
    status = "PASS";
    description = `Returned ${response.status}.`;
  } else {
    status = "FAIL";
    description = `Returned ${
      response.status
    }. Expected one of ${JSON.stringify(statusCodes)}`;
  }

  // Compare response.data and responseData
  if (JSON.stringify(responseData) != "{}") {
    dataComparison = objectExistsInObject(responseData, response.data);
    if (dataComparison.result.status === "PASS") {
      if (status != "FAIL") status = "PASS";
      description =
        description +
        ` Expected response data was present in actual response data.`;
    } else {
      status = "FAIL";
      description = description + " " + dataComparison.result.description;
    }
  }

  // Compare response.headers and responseHeaders
  if (JSON.stringify(responseHeaders) != "{}") {
    dataComparison = objectExistsInObject(responseHeaders, response.headers);
    if (dataComparison.result.status === "PASS") {
      if (status != "FAIL") status = "PASS";
      description =
        description +
        ` Expected response headers were present in actual response headers.`;
      status = "FAIL";
    } else {
      description = description + " " + dataComparison.result.description;
    }
  }

  // Set environment variables from response data
  for (const variable of envsFromResponseData) {
    let value = await jq.run(variable.jqFilter, response.data, {
      input: "json",
      output: "compact",
    });
    if (value) {
      process.env[variable.name] = value;
      description =
        description + ` Set '$${variable.name}' environment variable.`;
    } else {
      if (status != "FAIL") status = "WARNING";
      description =
        description +
        ` Couldn't set '${variable.name}' environment variable. The jq filter (${variable.jqFilter}) returned a null result.`;
    }
  }

  description = description.trim();
  result = { status, description };
  return { result };
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
        description + `The '${key}' key did't exist in returned JSON. `;
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
    } else if (expected[key] != actual[key]) {
      // Actual value doesn't match expected
      description =
        description +
        `The '${key}' key did't match the expected value. Expected: '${expected[key]}'. Actual: '${actual[key]}'. `;
      status = "FAIL";
    }

    if (status === "FAIL") {
      description = description.trim();
    }
  });
  result = { status, description };
  return { result };
}
