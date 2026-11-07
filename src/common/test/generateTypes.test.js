// generateTypes.cjs must refuse to run on a stale json-schema-to-typescript:
// v15 silently degrades object types next to oneOf/anyOf/allOf to
// `{ [k: string]: unknown }`, and the build would otherwise succeed.
import { expect } from "chai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { checkGeneratorVersion, renderStepActions } = require("../scripts/generateTypes.cjs");

describe("generateTypes renderStepActions", function () {
  const branch = (...required) => ({ allOf: [{ properties: {} }, { required }] });

  it("renders one action key per step_v3 branch, sorted", function () {
    const ts = renderStepActions({ oneOf: [branch("goTo"), { required: ["click"] }] });
    expect(ts).to.match(/\[\n {2}"click",\n {2}"goTo",\n\] as const;/);
  });

  it("refuses a branch without exactly one action key", function () {
    expect(() => renderStepActions({ oneOf: [branch("goTo"), branch()] })).to.throw(/exactly one action key/);
    expect(() => renderStepActions({ oneOf: [branch("goTo", "find")] })).to.throw(/goTo, find/);
  });
});

describe("generateTypes checkGeneratorVersion", function () {
  it("accepts an installed version in the declared major", function () {
    expect(() => checkGeneratorVersion("16.0.0", "^16.0.0")).to.not.throw();
    expect(() => checkGeneratorVersion("16.2.1", "^16.0.0")).to.not.throw();
    expect(() => checkGeneratorVersion("16.0.0", "16.0.0")).to.not.throw();
    expect(() => checkGeneratorVersion("15.0.4", "16.0.0")).to.throw(/npm ci/);
  });

  it("rejects an installed version from another major", function () {
    expect(() => checkGeneratorVersion("15.0.4", "^16.0.0")).to.throw(/15\.0\.4.*\^16\.0\.0.*npm ci/);
    expect(() => checkGeneratorVersion("17.0.0", "^16.0.0")).to.throw(/npm ci/);
    expect(() => checkGeneratorVersion("15.0.4", "~16.1.0")).to.throw(/npm ci/);
  });

  it("skips ranges it can't pin to one major instead of misreading them", function () {
    expect(() => checkGeneratorVersion("16.0.0", ">=15.0.0 <17")).to.not.throw();
    expect(() => checkGeneratorVersion("16.0.0", "latest")).to.not.throw();
  });
});
