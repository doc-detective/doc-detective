const { validate } = require("doc-detective-common");
const { isRelativeUrl } = require("../utils");
const axios = require("axios");

exports.checkLink = checkLink;

async function checkLink({ config, step }) {
  let result = { status: "PASS", description: "Checked link." };

  // Resolve to object
  if (typeof step.checkLink === "string") {
    step.checkLink = { url: step.checkLink };
  }

  // Set origin for relative URLs
  if (isRelativeUrl(step.checkLink.url)) {
    if (!step.checkLink.origin && !config.origin) {
      result.status = "FAIL";
      result.description =
        "Relative URL provided without origin. Specify an origin in either the step or the config.";
      return result;
    }
    step.checkLink.origin = step.checkLink.origin || config.origin;
    // If there isn't the necessary slash, add it
    if (
      !step.checkLink.origin.endsWith("/") &&
      !step.checkLink.url.startsWith("/")
    ) {
      step.checkLink.origin += "/";
    }
    step.checkLink.url = step.checkLink.origin + step.checkLink.url;
  }

  // Make sure there's a protocol
  if (step.checkLink.url && !step.checkLink.url.includes("://"))
    step.checkLink.url = "https://" + step.checkLink.url;

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

  // Resolve to detailed object with defaults
  if (typeof step.checkLink.statusCodes === "undefined") {
    step.checkLink.statusCodes = [200, 301, 302, 307, 308];
  } else if (typeof step.checkLink.statusCodes === "number") {
    step.checkLink.statusCodes = [step.checkLink.statusCodes];
  }

  // Perform request with appropriate headers
  const requestConfig = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 10000, // 10 second timeout
    maxRedirects: 5
  };

  let req = await axios
    .get(step.checkLink.url, requestConfig)
    .then((res) => {
      return { statusCode: res.status };
    })
    .catch((error) => {
      return { error };
    });

  // If request returned an error
  if (req.error) {
    result.status = "FAIL";
    // If we have a response with a status code, include it
    if (req.error.response && req.error.response.status) {
      result.description = `Returned ${req.error.response.status}. Expected one of ${JSON.stringify(step.checkLink.statusCodes)}`;
    } else {
      result.description = `Invalid or unresolvable URL: ${step.checkLink.url}`;
    }
    return result;
  }

  // Compare status codes
  if (step.checkLink.statusCodes.indexOf(req.statusCode) >= 0) {
    result.status = "PASS";
    result.description = `Returned ${req.statusCode}`;
  } else {
    result.status = "FAIL";
    result.description = `Returned ${
      req.statusCode
    }. Expected one of ${JSON.stringify(step.checkLink.statusCodes)}`;
  }

  return result;
}
