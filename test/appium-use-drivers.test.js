import { useDriversArgs, browserPoolDriverPackages } from "../dist/core/appium.js";
import { prefetchMobileChromedriver } from "../dist/core/tests.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import assert from "node:assert/strict";

// Fake an APPIUM_HOME whose node_modules holds the given driver packages, each
// with the `appium.driverName` Appium registers it under.
function makeHome(drivers) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-use-drivers-"));
  for (const [pkg, driverName] of Object.entries(drivers)) {
    const dir = path.join(home, "node_modules", pkg);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: pkg, appium: { driverName } })
    );
  }
  return home;
}

describe("useDriversArgs", function () {
  let home;
  afterEach(function () {
    if (home) fs.rmSync(home, { recursive: true, force: true });
    home = undefined;
  });

  it("names only the requested drivers, by their registered driverName", function () {
    // The runtime home also holds heavy mobile drivers; loading them on every
    // server start is what made a browser run's Appium take ~2.5s (ADR 01117).
    home = makeHome({
      "appium-chromium-driver": "chromium",
      "appium-geckodriver": "gecko",
      "appium-xcuitest-driver": "xcuitest",
      "appium-uiautomator2-driver": "uiautomator2",
    });
    assert.deepEqual(
      useDriversArgs(home, ["appium-chromium-driver", "appium-geckodriver"]),
      ["--use-drivers=chromium,gecko"]
    );
  });

  it("skips requested packages that aren't installed (Appium rejects unknown names)", function () {
    home = makeHome({ "appium-geckodriver": "gecko" });
    assert.deepEqual(
      useDriversArgs(home, ["appium-chromium-driver", "appium-geckodriver"]),
      ["--use-drivers=gecko"]
    );
  });

  it("skips packages without an appium.driverName", function () {
    home = makeHome({ "appium-geckodriver": "gecko" });
    const dir = path.join(home, "node_modules", "not-a-driver");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), "{ not json");
    assert.deepEqual(
      useDriversArgs(home, ["not-a-driver", "appium-geckodriver"]),
      ["--use-drivers=gecko"]
    );
  });

  it("skips installed drivers a stale manifest doesn't list (Appium trusts the manifest and would refuse to start)", function () {
    home = makeHome({
      "appium-chromium-driver": "chromium",
      "appium-geckodriver": "gecko",
    });
    const manifestDir = path.join(home, "node_modules", ".cache", "appium");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, "extensions.yaml"),
      "drivers:\n  gecko:\n    pkgName: appium-geckodriver\n"
    );
    assert.deepEqual(
      useDriversArgs(home, ["appium-chromium-driver", "appium-geckodriver"]),
      ["--use-drivers=gecko"]
    );
  });

  it("requires the manifest's driver entry to name the exact package, not a substring match", function () {
    home = makeHome({ "appium-geckodriver": "gecko" });
    const manifestDir = path.join(home, "node_modules", ".cache", "appium");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, "extensions.yaml"),
      "drivers:\n  gecko:\n    pkgName: appium-geckodriver-fork\n"
    );
    assert.deepEqual(useDriversArgs(home, ["appium-geckodriver"]), []);
  });

  it("passes no flag when the manifest can't be parsed", function () {
    home = makeHome({ "appium-geckodriver": "gecko" });
    const manifestDir = path.join(home, "node_modules", ".cache", "appium");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, "extensions.yaml"),
      "drivers: [unclosed\n  appium-geckodriver"
    );
    assert.deepEqual(useDriversArgs(home, ["appium-geckodriver"]), []);
  });

  it("returns no args when none are installed, so Appium keeps its load-everything default", function () {
    home = makeHome({});
    assert.deepEqual(useDriversArgs(home, ["appium-chromium-driver"]), []);
  });
});

describe("mobile servers load only their driver", function () {
  let home;
  afterEach(function () {
    if (home) fs.rmSync(home, { recursive: true, force: true });
    home = undefined;
  });

  it("the android chromedriver-prefetch server loads only uiautomator2", async function () {
    home = makeHome({
      "appium-uiautomator2-driver": "uiautomator2",
      "appium-xcuitest-driver": "xcuitest",
      "appium-geckodriver": "gecko",
    });
    let extraArgs;
    await prefetchMobileChromedriver({
      config: {},
      desc: {},
      deviceRegistry: new Map(),
      getAndroidEnv: async () => ({ sdkRoot: "/sdk", deviceDeps: {} }),
      deps: {
        appSurfacePreflight: async () => ({
          ok: true,
          appiumEntry: "/entry.js",
          appiumHome: home,
        }),
        acquireDevice: async () => ({ entry: { name: "pixel", udid: "emulator-5554" } }),
        startAppiumServer: async (entry, config, display, env, args) => {
          extraArgs = args;
          return { port: 4725, process: { pid: 4242 } };
        },
        driverStart: async () => ({ deleteSession: async () => {} }),
        killTree: async () => {},
      },
    });
    assert.deepEqual(extraArgs, [
      "--allow-insecure",
      "uiautomator2:chromedriver_autodownload",
      "--use-drivers=uiautomator2",
    ]);
  });
});

describe("browserPoolDriverPackages", function () {
  it("includes the Safari driver only on macOS", function () {
    assert.deepEqual(browserPoolDriverPackages("darwin"), [
      "appium-chromium-driver",
      "appium-geckodriver",
      "appium-safari-driver",
    ]);
    for (const platform of ["win32", "linux"]) {
      assert.deepEqual(browserPoolDriverPackages(platform), [
        "appium-chromium-driver",
        "appium-geckodriver",
      ]);
    }
  });
});
