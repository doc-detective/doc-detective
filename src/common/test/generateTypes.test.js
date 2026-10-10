// generateTypes.cjs must refuse to run on a stale json-schema-to-typescript:
// v15 silently degrades object types next to oneOf/anyOf/allOf to
// `{ [k: string]: unknown }`, and the build would otherwise succeed.
import { expect } from "chai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { checkGeneratorVersion } = require("../scripts/generateTypes.cjs");

describe("generateTypes checkGeneratorVersion", function () {
  it("accepts an installed version in the declared major", function () {
    expect(() => checkGeneratorVersion("16.0.0", "^16.0.0")).to.not.throw();
    expect(() => checkGeneratorVersion("16.2.1", "^16.0.0")).to.not.throw();
  });

  it("rejects an installed version from another major", function () {
    expect(() => checkGeneratorVersion("15.0.4", "^16.0.0")).to.throw(/15\.0\.4.*\^16\.0\.0.*npm ci/);
    expect(() => checkGeneratorVersion("17.0.0", "^16.0.0")).to.throw(/npm ci/);
  });
});
