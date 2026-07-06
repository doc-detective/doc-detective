import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getRuntimeDir } from "../runtime/cacheDir.js";
import { resolveHeavyDepPath } from "../runtime/loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { setAppiumHome, appiumHomeForDriverPath, runtimeHomeHasBrowserDriver };

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

// The browser drivers `appium driver list` must report as `installed (npm)`
// for Chrome/Firefox/Safari detection (getAvailableApps) to mark the browser
// available. A home missing all of these can't drive a browser, so it must
// not be chosen as APPIUM_HOME for the browser paths. Safari is included
// because its availability check (config.ts) also gates on
// `npmInstalled("appium-safari-driver")` via `appium driver list`.
const BROWSER_DRIVER_PACKAGES = [
  "appium-chromium-driver",
  "appium-geckodriver",
  "appium-safari-driver",
];

// True when <runtimeDir>/node_modules contains appium AND at least one browser
// driver — i.e. the runtime cache is a COMPLETE browser home. `appium driver
// list` scans <APPIUM_HOME>/node_modules, so a runtime that holds appium but no
// browser driver (e.g. appium pulled in only as a peer of a lazily-installed
// native driver like appium-xcuitest-driver) reports every browser driver
// "not installed" and browser detection comes up empty. Requiring a browser
// driver's presence lets setAppiumHome fall through to the shim home (which
// carries the full driver set) in that case.
function runtimeHomeHasBrowserDriver(runtimeDir: string): boolean {
  const nm = path.join(runtimeDir, "node_modules");
  if (!existsSync(path.join(nm, "appium"))) return false;
  return BROWSER_DRIVER_PACKAGES.some((driver) =>
    existsSync(path.join(nm, driver))
  );
}

function setAppiumHome(ctx: { cacheDir?: string } = {}) {
  // 1. Prefer the lazy-installed copy in <cacheDir>/runtime — but only when it
  // is a COMPLETE browser home (appium + a browser driver). A runtime that has
  // appium without any browser driver (e.g. appium arrived only as a peer of a
  // lazily-installed native driver such as appium-xcuitest-driver) would make
  // `appium driver list` report chromium/gecko "not installed" and browser
  // detection come up empty — the pre-fix bug that failed the browser unit
  // tests on Linux/macOS after `install all` seeded such a partial runtime.
  // When the runtime is incomplete, fall through to step 2, which homes at the
  // shim's node_modules that carries every driver.
  const runtimeDir = getRuntimeDir({ cacheDir: ctx.cacheDir });
  if (runtimeHomeHasBrowserDriver(runtimeDir)) {
    process.env.APPIUM_HOME = runtimeDir;
    return;
  }

  // 2. Otherwise anchor APPIUM_HOME to the directory whose node_modules holds
  // the appium drivers, resolved the same way the runner loads them. appium
  // looks for drivers in <APPIUM_HOME>/node_modules, so the home is the parent
  // of the node_modules that contains the driver package. This is robust to
  // git worktrees and hoisted layouts where the legacy __dirname walk below
  // landed on the node_modules directory itself (one level too deep) whenever
  // appium resolved to a different node_modules than its drivers — making
  // `appium driver list` report every driver as not-installed and browser
  // detection come up empty.
  // Try each driver in turn: resolveHeavyDepPath can return a shim path with no
  // node_modules segment (appiumHomeForDriverPath then yields null), so a bad
  // first candidate must not stop us from deriving the home from the next. The
  // candidate list is BROWSER_DRIVER_PACKAGES so it stays in sync with the
  // completeness gate above (Safari included).
  for (const driverName of BROWSER_DRIVER_PACKAGES) {
    const driverEntry = resolveHeavyDepPath(driverName, {
      cacheDir: ctx.cacheDir,
    });
    const home = driverEntry ? appiumHomeForDriverPath(driverEntry) : null;
    if (home) {
      process.env.APPIUM_HOME = home;
      return;
    }
  }

  /* c8 ignore start - legacy fallback (step 3), reached only when NONE of the
   * BROWSER_DRIVER_PACKAGES (appium-chromium-driver first) resolves via
   * resolveHeavyDepPath in step 2 above. chromium/gecko are installed
   * dependencies of this repo that shim-resolve first on every measured CI leg
   * -- the cross-platform coverage union shows step 2's return (lines 49-57)
   * covered and never reaches here -- so step 2 always returns before this
   * fallback runs. It exists for driver-less installs and can't be exercised
   * hermetically without uninstalling a real dependency the runner and the
   * rest of the suite depend on (ADR 01017). */
  // 3. Legacy fallback: walk up from core's node_modules looking for appium.
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
/* c8 ignore stop */
