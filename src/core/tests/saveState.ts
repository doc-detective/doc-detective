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
    const origin = siteOrigin(await driver.getUrl());
    if (!origin) {
      result.status = "FAIL";
      result.description = "Couldn't save state: no site is open. Use `goTo` first.";
      return result;
    }

    const cookies = await readCookies(driver);
    // The storage script reports the page's own origin. If the page moved since
    // getUrl, the cookies and storage could be from two sites, so write nothing.
    const { origin: storageOrigin, entries: localStorage } = await readLocalStorage(driver);
    if (storageOrigin !== origin) {
      result.status = "FAIL";
      result.description = `Couldn't save state: the page left \`${origin}\` while its state was read.`;
      return result;
    }

    // The file holds live session tokens. Write it whole to an owner-only temp
    // file beside it, then publish that in one step: a rename replaces an old
    // file atomically, and a hard link fails with EEXIST rather than replace
    // one. A reader never sees partial JSON, a failed write never touches the
    // old file, and no broader permissions carry over.
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const temp = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temp, formatStateFile({ cookies, origin, localStorage }), { encoding: "utf8", mode: 0o600, flag: "wx" });
      if (overwrite === true) {
        fs.renameSync(temp, fullPath);
      } else {
        try {
          fs.linkSync(temp, fullPath);
        } catch (error: any) {
          if (error.code !== "EEXIST") throw error;
          result.status = "FAIL";
          result.description = `Couldn't save state: \`${fullPath}\` exists. Set \`overwrite\` to \`true\` to replace it.`;
          return result;
        }
      }
    } finally {
      fs.rmSync(temp, { force: true });
    }

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
