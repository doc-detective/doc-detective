import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";
import { formatStateFile, readCookies, readLocalStorage, resolveStatePath, siteOrigin } from "./browserState.js";
import path from "node:path";
import fs from "node:fs";

export { saveState };

/**
 * Save the open site's cookies and `localStorage` to a Playwright
 * `storageState` JSON file.
 */
async function saveState({ config, step, driver }: { config: any; step: any; driver: any }) {
  const result: any = { status: "PASS", description: "Saved state.", outputs: {} };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  // The effective step (ADR 01167): always the object form, with `overwrite`.
  const { path: filePath, directory, overwrite } = isValidStep.object.saveState;
  const fullPath = resolveStatePath(config, { path: filePath, directory });

  try {
    if (fs.existsSync(fullPath) && overwrite !== true) {
      result.status = "FAIL";
      result.description = `Couldn't save state: \`${fullPath}\` exists. Set \`overwrite\` to \`true\` to replace it.`;
      return result;
    }
    const origin = siteOrigin(await driver.getUrl());
    if (!origin) {
      result.status = "FAIL";
      result.description = "Couldn't save state: no site is open. Use `goTo` first.";
      return result;
    }

    const cookies = await readCookies(driver);
    const localStorage = await readLocalStorage(driver);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, formatStateFile({ cookies, origin, localStorage }), "utf8");

    result.description = `Saved state to \`${fullPath}\`.`;
    result.outputs = { path: fullPath, cookies: cookies.length, localStorage: localStorage.length };
    log(config, "debug", `Saved ${cookies.length} cookies and ${localStorage.length} localStorage entries to ${fullPath}`);
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't save state. ${error.message}`;
    log(config, "error", result.description);
  }
  return result;
}
