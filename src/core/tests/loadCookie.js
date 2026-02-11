const { validate } = require("doc-detective-common");
const { log } = require("../utils");
const path = require("path");
const fs = require("fs");

exports.loadCookie = loadCookie;

/**
 * Load a specific cookie from a file or environment variable into the browser.
 * @async
 * @param {Object} config - The test configuration.
 * @param {Object} step - The step object containing loadCookie options.
 * @param {Object} driver - The WebDriver instance.
 * @returns {Promise<Object>} A result object indicating success or failure.
 */
async function loadCookie({ config, step, driver }) {
  let result = {
    status: "PASS",
    description: "Loaded cookie.",
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
  let cookieName, filePath, directory, domain, variable;

  if (typeof step.loadCookie === "string") {
    // Simple string format - could be cookie name or file path
    if (step.loadCookie.endsWith(".txt")) {
      // Looks like a file path
      cookieName = path.basename(step.loadCookie, ".txt");
      filePath = step.loadCookie;
    } else {
      // Treat as cookie name, load from environment variable
      cookieName = step.loadCookie;
      variable = cookieName;
    }
  } else {
    // Object format
    cookieName = step.loadCookie.name;
    filePath = step.loadCookie.path;
    directory = step.loadCookie.directory;
    domain = step.loadCookie.domain;
    variable = step.loadCookie.variable;

    // If only a file path is provided and name is omitted, infer name from filename
    if (filePath && !cookieName) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".txt") {
        cookieName = path.basename(filePath, ext);
      }
    }
  }

  try {
    let targetCookie = null;

    if (variable) {
      // Load cookie from environment variable
      const cookieData = process.env[variable];
      if (!cookieData) {
        result.status = "FAIL";
        result.description = `Environment variable '${variable}' not found or empty`;
        return result;
      }

      try {
        targetCookie = JSON.parse(cookieData);
        log(
          config,
          "debug",
          `Loaded cookie from environment variable '${variable}'`
        );
      } catch (parseError) {
        result.status = "FAIL";
        result.description = `Failed to parse cookie data from environment variable '${variable}': ${parseError.message}`;
        return result;
      }
    } else if (filePath) {
      // Load cookie from file
      const inputDirectory = directory || config.output || process.cwd();
      const fullPath = path.resolve(inputDirectory, filePath);

      if (!fs.existsSync(fullPath)) {
        result.status = "FAIL";
        result.description = `Cookie file '${fullPath}' not found`;
        return result;
      }

      try {
        const fileContent = fs.readFileSync(fullPath, "utf8");
        const cookies = parseNetscapeCookieFile(fileContent);

        if (cookies.length === 0) {
          result.status = "FAIL";
          result.description = `No valid cookies found in file '${fullPath}'`;
          return result;
        }

        // Find the specific cookie
        targetCookie = cookies.find((cookie) => {
          const nameMatches = cookie.name === cookieName;
          const domainMatches =
            !domain ||
            (cookie.domain &&
              (cookie.domain === domain ||
                cookie.domain === "." + domain ||
                cookie.domain.endsWith("." + domain)));
          return nameMatches && domainMatches;
        });

        if (!targetCookie) {
          result.status = "FAIL";
          result.description = `Cookie '${cookieName}' not found in file '${fullPath}'${
            domain ? ` for domain '${domain}'` : ""
          }`;
          return result;
        }

        log(
          config,
          "debug",
          `Loaded cookie '${targetCookie.name}' from file: ${fullPath}`
        );
      } catch (readError) {
        result.status = "FAIL";
        result.description = `Failed to read cookie file '${fullPath}': ${readError.message}`;
        return result;
      }
    } else {
      result.status = "FAIL";
      result.description =
        "No cookie source specified (file path or environment variable)";
      return result;
    }

    // Validate cookie data
    if (!targetCookie || !targetCookie.name) {
      result.status = "FAIL";
      result.description = "Invalid cookie data: missing name";
      return result;
    }

    // Check for domain compatibility
    const currentUrl = await driver.getUrl();
    const currentDomain = new URL(currentUrl).hostname;

    if (
      targetCookie.domain &&
      !isDomainCompatible(currentDomain, targetCookie.domain)
    ) {
      result.status = "FAIL";
      result.description = `Cookie domain '${targetCookie.domain}' is not compatible with current page domain '${currentDomain}'`;
      return result;
    }

    // Prepare cookie for WebDriver
    // Handle sameSite and secure relationship: if sameSite is "None", secure must be true
    const isHttps = currentUrl.startsWith("https://");

    let sameSite = targetCookie.sameSite || "Lax";   // When migrating to BiDi, this needs to be lowercased ("lax")
    let secure = targetCookie.secure || false;

    // If sameSite is "None", secure must be true, but only if we're on HTTPS
    if (sameSite === "None") {    // When migrating to BiDi, this needs to be lowercased ("none")
      if (isHttps) {
        secure = true;
      } else {
        // For HTTP, we can't use sameSite: "None", fall back to "Lax"
        sameSite = "Lax";
        log(
          config,
          "debug",
          `Changed sameSite from "None" to "Lax" because current URL is HTTP`
        );
      }
    }

    const cookieForDriver = {
      name: targetCookie.name,
      value: targetCookie.value,
      path: targetCookie.path || "/",
      secure: secure,
      httpOnly: targetCookie.httpOnly || false,
      sameSite: sameSite,
    };

    // Handle domain: special handling for localhost and IP addresses
    const isLocalhost = isLocalOrPrivateNetwork(currentDomain);

    if (targetCookie.domain && !isLocalhost) {
      cookieForDriver.domain = targetCookie.domain;
    }
    // For localhost/IP addresses, never set the domain property - let the browser handle it

    // Add expiry if it exists and is valid
    if (
      targetCookie.expiry &&
      targetCookie.expiry > Math.floor(Date.now() / 1000)
    ) {
      cookieForDriver.expiry = targetCookie.expiry;
    }

    // Set the cookie in the browser
    await driver.setCookies(cookieForDriver);

    result.description = `Loaded cookie '${targetCookie.name}' into browser.`;
    result.outputs.cookieName = targetCookie.name;
    result.outputs.domain = targetCookie.domain;

    log(
      config,
      "debug",
      `Successfully set cookie '${targetCookie.name}' in browser`
    );
  } catch (error) {
    result.status = "FAIL";
    result.description = `Failed to load cookie: ${error.message}`;
    log(config, "error", result.description);
  }

  return result;
}

/**
 * Check if a domain is localhost or a private network IP address.
 * @param {string} domain - The domain to check.
 * @returns {boolean} True if the domain is localhost or a private IP.
 */
function isLocalOrPrivateNetwork(domain) {
  // Check for localhost and IPv6 loopback
  if (domain === "localhost" || domain === "::1") {
    return true;
  }

  // Check if it's an IPv4 address
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = domain.match(ipv4Regex);

  if (!match) {
    return false; // Not an IPv4 address
  }

  // Parse octets
  const octets = match.slice(1, 5).map(Number);

  // Validate that all octets are in valid range (0-255)
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  // Check private IP ranges:
  // 127.0.0.0/8 (loopback)
  if (first === 127) {
    return true;
  }

  // 10.0.0.0/8 (private class A)
  if (first === 10) {
    return true;
  }

  // 192.168.0.0/16 (private class C)
  if (first === 192 && second === 168) {
    return true;
  }

  // 172.16.0.0/12 (private class B: 172.16.0.0 to 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return false;
}

/**
 * Parse Netscape cookie file format.
 * @param {string} content - File content.
 * @returns {Array} Array of cookie objects.
 */
function parseNetscapeCookieFile(content) {
  const cookies = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines, but allow #HttpOnly_ prefixed lines
    if (
      (trimmed.startsWith("#") && !trimmed.startsWith("#HttpOnly_")) ||
      trimmed === ""
    ) {
      continue;
    }

    // Check if this is an #HttpOnly_ prefixed line
    const isHttpOnlyLine = trimmed.startsWith("#HttpOnly_");
    let lineToParse = trimmed;

    if (isHttpOnlyLine) {
      // Remove the #HttpOnly_ prefix for parsing
      lineToParse = trimmed.substring(10); // Remove "#HttpOnly_"
    }

    const parts = lineToParse.split("\t");
    if (parts.length >= 7) {
      const cookie = {
        domain: parts[0],
        path: parts[2],
        secure: parts[3] === "TRUE",
        name: parts[5],
        value: parts[6],
        httpOnly: isHttpOnlyLine || (parts.length > 7 && parts[7] === "TRUE"),
        sameSite: parts.length > 8 ? parts[8] : "Lax",   // When migrating to BiDi, sameSite needs to be lowercased ("lax")
      };

      // Add expiry if it's a valid number and greater than current time
      const expiry = parseInt(parts[4]);
      if (!isNaN(expiry) && expiry > 0) {
        // Only add expiry if it's in the future
        const currentTime = Math.floor(Date.now() / 1000);
        if (expiry > currentTime) {
          cookie.expiry = expiry;
        }
        // If expiry is 0 or in the past, omit it (creates a session cookie)
      }

      cookies.push(cookie);
    }
  }

  return cookies;
}

/**
 * Check if a cookie domain is compatible with the current page domain.
 * @param {string} currentDomain - Current page domain.
 * @param {string} cookieDomain - Cookie domain.
 * @returns {boolean} True if compatible.
 */
function isDomainCompatible(currentDomain, cookieDomain) {
  if (!cookieDomain) return true;

  // Remove leading dot from cookie domain for comparison
  const normalizedCookieDomain = cookieDomain.startsWith(".")
    ? cookieDomain.substring(1)
    : cookieDomain;

  // Exact match
  if (currentDomain === normalizedCookieDomain) return true;

  // Current domain is a subdomain of cookie domain
  if (currentDomain.endsWith("." + normalizedCookieDomain)) return true;

  return false;
}
