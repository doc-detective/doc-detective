import { appiumHomeForDriverPath, setAppiumHome } from "../dist/core/appium.js";
import { resolveHeavyDepPath } from "../dist/runtime/loader.js";
import path from "node:path";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

// Build paths with the platform separator so the assertions hold on the whole
// CI matrix (the helper splits on path.sep).
const j = (...parts) => parts.join(path.sep);

describe("appiumHomeForDriverPath", function () {
  it("returns the parent of the node_modules holding the driver", function () {
    // appium driver list looks in <APPIUM_HOME>/node_modules, so the home is
    // the directory that CONTAINS node_modules — one level above it. This is
    // the bug that skipped every browser context in a git worktree: the old
    // walk returned the node_modules directory itself.
    const driver = j("C", "repo", "node_modules", "appium-geckodriver", "build", "lib", "index.js");
    assert.equal(appiumHomeForDriverPath(driver), j("C", "repo"));
  });

  it("uses the innermost node_modules for nested (hoisted) installs", function () {
    const driver = j("root", "node_modules", "pkg", "node_modules", "appium-chromium-driver", "index.js");
    assert.equal(appiumHomeForDriverPath(driver), j("root", "node_modules", "pkg"));
  });

  it("returns null when the path has no node_modules segment", function () {
    assert.equal(appiumHomeForDriverPath(j("some", "where", "appium-geckodriver.js")), null);
  });
});

describe("setAppiumHome", function () {
  it("points APPIUM_HOME at a directory whose node_modules holds appium/drivers", function () {
    // Needs the drivers actually installed to exercise (and validate) the
    // resolution. The CI matrix runs `install all` first; skip on a lean env.
    const driverEntry =
      resolveHeavyDepPath("appium-chromium-driver") ||
      resolveHeavyDepPath("appium-geckodriver");
    if (!driverEntry) this.skip();

    const prev = process.env.APPIUM_HOME;
    try {
      delete process.env.APPIUM_HOME;
      setAppiumHome({});
      const home = process.env.APPIUM_HOME;
      assert.ok(home, "APPIUM_HOME should be set");
      // `appium driver list` reads <APPIUM_HOME>/node_modules, so that directory
      // must actually contain appium or a driver. This is the deterministic
      // catch for the worktree regression: the pre-fix value was
      // <...>/node_modules, whose node_modules/node_modules holds nothing, so
      // every driver read "not installed".
      const nm = path.join(home, "node_modules");
      const usable = ["appium", "appium-chromium-driver", "appium-geckodriver"].some(
        (dep) => existsSync(path.join(nm, dep))
      );
      assert.ok(
        usable,
        `expected ${nm} to contain appium or a driver, APPIUM_HOME=${home}`
      );
    } finally {
      if (prev === undefined) delete process.env.APPIUM_HOME;
      else process.env.APPIUM_HOME = prev;
    }
  });
});
