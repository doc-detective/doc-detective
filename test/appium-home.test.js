import { appiumHomeForDriverPath, setAppiumHome } from "../dist/core/appium.js";
import { getRuntimeDir } from "../dist/runtime/cacheDir.js";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
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
  it("always homes Appium at <cacheDir>/runtime, even before anything is installed there", function () {
    // One APPIUM_HOME for every server (ADR 01111): the runtime cache is where
    // Appium and its drivers are installed, so it's the home regardless of
    // what the shim's node_modules holds.
    const prevHome = process.env.APPIUM_HOME;
    const prevCache = process.env.DOC_DETECTIVE_CACHE_DIR;
    delete process.env.DOC_DETECTIVE_CACHE_DIR; // env wins over ctx.cacheDir
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "dd-appium-home-"));
    try {
      setAppiumHome({ cacheDir });
      assert.equal(process.env.APPIUM_HOME, getRuntimeDir({ cacheDir }));
    } finally {
      if (prevHome === undefined) delete process.env.APPIUM_HOME;
      else process.env.APPIUM_HOME = prevHome;
      if (prevCache === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = prevCache;
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
