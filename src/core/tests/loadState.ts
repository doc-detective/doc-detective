import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";
import { applyLocalStorage, cookiesFor, parseStateFile, resolveStatePath, siteOrigin, toDriverCookie } from "./browserState.js";
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
    // even with no entries, so a page that navigated away gets nothing.
    const fail = () => {
      result.status = "FAIL";
      result.description = `Couldn't load state: the page left \`${origin}\` before its state was restored.`;
      return result;
    };
    if (!(await applyLocalStorage(driver, origin, entries))) return fail();

    // WebDriver sets a cookie on whatever page is open, and on localhost it has
    // no domain to pin it. So the origin is checked before each write and once
    // after the loop, and a mismatch deletes every cookie this step set.
    // ponytail: classic WebDriver can't set a cookie only on one host, so a
    // navigation between a check and its write still lands that cookie on the
    // new host until the check after the loop removes it. Upgrade path: BiDi
    // `storage.setCookie` with an explicit partition.
    const stillOnOrigin = async () => siteOrigin(await driver.getUrl()) === origin;
    const cookies: any[] = [];
    const rollBack = async () => {
      for (const cookie of cookies) await driver.deleteCookies(cookie.name);
      return fail();
    };
    for (const cookie of fitting) {
      if (!(await stillOnOrigin())) return rollBack();
      await driver.setCookies(toDriverCookie(cookie, currentUrl));
      cookies.push(cookie);
    }
    if (!(await stillOnOrigin())) return rollBack();

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
