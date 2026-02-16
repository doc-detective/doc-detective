/* c8 ignore start -- Appium integration: requires Appium server and
   mobile device/emulator. Cannot be tested in headless CI. */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setAppiumHome };

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
/* c8 ignore stop */
