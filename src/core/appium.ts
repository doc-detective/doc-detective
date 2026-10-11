import path from "node:path";
import { getRuntimeDir } from "../runtime/cacheDir.js";

export { setAppiumHome, appiumHomeForDriverPath };

// Given a resolved driver module path like
// `<X>/node_modules/appium-geckodriver/build/lib/index.js`, return `<X>` — the
// directory whose `node_modules` holds the driver. `appium driver list` looks
// in `<APPIUM_HOME>/node_modules`, so this is the home that makes the driver
// resolvable. Returns null if the path has no `node_modules` segment.
function appiumHomeForDriverPath(driverEntry: string): string | null {
  const marker = `${path.sep}node_modules${path.sep}`;
  const idx = driverEntry.lastIndexOf(marker);
  return idx === -1 ? null : driverEntry.slice(0, idx);
}

// Every Appium server — browser and app surface alike — is homed at
// <cacheDir>/runtime, where Appium and its drivers are installed (the loader
// never resolves them from the shim). One home means one extension manifest
// and one copy of each driver (ADR 01111).
function setAppiumHome(ctx: { cacheDir?: string } = {}) {
  process.env.APPIUM_HOME = getRuntimeDir({ cacheDir: ctx.cacheDir });
}
