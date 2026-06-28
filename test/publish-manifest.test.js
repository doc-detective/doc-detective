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

  it("merges optionalDependencies onto a pre-existing ddRuntimeDependencies", function () {
    // The PTY backend is declared directly under ddRuntimeDependencies (out of
    // the lockfile); the moved optionalDependencies must merge on top, not clobber it.
    const out = transformForPublish({
      ddRuntimeDependencies: { "@homebridge/node-pty-prebuilt-multiarch": "^0.13.1" },
      optionalDependencies: { sharp: "^0.34.5" },
    });
    expect(out).to.not.have.property("optionalDependencies");
    expect(out.ddRuntimeDependencies).to.deep.equal({
      "@homebridge/node-pty-prebuilt-multiarch": "^0.13.1",
      sharp: "^0.34.5",
    });
  });

  it("preserves a ddRuntimeDependencies-only manifest", function () {
    const out = transformForPublish({
      ddRuntimeDependencies: { "@homebridge/node-pty-prebuilt-multiarch": "^0.13.1" },
    });
    expect(out).to.not.have.property("optionalDependencies");
    expect(out.ddRuntimeDependencies).to.deep.equal({ "@homebridge/node-pty-prebuilt-multiarch": "^0.13.1" });
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

  it("moves the real source manifest's optionalDependencies into ddRuntimeDependencies (merged with any direct entries)", function () {
    // Run the transform against the actual package.json (source of truth, not a
    // generated dist artifact). The published manifest's ddRuntimeDependencies is
    // the source optionalDependencies merged on top of any deps already declared
    // directly under ddRuntimeDependencies (e.g. the PTY backend, kept out of the
    // lockfile) — and nothing npm would auto-install survives in
    // optionalDependencies.
    const pkg = require("../package.json");
    const published = transformForPublish(pkg);
    expect(published).to.not.have.property("optionalDependencies");
    expect(published.ddRuntimeDependencies).to.deep.equal({
      ...pkg.ddRuntimeDependencies,
      ...pkg.optionalDependencies,
    });
  });
});
