import { expect } from "chai";
import {
  compressSchema,
  expandSchema,
  DEDUPE_CONTAINER,
} from "../src/schemas/dedupe.cjs";

// A representative dereferenced-schema shape: the same element-criteria
// block repeated at several sites, nested repetition inside a larger
// repeated block, small repeated leaves below the hoist threshold, and an
// authored `definitions` key that must survive untouched.
const criteria = {
  type: "object",
  description:
    "A repeated element-criteria block, large enough to clear the hoist threshold by a comfortable margin.",
  properties: {
    selector: { type: "string", description: "Selector of the element." },
    elementText: { type: "string", description: "Display text of the element." },
  },
};

const wrapper = {
  title: "wrapper",
  description:
    "A larger repeated block that CONTAINS the repeated criteria block, to prove nested hoisting keeps definitions themselves deduplicated.",
  anyOf: [criteria, { type: "string" }],
};

function sampleSchema() {
  // Deep-clone so each test starts from fresh, identical structures.
  return JSON.parse(
    JSON.stringify({
      title: "sample",
      properties: {
        a: criteria,
        b: criteria,
        c: wrapper,
        d: wrapper,
        small: { type: "string" },
        small2: { type: "string" },
      },
      definitions: {
        authored: { type: "number", description: "An authored definitions entry that must pass through." },
      },
    })
  );
}

describe("schema dedupe", function () {
  describe("round-trip", function () {
    it("expand(compress(schema)) deep-equals the original", function () {
      const original = sampleSchema();
      const compressed = compressSchema(original);
      const expanded = expandSchema(compressed);
      expect(expanded).to.deep.equal(sampleSchema());
    });

    it("survives a JSON serialization round-trip of the compressed form", function () {
      const compressed = JSON.parse(JSON.stringify(compressSchema(sampleSchema())));
      expect(expandSchema(compressed)).to.deep.equal(sampleSchema());
    });

    it("compresses repeated subtrees into shared definitions", function () {
      const compressed = compressSchema(sampleSchema());
      const defs = compressed[DEDUPE_CONTAINER];
      expect(defs).to.be.an("object");
      // The criteria block and the wrapper block each hoist exactly once.
      expect(Object.keys(defs).length).to.be.at.least(2);
      const json = JSON.stringify(compressed);
      // The distinctive criteria description appears exactly once (in its
      // definition), not four times (two direct + two inside wrappers).
      const needle = "large enough to clear the hoist threshold";
      expect(json.split(needle).length - 1).to.equal(1);
    });

    it("is deterministic: same input, same output", function () {
      expect(compressSchema(sampleSchema())).to.deep.equal(
        compressSchema(sampleSchema())
      );
    });
  });

  describe("edges", function () {
    it("passes through primitives, arrays, and small objects unchanged", function () {
      const schema = {
        title: "tiny",
        anyOf: [{ type: "string" }, { type: "number" }],
        enum: ["a", "b"],
      };
      const compressed = compressSchema(JSON.parse(JSON.stringify(schema)));
      expect(compressed).to.deep.equal(schema);
      expect(expandSchema(compressed)).to.deep.equal(schema);
    });

    it("leaves an authored definitions key untouched", function () {
      const compressed = compressSchema(sampleSchema());
      expect(compressed.definitions.authored).to.deep.equal({
        type: "number",
        description: "An authored definitions entry that must pass through.",
      });
      expect(expandSchema(compressed).definitions.authored.type).to.equal(
        "number"
      );
    });

    it("expand returns fresh trees (no shared object identity)", function () {
      const expanded = expandSchema(compressSchema(sampleSchema()));
      expect(expanded.properties.a).to.deep.equal(expanded.properties.b);
      expect(expanded.properties.a).to.not.equal(expanded.properties.b);
      // Mutating one site must not leak into the other.
      expanded.properties.a.type = "mutated";
      expect(expanded.properties.b.type).to.equal("object");
    });

    it("expand is a no-op on schemas without the container", function () {
      const schema = sampleSchema();
      expect(expandSchema(JSON.parse(JSON.stringify(schema)))).to.deep.equal(
        schema
      );
    });

    it("compress rejects input that already uses the container namespace", function () {
      expect(() =>
        compressSchema({ [DEDUPE_CONTAINER]: {} })
      ).to.throw(/reserved/);
      expect(() =>
        compressSchema({
          properties: { x: { $ref: `#/${DEDUPE_CONTAINER}/d123` } },
        })
      ).to.throw(/reserved/);
    });

    it("expand throws on an unresolvable container ref", function () {
      expect(() =>
        expandSchema({
          properties: { x: { $ref: `#/${DEDUPE_CONTAINER}/missing` } },
        })
      ).to.throw(/unresolvable/i);
    });

    it("expand throws on a cyclic dedupe ref instead of overflowing", function () {
      // compressSchema only ever produces trees, so a cycle can only come
      // from a hand-corrupted artifact — it must fail loudly.
      const compressed = {
        title: "cyclic",
        properties: { x: { $ref: `#/${DEDUPE_CONTAINER}/a` } },
        [DEDUPE_CONTAINER]: {
          a: { $ref: `#/${DEDUPE_CONTAINER}/b` },
          b: { $ref: `#/${DEDUPE_CONTAINER}/a` },
        },
      };
      expect(() => expandSchema(compressed)).to.throw(/cyclic/i);
    });

    it("expand leaves non-container refs alone", function () {
      const schema = {
        properties: { x: { $ref: "#/definitions/authored" } },
        definitions: { authored: { type: "string" } },
      };
      expect(expandSchema(JSON.parse(JSON.stringify(schema)))).to.deep.equal(
        schema
      );
    });

    it("handles $ref-bearing objects with siblings without treating them as container refs", function () {
      // Only a SINGLE-KEY {$ref} object pointing into the container is a
      // dedupe ref; anything else is user content.
      const schema = {
        properties: {
          x: { $ref: "#/definitions/authored", description: "sibling" },
        },
        definitions: { authored: { type: "string" } },
      };
      expect(expandSchema(JSON.parse(JSON.stringify(schema)))).to.deep.equal(
        schema
      );
    });

    it("round-trips deeply nested repetition inside arrays", function () {
      const block = {
        description:
          "array-nested repeated block that is comfortably past the minimum hoist size threshold",
        type: "object",
        properties: { k: { type: "string" } },
      };
      const schema = {
        anyOf: [
          { allOf: [JSON.parse(JSON.stringify(block))] },
          { allOf: [JSON.parse(JSON.stringify(block))] },
        ],
      };
      const compressed = compressSchema(JSON.parse(JSON.stringify(schema)));
      expect(expandSchema(compressed)).to.deep.equal(schema);
    });
  });
});
