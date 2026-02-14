import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setAppiumHome };

/**
 * Locate the nearest parent directory that contains an installed Appium and set process.env.APPIUM_HOME to that directory.
 *
 * Searches candidate node_modules locations starting from this module's ../../node_modules; if a node_modules/appium directory is found its containing parent path is assigned to APPIUM_HOME, otherwise the initial computed parent path is used.
 */
function setAppiumHome() {
  const corePath = path.join(__dirname, "../../node_modules");
  const pathArray = corePath.split("node_modules");
  // Starting at the first node_modules directory, check if the appium is installed.
  // If it isn't, move to the next node_modules directory.
  let appiumParentPath = pathArray[0];
  for (let i = 1; i < pathArray.length; i++) {
    if (existsSync(path.join(appiumParentPath, "node_modules", "appium"))) {
      break;
    }
    appiumParentPath = path.join(
      appiumParentPath,
      "node_modules",
      pathArray[i]
    );
  }
  process.env.APPIUM_HOME = appiumParentPath;
}