import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";
import { applyCookies, matchesDomain, resolveStatePath } from "./browserState.js";
import fs from "node:fs";

export { loadCookie, parseNetscapeCookieFile };

/**
 * Load a specific cookie from a file or environment variable into the browser.
 * @async
 * @param {Object} config - The test configuration.
 * @param {Object} step - The step object containing loadCookie options.
 * @param {Object} driver - The WebDriver instance.
 * @returns {Promise<Object>} A result object indicating success or failure.
 */
async function loadCookie({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Loaded cookie.",
    outputs: {},
  };

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  // The effective step (ADR 01167): an object with a `name` and either a
  // `variable` or a `path`, which the schema guarantees.
  step = isValidStep.object;
  const { name: cookieName, path: filePath, directory, domain, variable } = step.loadCookie;

  try {
    let targetCookie = null;

    if (variable) {
      // Load cookie from environment variable
      const cookieData = process.env[variable];
      if (!cookieData) {
        result.status = "FAIL";
        result.description = `Couldn't load cookie: environment variable \`${variable}\` isn't set.`;
        return result;
      }

      try {
        targetCookie = JSON.parse(cookieData);
        log(
          config,
          "debug",
          `Loaded cookie from environment variable '${variable}'`
        );
      } catch {
        result.status = "FAIL";
        result.description = `Couldn't load cookie: environment variable \`${variable}\` doesn't hold cookie JSON.`;
        return result;
      }
    } else {
      // Load cookie from file
      const fullPath = resolveStatePath(config, { path: filePath, directory });

      if (!fs.existsSync(fullPath)) {
        result.status = "FAIL";
        result.description = `Couldn't load cookie: \`${fullPath}\` doesn't exist.`;
        return result;
      }

      try {
        const fileContent = fs.readFileSync(fullPath, "utf8");
        const cookies = parseNetscapeCookieFile(fileContent);

        if (cookies.length === 0) {
          result.status = "FAIL";
          result.description = `Couldn't load cookie: \`${fullPath}\` has no cookies.`;
          return result;
        }

        // Find the specific cookie
        targetCookie = cookies.find(
          (cookie) => cookie.name === cookieName && matchesDomain(cookie.domain, domain)
        );

        if (!targetCookie) {
          result.status = "FAIL";
          result.description = `Couldn't load cookie: \`${fullPath}\` has no cookie named \`${cookieName}\`${
            domain ? ` for \`${domain}\`` : ""
          }.`;
          return result;
        }

        log(
          config,
          "debug",
          `Loaded cookie '${targetCookie.name}' from file: ${fullPath}`
        );
      } catch {
        result.status = "FAIL";
        result.description = `Couldn't load cookie: \`${fullPath}\` isn't a readable file.`;
        return result;
      }
    }

    // Validate cookie data
    if (!targetCookie || !targetCookie.name) {
      result.status = "FAIL";
      result.description = "Couldn't load cookie: the cookie has no `name`.";
      return result;
    }

    // Set the cookie, if its domain fits the open page
    const currentUrl = await driver.getUrl();
    const applied = await applyCookies(driver, [targetCookie], currentUrl);
    if (applied.length === 0) {
      result.status = "FAIL";
      result.description = `Couldn't load cookie: its domain \`${targetCookie.domain}\` doesn't match the open page's host \`${new URL(currentUrl).hostname}\`. Use \`goTo\` to open that site first.`;
      return result;
    }

    result.description = `Loaded cookie \`${targetCookie.name}\`.`;
    result.outputs.cookieName = targetCookie.name;
    result.outputs.domain = targetCookie.domain;

    log(
      config,
      "debug",
      `Successfully set cookie '${targetCookie.name}' in browser`
    );
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't load cookie. ${error.message}`;
    log(config, "error", result.description);
  }

  return result;
}

/**
 * Parse Netscape cookie file format.
 * @param {string} content - File content.
 * @returns {Array} Array of cookie objects.
 */
function parseNetscapeCookieFile(content: string) {
  const cookies: any[] = [];
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
      const cookie: any = {
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
