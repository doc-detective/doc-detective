import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getRuntimeDir } from "../runtime/cacheDir.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setAppiumHome };

function setAppiumHome(ctx: { cacheDir?: string } = {}) {
  // Prefer the lazy-installed copy in <cacheDir>/runtime/node_modules/appium.
  // The cache install is the canonical home post-shim; only fall back to the
  // legacy node_modules walk for installs where the user pre-installed
  // appium as a regular npm dep alongside doc-detective.
  const runtimeAppium = path.join(
    getRuntimeDir({ cacheDir: ctx.cacheDir }),
    "node_modules",
    "appium"
  );
  if (existsSync(runtimeAppium)) {
    process.env.APPIUM_HOME = path.join(
      getRuntimeDir({ cacheDir: ctx.cacheDir })
    );
    return;
  }
  const corePath = path.join(__dirname, "../../node_modules");
  const pathArray = corePath.split("node_modules");
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
