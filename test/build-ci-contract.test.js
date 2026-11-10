import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// `build:ci` is `build` minus the type generator. The generated types are
// type-only (erased at compile), so skipping them leaves the compiled JS that
// tests and fixtures run unchanged. These checks keep the two scripts from
// drifting apart, and keep a REQUIRED job running the full build so a stale
// committed type still fails the gate.
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(process.cwd(), ...p), "utf8"));
const readYaml = (...p) => parseYaml(fs.readFileSync(path.join(process.cwd(), ...p), "utf8"));

describe("build:ci contract", function () {
  const root = readJson("package.json").scripts;
  const common = readJson("src", "common", "package.json").scripts;

  it("src/common build:ci is build without generate:types", function () {
    assert.match(common.build, /npm run generate:types && /);
    assert.equal(common["build:ci"], common.build.replace("npm run generate:types && ", ""));
  });

  it("root build:ci is build with the common step swapped for its build:ci", function () {
    assert.equal(
      root["build:ci"],
      root.build.replace("npm run build:common", "npm --prefix src/common run build:ci")
    );
  });

  it("the required ratchet jobs still run the full builds", function () {
    const jobs = readYaml(".github", "workflows", "test.yml").jobs;
    const runs = (job) => jobs[job].steps.map((s) => s.run || "").join("\n");
    assert.match(runs("coverage-ratchet"), /npm run build:common\b/);
    assert.match(runs("coverage-merge"), /npm run build$/m);
  });
});
