const axios = require("axios");
const { async } = require("q");
const { setEnvs } = require("../utils");

exports.httpRequest = httpRequest;

async function httpRequest(action) {
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
    method: "GET",
    headers: {},
    params: {},
    requestData: {},
    responseData: {},
    statusCodes: ["200"],
  };

  // Load environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }

  // URI
  //// Define
  if (action.uri[0] === "$") {
    uri = process.env[action.uri.substring(1)];
  } else {
    uri = action.uri || defaultPayload.uri;
  }
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
  if (action.method && action.method[0] === "$") {
    method = process.env[action.method.substring(1)];
  } else {
    method = action.method || defaultPayload.method;
  }
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
  if (action.headers && JSON.stringify(action.headers) != "{}") {
    //// Define
    if (action.headers[0] === "$") {
      headers = process.env[action.headers.substring(1)];
      headers = JSON.parse(headers);
    } else {
      headers = action.headers || defaultPayload.headers;
    }
    //// Validate
    //// Set request
    if (JSON.stringify(headers) != "{}") request.headers = headers;
  }

  // Params
  if (action.params && JSON.stringify(action.params) != "{}") {
    //// Define
    if (action.params[0] === "$") {
      params = process.env[action.params.substring(1)];
      params = JSON.parse(params);
    } else {
      params = action.params || defaultPayload.params;
    }
    //// Validate
    //// Set request
    if (params != {}) request.params = params;
  }

  // requestData
  if (action.requestData) {
    //// Define
    if (action.requestData[0] === "$") {
      requestData = process.env[action.requestData.substring(1)];
      requestData = JSON.parse(requestData);
    } else {
      requestData = action.requestData || defaultPayload.requestData;
    }
    //// Validate
    //// Set request
    if (requestData != {}) request.data = requestData;
  }

  // responseData
  //// Define
  if (action.responseData && action.responseData[0] === "$") {
    responseData = process.env[action.responseData.substring(1)];
    responseData = JSON.parse(responseData);
  } else {
    responseData = action.responseData || defaultPayload.responseData;
  }
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
    description = `Error: ${JSON.stringify(response.error.response)}`;
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

  // Compare response and responseData
  if (JSON.stringify(responseData) != "{}") {
    dataComparison = objectExistsInObject(responseData, response.data);
    if ((dataComparison.result.status = "PASS")) {
      status = "PASS";
      description =
        description +
        ` Expected response data was present in actual response data.`;
    } else {
      status = "FAIL";
      description = description + " " + dataComparison.result.description;
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