// Common is the single source for step actions and published schemas.
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { schemas, stepActions } from "../dist/index.js";

const distSchemas = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "schemas");

describe("stepActions", function () {
  it("matches the action keys step_v3 requires, sorted", function () {
    // Each step_v3 oneOf branch requires one action key, on the branch or in an allOf part.
    const keys = schemas.step_v3.oneOf
      .flatMap((branch) => [branch, ...(branch.allOf ?? [])])
      .flatMap((part) => part.required ?? []);
    const derived = [...new Set(keys)].sort();
    expect(derived).to.include("goTo");
    expect(stepActions).to.deep.equal(derived);
  });

  it("matches step_v3's properties minus the common step keys", function () {
    // Independent of the oneOf walk: a step's properties are its actions plus the shared keys.
    const step = schemas.step_v3;
    expect(step).to.have.nested.property("components.schemas.common.properties");
    const actions = Object.keys(step.properties)
      .filter((k) => !(k in step.components.schemas.common.properties))
      .sort();
    expect(stepActions).to.deep.equal(actions);
  });
});

describe("published per-schema files", function () {
  for (const key of Object.keys(schemas).filter((k) => k.endsWith("_v3"))) {
    it(`dist/schemas/${key}.schema.json matches schemas.${key}`, function () {
      const file = path.join(distSchemas, `${key}.schema.json`);
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).to.deep.equal(schemas[key]);
    });
  }
});
