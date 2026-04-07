import { validate } from "../../common/src/validate.js";
import { isRelativeUrl } from "../utils.js";
import axios from "axios";

export { checkLink };

async function checkLink({ config, step }: { config: any; step: any }) {
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
  const defaultHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
  };
  const requestConfig = {
    headers: {
      ...defaultHeaders,
      ...(step.checkLink.headers || {}),
    },
    timeout: 10000, // 10 second timeout
    maxRedirects: 5
  };

  let req: any = await axios
    .get(step.checkLink.url, requestConfig)
    .then((res: any) => {
      return { statusCode: res.status };
    })
    .catch((error: any) => {
      return { error };
    });

  // If request returned an error
  if (req.error) {
    // If we have a response with a status code, check against accepted codes
    if (req.error.response && req.error.response.status) {
      const statusCode = req.error.response.status;
      const responseHeaders = req.error.response.headers || {};
      let description = `Returned ${statusCode}. Expected one of ${JSON.stringify(step.checkLink.statusCodes)}`;
      if (statusCode === 429) {
        // Detect known bot-protection and rate-limiting systems from response headers
        if (responseHeaders['x-vercel-mitigated'] === 'challenge') {
          description += `. The server is hosted on Vercel and issued a bot-protection challenge. Automated HTTP clients cannot solve JavaScript challenges. To bypass Vercel protection, set a 'x-vercel-protection-bypass' header with your project's bypass secret in the step's 'headers' field.`;
        } else if (responseHeaders['cf-mitigated'] || responseHeaders['cf-ray']) {
          description += `. The server appears to be protected by Cloudflare. Automated HTTP clients may be rate-limited or challenged. Consider using a browser-based step or configuring bypass headers if available.`;
        } else if (responseHeaders['retry-after']) {
          description += `. The server requested a retry after ${responseHeaders['retry-after']} seconds. This is a rate-limiting response.`;
        } else {
          description += `. This may be caused by bot-protection or rate-limiting. If the URL works in a browser, the server may require JavaScript execution or specific headers. Check the step's 'headers' field to pass any required bypass tokens.`;
        }
      }
      result.description = description;
    } else {
      result.status = "FAIL";
      result.description = `Invalid or unresolvable URL: ${step.checkLink.url}`;
      return result;
    }
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
