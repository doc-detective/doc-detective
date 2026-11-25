import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";
import { publishFile, readCookies, resolveStatePath } from "./browserState.js";

export { saveCookie, formatCookieForNetscape };

/**
 * Save a specific browser cookie to a file or environment variable for later reuse.
 * @async
 * @param {Object} config - The test configuration.
 * @param {Object} step - The step object containing saveCookie options.
 * @param {Object} driver - The WebDriver instance.
 * @returns {Promise<Object>} A result object indicating success or failure.
 */
async function saveCookie({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Saved cookie.",
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
  const {
    name: cookieName,
    path: filePath,
    directory,
    overwrite,
    domain,
    variable,
  } = step.saveCookie;

  try {
    // Find the specific cookie. The schema requires `name`.
    const [targetCookie] = await readCookies(driver, { name: cookieName, domain });
    if (!targetCookie) {
      result.status = "FAIL";
      result.description = `Couldn't save cookie: no cookie named \`${cookieName}\` is set${domain ? ` for \`${domain}\`` : ""}.`;
      return result;
    }
    log(config, "debug", `Found cookie '${cookieName}' with value: ${targetCookie.value ? '[REDACTED]' : '[EMPTY]'}`);

    if (variable) {
      // Save cookie to environment variable as JSON
      process.env[variable] = JSON.stringify(targetCookie);
      result.description = `Saved cookie \`${cookieName}\` to environment variable \`${variable}\`.`;
      log(config, "debug", `Saved cookie to environment variable '${variable}'`);
    }

    if (filePath) {
      const fullPath = resolveStatePath(config, { path: filePath, directory });

      const content = `# Netscape HTTP Cookie File
# This is a cookie file saved by Doc Detective
${formatCookieForNetscape(targetCookie)}
`;
      // The cookie works like a password: publish it atomically, owner-only.
      // `overwrite` is a boolean; validation coerces "true" to true.
      if (!publishFile(fullPath, content, overwrite === true)) {
        result.status = "FAIL";
        result.description = `Couldn't save cookie: \`${fullPath}\` exists. Set \`overwrite\` to \`true\` to replace it.`;
        return result;
      }
      result.description = `Saved cookie \`${cookieName}\` to \`${fullPath}\`.`;
      log(config, "debug", `Saved cookie '${cookieName}' to file: ${fullPath}`);

      result.outputs.path = fullPath;
    }

  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't save cookie. ${error.message}`;
    log(config, "error", result.description);
  }

  return result;
}

/**
 * Format a cookie object for Netscape cookie format.
 * @param {Object} cookie - Cookie object from WebDriver.
 * @returns {string} Formatted cookie string.
 */
function formatCookieForNetscape(cookie: any) {
  // Netscape format: domain, flag, path, secure, expiration, name, value. Seven
  // columns, so curl reads the file. httpOnly rides on curl's `#HttpOnly_`
  // domain prefix, which parseNetscapeCookieFile reads back. The format has no
  // standard place for sameSite, so it isn't written; saveState's JSON keeps it.
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
  const prefix = cookie.httpOnly ? '#HttpOnly_' : '';

  return `${prefix}${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiry}\t${name}\t${value}`;
}
