import {
  HEAVY_NPM_DEPS,
  getDeclaredVersion,
  resolveDeclaredVersion,
  withPeerCompanions,
  RUNTIME_PEER_COMPANIONS,
} from "../dist/runtime/heavyDeps.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("runtime/heavyDeps", function () {
  it("HEAVY_NPM_DEPS lists every dep that the runtime lazy-loads", function () {
    // This is the canonical list. If a new heavy dep is added, append it here
    // AND to the source package.json#optionalDependencies (prepack.js moves
    // that field to ddRuntimeDependencies in the published manifest). Both must
    // be kept in sync — getDeclaredVersion() is the bridge between the two.
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

  it("getDeclaredVersion returns the version from the source package.json", function () {
    const pkg = require("../package.json");
    for (const name of HEAVY_NPM_DEPS) {
      const declared = getDeclaredVersion(name);
      // Source manifest holds the heavy deps in optionalDependencies (prepack
      // moves them to ddRuntimeDependencies for the published package); legacy
      // checkouts may still have them in dependencies. Any is a valid source.
      const fromPkg =
        (pkg.ddRuntimeDependencies && pkg.ddRuntimeDependencies[name]) ||
        (pkg.optionalDependencies && pkg.optionalDependencies[name]) ||
        (pkg.dependencies && pkg.dependencies[name]);
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

  describe("withPeerCompanions", function () {
    it("adds @puppeteer/browsers' proxy-agent companion (an optional peer npm skips)", function () {
      const out = withPeerCompanions(["@puppeteer/browsers"]);
      expect(out).to.include("@puppeteer/browsers");
      expect(out).to.include("proxy-agent");
    });

    it("leaves packages without companions untouched", function () {
      expect(withPeerCompanions(["sharp"])).to.deep.equal(["sharp"]);
    });

    it("does not duplicate a companion already present", function () {
      const out = withPeerCompanions(["@puppeteer/browsers", "proxy-agent"]);
      expect(out.filter((n) => n === "proxy-agent")).to.have.lengthOf(1);
    });

    it("declares a resolvable version for every companion", function () {
      // The loader installs `${companion}@${getDeclaredVersion(companion)}`,
      // so each companion must be declared in package.json.
      for (const companions of Object.values(RUNTIME_PEER_COMPANIONS)) {
        for (const c of companions) {
          expect(getDeclaredVersion(c), `${c} declared version`).to.be.a("string");
        }
      }
    });
  });

  describe("resolveDeclaredVersion field priority", function () {
    it("reads ddRuntimeDependencies first (the published-manifest state)", function () {
      // Mirrors the published package: prepack.js has moved the heavy deps out
      // of optionalDependencies into ddRuntimeDependencies, which npm ignores.
      const published = { ddRuntimeDependencies: { sharp: "^0.34.5" } };
      expect(resolveDeclaredVersion(published, "sharp")).to.equal("^0.34.5");
    });

    it("falls back to optionalDependencies (the source/CI state)", function () {
      const source = { optionalDependencies: { sharp: "^0.34.5" } };
      expect(resolveDeclaredVersion(source, "sharp")).to.equal("^0.34.5");
    });

    it("falls back to dependencies (the legacy state)", function () {
      const legacy = { dependencies: { sharp: "^0.34.5" } };
      expect(resolveDeclaredVersion(legacy, "sharp")).to.equal("^0.34.5");
    });

    it("prefers ddRuntimeDependencies over the other fields", function () {
      const both = {
        ddRuntimeDependencies: { sharp: "^0.34.5" },
        optionalDependencies: { sharp: "^0.30.0" },
        dependencies: { sharp: "^0.20.0" },
      };
      expect(resolveDeclaredVersion(both, "sharp")).to.equal("^0.34.5");
    });

    it("throws when no field declares the package", function () {
      expect(() => resolveDeclaredVersion({}, "sharp")).to.throw(/not declared/i);
    });
  });
});
