import { validate, schemas } from "../dist/index.js";
import assert from "assert";

// Ratchet (ADR 01161): Ajv runs with coerceTypes and tries anyOf/oneOf branches
// in order, so a branch with a `type` coerces a value meant for a later branch
// before that branch sees it. Keys are the coercing type; values are the later
// types it would steal (`false` → "false", `true` → 1, `1` → true, "true" → true).
const STEALS = {
  string: ["boolean", "number", "integer"],
  number: ["boolean"],
  integer: ["boolean"],
  boolean: ["number", "integer", "string"],
};
// A string branch steals only free-form text: one with a `pattern`, `enum`, or
// `const` never wanted "true" or "false" (record_v3, screenshot_v3).
function freeString(schema) {
  if (!schema || typeof schema !== "object") return false;
  if ([].concat(schema.type ?? []).includes("string") &&
      !schema.pattern && !schema.enum && !("const" in schema)) return true;
  return ["anyOf", "oneOf"].some((k) => (schema[k] ?? []).some(freeString));
}
// Types a branch names in `type` (Ajv coerces only through `type`), plus, with
// `withValues`, the types of its enum/const values. Nested unions count too.
function branchTypes(schema, withValues) {
  const out = new Set();
  if (!schema || typeof schema !== "object") return out;
  if (schema.type) [].concat(schema.type).forEach((t) => out.add(t));
  else if (withValues)
    [].concat(schema.enum ?? [], "const" in schema ? [schema.const] : [])
      .forEach((v) => out.add(typeof v));
  for (const key of ["anyOf", "oneOf"])
    for (const b of schema[key] ?? []) branchTypes(b, withValues).forEach((t) => out.add(t));
  if (out.has("number")) out.add("integer");
  return out;
}
function coercionHazards(schema, path, found = [], seen = new Set()) {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return found;
  seen.add(schema);
  for (const key of ["anyOf", "oneOf"]) {
    const branches = Array.isArray(schema[key]) ? schema[key] : [];
    branches.forEach((branch, i) => {
      const accepts = branchTypes(branch, true);
      for (const S of branchTypes(branch, false))
        for (const T of STEALS[S] ?? [])
          branches.slice(i + 1).forEach((later, j) => {
            const takes = T === "string" ? freeString(later) : branchTypes(later, true).has(T);
            if (!accepts.has(T) && takes)
              found.push(`${path}.${key}: [${i}] coerces ${T} meant for [${i + 1 + j}]`);
          });
    });
  }
  for (const [k, v] of Object.entries(schema)) coercionHazards(v, `${path}.${k}`, found, seen);
  return found;
}

describe("anyOf/oneOf branch order under coerceTypes", function () {
  it("no branch coerces a scalar meant for a later branch", function () {
    const hazards = Object.entries(schemas).flatMap(([key, s]) => coercionHazards(s, key));
    assert.deepEqual(
      [...new Set(hazards)].slice(0, 20),
      [],
      "Use a `type` array or a boolean-first order; see src/common/AGENTS.md."
    );
  });
});

// Loop through JSON schemas
for (const [key, value] of Object.entries(schemas)) {
  describe(`${key} schema`, function () {
    it("should have one or more examples", function () {
      // Schema needs one or more examples
      assert(value.examples);
      assert(value.examples.length >= 1);
    });

    // Loop through and validate schema examples
    value.examples.forEach((example, index) => {
      it(`example with index ${index} passes validation`, function () {
        try {
          const validityCheck = validate({schemaKey: key, object: example});
          assert.ok(
            validityCheck.valid,
            `Validation failed for ${key}, example ${index}: ${validityCheck.errors}`
          );
        } catch (error) {
          assert.fail(
            `Unexpected error during validation of ${key}, example ${index}: ${error.message}`
          );
        }
      });
    });
  });
}
