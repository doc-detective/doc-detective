import { transformForPublish } from "../scripts/publish-manifest.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("scripts/publish-manifest transformForPublish", function () {
  it("drops the workspaces field", function () {
    const out = transformForPublish({ workspaces: ["src/common"], name: "x" });
    expect(out).to.not.have.property("workspaces");
    expect(out.name).to.equal("x");
  });

  it("moves optionalDependencies into ddRuntimeDependencies", function () {
    const out = transformForPublish({
      optionalDependencies: { sharp: "^0.34.5", webdriverio: "^9.27.0" },
    });
    // npm never auto-installs a custom field, so a default `npm i` no longer
    // drags in the heavy deps (and their deprecated transitive tree).
    expect(out).to.not.have.property("optionalDependencies");
    expect(out.ddRuntimeDependencies).to.deep.equal({
      sharp: "^0.34.5",
      webdriverio: "^9.27.0",
    });
  });

  it("leaves the manifest alone when there are no optionalDependencies", function () {
    const out = transformForPublish({ dependencies: { yargs: "^18.0.0" } });
    expect(out).to.not.have.property("ddRuntimeDependencies");
    expect(out.dependencies).to.deep.equal({ yargs: "^18.0.0" });
  });

  it("drops an empty optionalDependencies object without creating ddRuntimeDependencies", function () {
    // An empty `{}` must not survive into the published manifest — otherwise the
    // publish guardrail could see a stray empty object and misread it.
    const out = transformForPublish({ optionalDependencies: {} });
    expect(out).to.not.have.property("optionalDependencies");
    expect(out).to.not.have.property("ddRuntimeDependencies");
  });

  it("does not mutate the input object", function () {
    const input = { workspaces: ["src/common"], optionalDependencies: { sharp: "1" } };
    transformForPublish(input);
    expect(input.workspaces).to.deep.equal(["src/common"]);
    expect(input.optionalDependencies).to.deep.equal({ sharp: "1" });
  });

  it("moves the real source manifest's optionalDependencies wholesale into ddRuntimeDependencies", function () {
    // Run the transform against the actual package.json (source of truth, not a
    // generated dist artifact) so the published manifest's ddRuntimeDependencies
    // is exactly the source optionalDependencies — and nothing npm would
    // auto-install survives in optionalDependencies.
    const pkg = require("../package.json");
    const published = transformForPublish(pkg);
    expect(published).to.not.have.property("optionalDependencies");
    expect(published.ddRuntimeDependencies).to.deep.equal(pkg.optionalDependencies);
  });

  it("preserves all other manifest fields when transforming", function () {
    const input = {
      name: "doc-detective",
      version: "4.6.0",
      engines: { node: ">=22.12.0" },
      dependencies: { yargs: "^18.0.0" },
      workspaces: ["src/common"],
      optionalDependencies: { sharp: "^0.34.5" },
    };
    const out = transformForPublish(input);
    expect(out.name).to.equal("doc-detective");
    expect(out.version).to.equal("4.6.0");
    expect(out.engines).to.deep.equal({ node: ">=22.12.0" });
    expect(out.dependencies).to.deep.equal({ yargs: "^18.0.0" });
    // workspaces and optionalDependencies are stripped
    expect(out).to.not.have.property("workspaces");
    expect(out).to.not.have.property("optionalDependencies");
    // heavy deps moved to ddRuntimeDependencies
    expect(out.ddRuntimeDependencies).to.deep.equal({ sharp: "^0.34.5" });
  });

  it("real source manifest's optionalDependencies includes the new proxy-agent and @puppeteer/browsers v3 entries", function () {
    // These packages were added to optionalDependencies in this PR: proxy-agent and
    // @puppeteer/browsers (bumped from ^2 to ^3). Verify they survive the round-trip
    // into ddRuntimeDependencies so the lazy installer can resolve them.
    const pkg = require("../package.json");
    expect(pkg.optionalDependencies).to.have.property("proxy-agent");
    expect(pkg.optionalDependencies).to.have.property("@puppeteer/browsers");
    // @puppeteer/browsers must be v3 or higher (node 24 support requirement).
    expect(pkg.optionalDependencies["@puppeteer/browsers"]).to.match(/^\^3\./);
    const published = transformForPublish(pkg);
    expect(published.ddRuntimeDependencies).to.have.property("proxy-agent");
    expect(published.ddRuntimeDependencies).to.have.property("@puppeteer/browsers");
  });

  it("published manifest does not declare any of the heavy packages in dependencies", function () {
    // Heavy runtime deps (webdriverio, appium, sharp, geckodriver, ffmpeg) must NOT
    // be in `dependencies` — otherwise `npm i doc-detective` would still pull them in.
    // The publish transform only removes them from optionalDependencies; this test
    // catches a future accidental regression where someone moves them back.
    const pkg = require("../package.json");
    const heavyPackages = [
      "webdriverio",
      "appium",
      "sharp",
      "geckodriver",
      "@ffmpeg-installer/ffmpeg",
      "@puppeteer/browsers",
    ];
    const published = transformForPublish(pkg);
    for (const heavy of heavyPackages) {
      expect(
        (published.dependencies || {})[heavy],
        `${heavy} must not appear in published dependencies`
      ).to.be.undefined;
    }
  });

  it("is idempotent — running the transform twice produces the same result as once", function () {
    const input = {
      name: "doc-detective",
      workspaces: ["src/common"],
      optionalDependencies: { sharp: "^0.34.5" },
    };
    const once = transformForPublish(input);
    // Run a second time on the already-transformed output (no optionalDeps, has ddRuntimeDeps).
    const twice = transformForPublish(once);
    // Second run: no optionalDependencies field, no ddRuntimeDependencies added (none present)
    expect(twice).to.not.have.property("optionalDependencies");
    expect(twice).to.not.have.property("workspaces");
    // ddRuntimeDependencies from the first transform should survive unchanged since
    // it is not in optionalDependencies — transformForPublish only moves optionalDependencies.
    expect(twice.ddRuntimeDependencies).to.deep.equal({ sharp: "^0.34.5" });
  });
});
