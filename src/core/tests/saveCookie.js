const { validate } = require("doc-detective-common");
const { log } = require("../utils");
const path = require("path");
const fs = require("fs");

exports.saveCookie = saveCookie;

/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 * @async
 * @param {Object} config - The test configuration.
 * @param {Object} step - The step object containing saveCookie options.
 * @param {Object} driver - The WebDriver instance.
 * @returns {Promise<Object>} A result object indicating success or failure.
 */
async function saveCookie({ config, step, driver }) {
  let result = {
    status: "PASS",
    description: "Saved cookie.",
    outputs: {},
  };

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

  // Parse configuration
  let cookieName, filePath, directory, overwrite, domain, variable;

  if (typeof step.saveCookie === "string") {
    if (step.saveCookie.endsWith(".txt")) {
      // Simple string format - treat as cookie name, save to environment variable
      cookieName = path.basename(step.saveCookie, ".txt");
      filePath = step.saveCookie;
    } else {
      // Simple string format - treat as cookie name, save to environment variable
      cookieName = step.saveCookie;
      variable = cookieName;
    }
  } else {
    // Object format
    cookieName = step.saveCookie.name;
    filePath = step.saveCookie.path;
    directory = step.saveCookie.directory;
    overwrite = step.saveCookie.overwrite;
    domain = step.saveCookie.domain;
    variable = step.saveCookie.variable;

    if (!cookieName) {
      result.status = "FAIL";
      result.description = "Cookie name must be specified.";
      return result;
    }
    if (!variable && !filePath) {
      result.status = "FAIL";
      result.description = "Either variable or file path must be specified.";
      return result;
    }
  }

  try {
    // Get all cookies from the browser
    const allCookies = await driver.getCookies();
    log(config, "debug", `Retrieved ${allCookies.length} cookies from browser`);

    // Find the specific cookie
    let targetCookie = null;
    if (cookieName) {
      targetCookie = allCookies.find(cookie => {
        const nameMatches = cookie.name === cookieName;
        const domainMatches = !domain || (cookie.domain && (
          cookie.domain === domain || 
          cookie.domain === '.' + domain ||
          cookie.domain.endsWith('.' + domain)
        ));
        return nameMatches && domainMatches;
      });

      if (!targetCookie) {
        result.status = "FAIL";
        result.description = `Cookie '${cookieName}' not found${domain ? ` for domain '${domain}'` : ''}`;
        return result;
      }

      log(config, "debug", `Found cookie '${cookieName}' with value: ${targetCookie.value ? '[REDACTED]' : '[EMPTY]'}`);
    }

    if (variable) {
      // Save cookie to environment variable as JSON
      const cookieData = targetCookie ? JSON.stringify(targetCookie) : "";
      process.env[variable] = cookieData;
      result.description = `Saved cookie to environment variable '${variable}'.`;
      log(config, "debug", `Saved cookie to environment variable '${variable}'`);
    }

    if (filePath) {
      // Resolve file path
      const outputDirectory = directory || config.output || process.cwd();
      const fullPath = path.resolve(outputDirectory, filePath);

      // Check if file exists and handle overwrite
      if (fs.existsSync(fullPath) && !(overwrite === true || overwrite === "true")) {  
        result.status = "FAIL";
        result.description = `File '${fullPath}' already exists and overwrite is not enabled.`;
        return result;
      }

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (targetCookie) {
        // Convert single cookie to Netscape format
        const netscapeCookie = formatCookieForNetscape(targetCookie);
        
        // Write Netscape format header and cookie
        const content = `# Netscape HTTP Cookie File
# This is a cookie file saved by Doc Detective
${netscapeCookie}
`;
        
        fs.writeFileSync(fullPath, content, 'utf8');
        result.description = `Saved cookie '${cookieName}' to '${fullPath}'.`;
        log(config, "debug", `Saved cookie '${cookieName}' to file: ${fullPath}`);
      } else {
        // Create empty file if no cookie found but file path specified
        fs.writeFileSync(fullPath, "# No cookie data\n", 'utf8');
        result.description = `Created empty cookie file at '${fullPath}'.`;
        log(config, "debug", `Created empty cookie file: ${fullPath}`);
      }

      result.outputs.path = fullPath;
    }

  } catch (error) {
    result.status = "FAIL";
    result.description = `Failed to save cookie: ${error.message}`;
    log(config, "error", result.description);
  }

  return result;
}

/**
 * Format a cookie object for Netscape cookie format.
 * @param {Object} cookie - Cookie object from WebDriver.
 * @returns {string} Formatted cookie string.
 */
function formatCookieForNetscape(cookie) {
  // Netscape format: domain	flag	path	secure	expiration	name	value
  const domain = cookie.domain || '';
  // The flag indicates if the domain applies to all subdomains
  // TRUE if domain starts with '.' (applies to subdomains), FALSE for exact domain match
  const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
  const cookiePath = cookie.path || '/';
  const secure = cookie.secure ? 'TRUE' : 'FALSE';
  // Use expiry if available, otherwise 0 for session cookie
  const expiry = cookie.expiry ? cookie.expiry.toString() : '0';
  const name = cookie.name || '';
  const value = cookie.value || '';

  return `${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiry}\t${name}\t${value}`;
}
