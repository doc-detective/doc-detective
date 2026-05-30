import { transformForPublish } from "../scripts/prepack.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("scripts/prepack transformForPublish", function () {
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

  it("does not mutate the input object", function () {
    const input = { workspaces: ["src/common"], optionalDependencies: { sharp: "1" } };
    transformForPublish(input);
    expect(input.workspaces).to.deep.equal(["src/common"]);
    expect(input.optionalDependencies).to.deep.equal({ sharp: "1" });
  });

  it("produces a published manifest whose ddRuntimeDependencies covers every heavy dep", function () {
    // Guards the real source manifest: after the transform, every heavy dep the
    // runtime lazy-loads must still have a resolvable version constraint.
    const { HEAVY_NPM_DEPS } = require("../dist/runtime/heavyDeps.js");
    const published = transformForPublish(require("../package.json"));
    expect(published).to.not.have.property("optionalDependencies");
    for (const name of HEAVY_NPM_DEPS) {
      expect(
        published.ddRuntimeDependencies && published.ddRuntimeDependencies[name],
        `${name} in published ddRuntimeDependencies`
      ).to.be.a("string").and.to.have.length.greaterThan(0);
    }
  });
});
