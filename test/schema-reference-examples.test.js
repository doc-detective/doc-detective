// The schema reference generator's synthesized examples must validate. A
// reader copies the "full object" example; an empty array for a field with
// `minItems` fails validation at run time (found on `screenshot.mask`).

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { exampleValue, generateExampleFromSchema } = require("../docs/.scripts/buildSchemaReferencesV4.js");

describe("schema reference examples", function () {
  it("keeps an empty array when the schema allows one", function () {
    assert.deepEqual(exampleValue({ type: "array", items: { type: "string" } }), []);
  });

  it("fills an array up to its minItems", function () {
    assert.deepEqual(
      exampleValue({ type: "array", minItems: 1, items: { type: "string" } }),
      ["example"]
    );
  });

  it("omits an array with minItems whose item can't be synthesized", function () {
    assert.equal(exampleValue({ type: "array", minItems: 1 }), undefined);
  });

  it("uses a property's own first example over its default", function () {
    assert.equal(exampleValue({ type: "string", default: "b", examples: ["a", "c"] }), "a");
  });

  it("leaves out an optional object that would only be `{}`", function () {
    // response's `headers` (default `{}`) and `body` (free-form object) printed as `{}`,
    // which reads like a check but matches anything.
    const schema = {
      type: "object",
      properties: {
        headers: { type: "object", default: {} },
        body: { anyOf: [{ type: "object", additionalProperties: true }, { type: "string" }] },
        required: { type: "array", items: { type: "string" }, default: [] },
      },
    };
    assert.deepEqual(generateExampleFromSchema(schema), { required: [] });
  });

  it("keeps a required object even when it's `{}`", function () {
    const schema = { type: "object", required: ["env"], properties: { env: { type: "object" } } };
    assert.deepEqual(generateExampleFromSchema(schema), { env: {} });
  });

  it("leaves out a field that a `not: { required }` guard forbids with the ones before it", function () {
    // screenshot's `crop` and `fullPage: true` are exclusive.
    const schema = {
      allOf: [
        { type: "object", properties: { crop: { type: "string" }, fullPage: { type: "boolean" }, stable: { type: "boolean" } } },
        { not: { required: ["crop", "fullPage"], properties: { fullPage: { const: true } } } },
      ],
    };
    assert.deepEqual(generateExampleFromSchema(schema), { crop: "example", stable: true });
  });
});
