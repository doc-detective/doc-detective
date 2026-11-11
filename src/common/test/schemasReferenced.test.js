// The validator compiles schemasReferenced.json ($refs intact) instead of the
// dereferenced schemas.json, for compile speed. This proves the two forms
// validate identically: same validity, same errors, same defaults applied.
// Corpus: every schema's examples, plus the repo's spec fixtures, each run
// against every schema so invalid inputs (and their errors) are covered too.
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createAjv } from "../dist/ajv.js";
import { schemas } from "../dist/index.js";
import { schemasReferenced } from "../dist/schemas/referenced.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OWN_EXAMPLES_ONLY = new Set(["report_v3", "resolvedTests_v3"]);

function specFixtures(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith(".spec.json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

// uuid dynamic defaults differ run to run; compare them as a placeholder.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const normalize = (value) => JSON.parse(JSON.stringify(value).replace(UUID, "<uuid>"));

function run(check, object) {
  const data = JSON.parse(JSON.stringify(object));
  const valid = check(data);
  const errors = (check.errors || []).map(({ instancePath, keyword, params, message }) =>
    ({ instancePath, keyword, params, message }));
  return normalize({ valid, errors, data });
}

describe("schemasReferenced", function () {
  this.timeout(600000);

  it("has the same schema keys as schemas.json", function () {
    expect(Object.keys(schemasReferenced.schemas).sort()).to.deep.equal(Object.keys(schemas).sort());
  });

  // Both instances validate.ts builds: the mutating validator and the
  // non-mutating probe it uses to pick a compatible older schema.
  for (const mutating of [true, false]) {
    it(`validates every example and spec fixture identically to the dereferenced schemas (mutating: ${mutating})`, function () {
      const corpus = [
        ...Object.values(schemas).flatMap((schema) => schema.examples || []),
        ...specFixtures(path.join(here, "..", "..", "..", "test", "core-artifacts")),
      ];
      const dereferenced = createAjv({ mutating });
      const referenced = createAjv({ mutating });
      for (const [key, schema] of Object.entries(schemasReferenced.schemas)) referenced.addSchema(schema, key);
      referenced.addSchema(schemasReferenced.noDefaults);

      let compared = 0;
      for (const key of Object.keys(schemas)) {
        const expectedCheck = dereferenced.compile(schemas[key]);
        const actualCheck = referenced.getSchema(key);
        // Dereferenced report/resolvedTests take minutes to reject foreign
        // objects (allErrors across huge inlined anyOfs), so they get only their
        // own examples. Every other schema gets the full cross-product.
        const objects = OWN_EXAMPLES_ONLY.has(key) ? schemas[key].examples : corpus;
        objects.forEach((object, i) => {
          expect(run(actualCheck, object), `${key} vs corpus[${i}]`).to.deep.equal(
            run(expectedCheck, object),
          );
          compared++;
        });
      }
      expect(compared).to.be.greaterThan(1000);
    });
  }
});
