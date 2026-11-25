import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";
import { applyCookies, applyLocalStorage, cookiesFor, parseStateFile, resolveStatePath, siteOrigin } from "./browserState.js";
import fs from "node:fs";

export { loadState };

/**
 * Load the cookies and `localStorage` in a Playwright `storageState` JSON file
 * that fit the open site.
 */
async function loadState({ config, step, driver }: { config: any; step: any; driver: any }) {
  const result: any = { status: "PASS", description: "Loaded state.", outputs: {} };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  // The effective step (ADR 01167): always the object form.
  const { path: filePath, directory } = isValidStep.object.loadState;
  const fullPath = resolveStatePath(config, { path: filePath, directory });

  try {
    if (!fs.existsSync(fullPath)) {
      result.status = "FAIL";
      result.description = `Couldn't load state: \`${fullPath}\` doesn't exist.`;
      return result;
    }
    const state = parseStateFile(fs.readFileSync(fullPath, "utf8"));
    if (!state) {
      result.status = "FAIL";
      result.description = `Couldn't load state: \`${fullPath}\` isn't a valid state file.`;
      return result;
    }
    const currentUrl = await driver.getUrl();
    const origin = siteOrigin(currentUrl);
    if (!origin) {
      result.status = "FAIL";
      result.description = "Couldn't load state: no site is open. Use `goTo` first.";
      return result;
    }

    const fitting = cookiesFor(state.cookies, currentUrl);
    const entries = state.origins.find((entry) => entry.origin === origin)?.localStorage || [];
    if (fitting.length === 0 && entries.length === 0) {
      result.status = "FAIL";
      result.description = `Couldn't load state: \`${fullPath}\` has no data for \`${origin}\`. Use \`goTo\` to open that site first.`;
      return result;
    }
    // Storage first: the script writes only if the page is still on `origin`,
    // even with no entries, so a page that navigated away gets nothing. Then the
    // origin is read again right before the cookies, which WebDriver sets on
    // whatever page is open (on localhost, with no domain to pin them).
    // ponytail: one check before the cookie loop, not one per cookie; a page
    // that navigates mid-loop can still take the rest. Per-cookie checks if that
    // shows up.
    const left = `Couldn't load state: the page left \`${origin}\` before its state was restored.`;
    if (!(await applyLocalStorage(driver, origin, entries)) || siteOrigin(await driver.getUrl()) !== origin) {
      result.status = "FAIL";
      result.description = left;
      return result;
    }
    const cookies = await applyCookies(driver, fitting, currentUrl);

    result.description = `Loaded state from \`${fullPath}\`.`;
    result.outputs = { path: fullPath, cookies: cookies.length, localStorage: entries.length };
    log(config, "debug", `Loaded ${cookies.length} cookies and ${entries.length} localStorage entries from ${fullPath}`);
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't load state. ${error.message}`;
    log(config, "error", result.description);
  }
  return result;
}
