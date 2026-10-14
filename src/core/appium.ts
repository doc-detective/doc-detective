import fs from "node:fs";
import path from "node:path";
import { getRuntimeDir } from "../runtime/cacheDir.js";

export {
  setAppiumHome,
  appiumHomeForDriverPath,
  useDriversArgs,
  browserPoolDriverPackages,
};

// Appium CLI args that load only `packages` instead of every driver in the
// home (ADR 01117). The shared runtime home also holds the heavy mobile
// drivers, and requiring them all doubled a browser server's startup (~2.5s
// vs ~1.3s). Each package is named by its `appium.driverName` — the key
// Appium's manifest scan registers it under — and only when it's installed
// in `<appiumHome>/node_modules`, because Appium refuses to start on an
// unknown name. An existing manifest is trusted without a rescan, so when one
// exists the package must also be listed there. Nothing qualifies → no args,
// keeping the load-all default.
function useDriversArgs(appiumHome: string, packages: string[]): string[] {
  let manifest: string | undefined;
  try {
    manifest = fs.readFileSync(
      path.join(appiumHome, "node_modules", ".cache", "appium", "extensions.yaml"),
      "utf8"
    );
  } catch {
    // No manifest: Appium scans node_modules on start, so on disk is enough.
  }
  const names = packages.flatMap((pkg) => {
    if (manifest !== undefined && !manifest.includes(pkg)) return [];
    try {
      const pkgJson = JSON.parse(
        fs.readFileSync(
          path.join(appiumHome, "node_modules", pkg, "package.json"),
          "utf8"
        )
      );
      const name = pkgJson?.appium?.driverName;
      return typeof name === "string" && name ? [name] : [];
    } catch {
      return [];
    }
  });
  return names.length ? [`--use-drivers=${names.join(",")}`] : [];
}

// Drivers a desktop browser-pool server can host. Safari's driver only runs
// on macOS (its package declares platformNames Mac/iOS).
function browserPoolDriverPackages(platform: string): string[] {
  return [
    "appium-chromium-driver",
    "appium-geckodriver",
    ...(platform === "darwin" ? ["appium-safari-driver"] : []),
  ];
}

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
