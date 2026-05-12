import { HEAVY_NPM_DEPS, getDeclaredVersion } from "../dist/runtime/heavyDeps.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("runtime/heavyDeps", function () {
  it("HEAVY_NPM_DEPS lists every dep that the runtime lazy-loads", function () {
    // This is the canonical list. If a new heavy dep is added, append it here
    // AND to package.json#optionalDependencies. Both must be kept in sync —
    // getDeclaredVersion() is the bridge between the two.
    expect(HEAVY_NPM_DEPS).to.include.members([
      "webdriverio",
      "appium",
      "appium-chromium-driver",
      "appium-geckodriver",
      "appium-safari-driver",
      "sharp",
      "@ffmpeg-installer/ffmpeg",
      "@puppeteer/browsers",
      "geckodriver",
      "pixelmatch",
      "pngjs",
    ]);
  });

  it("getDeclaredVersion returns the version from package.json#optionalDependencies", function () {
    const pkg = require("../package.json");
    for (const name of HEAVY_NPM_DEPS) {
      const declared = getDeclaredVersion(name);
      const fromPkg =
        (pkg.optionalDependencies && pkg.optionalDependencies[name]) ||
        (pkg.dependencies && pkg.dependencies[name]);
      // During the migration window, heavy deps may still live in
      // `dependencies` instead of `optionalDependencies`. Either field is
      // a valid source of truth — the assertion is that they match.
      expect(declared, `${name} declared version`).to.equal(fromPkg);
    }
  });

  it("getDeclaredVersion throws for an unknown package", function () {
    expect(() => getDeclaredVersion("definitely-not-a-real-package")).to.throw(
      /not declared/i
    );
  });

  it("getDeclaredVersion is case-sensitive", function () {
    expect(() => getDeclaredVersion("WebDriverIO")).to.throw(/not declared/i);
  });
});
