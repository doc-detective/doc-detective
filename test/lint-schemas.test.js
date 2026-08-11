// Unit tests for scripts/lint-schemas.cjs.
//
// `inertDefaults` is the reason this file exists. It decides whether a schema
// `default` is dead, which gates the build — and it took three attempts to get
// right. Ajv's own strict warning was tried as the oracle and rejected (it
// flags httpRequest_v3's `statusCodes` but stays silent on find_v3's `moveTo`,
// the exact bug the rule was written for), then a lexical walk was tried and
// rejected the other way (it calls `components/schemas/object/...` clean when
// the only path in is the root `anyOf` via a `$ref`). Each case below pins one
// of the distinctions those attempts got wrong.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inertDefaults, escapeData, escapeProperty, pageSchemas } = require("../scripts/lint-schemas.cjs");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

/** Pointers of the defaults reported inert, for terser assertions. */
function inertPointers(schema) {
  return inertDefaults(schema).map((hit) => hit.pointer).sort();
}

describe("scripts/lint-schemas inertDefaults", function () {
  it("reports a default under anyOf, which Ajv never applies", function () {
    const schema = {
      anyOf: [{ type: "string" }, { type: "object", properties: { x: { type: "string", default: "A" } } }],
    };
    expect(inertPointers(schema)).to.deep.equal(["/anyOf/1/properties/x"]);
  });

  it("leaves a default under allOf alone, because Ajv DOES apply those", function () {
    // Verified against Ajv directly: allOf applies defaults, anyOf does not.
    // Treating allOf as composition would condemn the very shape the
    // type-collapse fix produces.
    const schema = { allOf: [{ type: "object", properties: { x: { type: "string", default: "A" } } }] };
    expect(inertDefaults(schema)).to.deep.equal([]);
  });

  it("reports a default reachable only through an internal $ref from inside anyOf", function () {
    // The shape every schema in this repo uses. `components` sits outside any
    // composition, so a lexical check calls it clean — but the only path in is
    // the root anyOf following a $ref, so the default is dead.
    const schema = {
      anyOf: [{ type: "string" }, { $ref: "#/components/schemas/object" }],
      components: {
        schemas: {
          object: { type: "object", properties: { timeout: { type: "integer", default: 5000 } } },
        },
      },
    };
    expect(inertPointers(schema)).to.deep.equal(["/components/schemas/object/properties/timeout"]);
  });

  it("treats a node reached by BOTH a composed and an uncomposed path as live", function () {
    const shared = { $ref: "#/components/schemas/thing" };
    const schema = {
      type: "object",
      properties: { direct: shared, viaBranch: { anyOf: [shared] } },
      components: {
        schemas: { thing: { type: "object", properties: { x: { type: "string", default: "A" } } } },
      },
    };
    // The direct path applies the default, so it is not dead.
    expect(inertDefaults(schema)).to.deep.equal([]);
  });

  it("does not traverse `components` on its own, since Ajv ignores it", function () {
    // Nothing references this subtree, so its default is unreachable rather
    // than merely composed — and an unreferenced container is not a finding.
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      components: { schemas: { orphan: { properties: { x: { default: "A" } } } } },
    };
    expect(inertDefaults(schema)).to.deep.equal([]);
  });

  it("survives a circular internal $ref", function () {
    const schema = {
      anyOf: [{ $ref: "#/components/schemas/node" }],
      components: {
        schemas: {
          node: {
            type: "object",
            properties: { child: { $ref: "#/components/schemas/node" }, x: { default: "A" } },
          },
        },
      },
    };
    expect(inertPointers(schema)).to.deep.equal(["/components/schemas/node/properties/x"]);
  });

  it("ignores `default` keys that are data rather than schema keywords", function () {
    // A user's `examples` entry can contain a literal `default` key; descending
    // into it would invent findings from documentation.
    const schema = {
      anyOf: [{ type: "object", properties: { a: { type: "string" } } }],
      examples: [{ properties: { x: { default: "not a schema" } } }],
    };
    expect(inertDefaults(schema)).to.deep.equal([]);
  });
});

describe("scripts/lint-schemas workflow-command escaping", function () {
  it("escapes % before the sequences it introduces", function () {
    // % last would double-encode the %0A/%0D just written.
    expect(escapeData("100% done\nnext")).to.equal("100%25 done%0Anext");
  });

  it("escapes CR and LF so a multi-line message stays one annotation", function () {
    expect(escapeData("a\r\nb")).to.equal("a%0D%0Ab");
  });

  it("additionally escapes : and , in property values", function () {
    // Both are structural in the property list; unescaped they split the value
    // into a bogus extra property.
    expect(escapeProperty("a:b,c")).to.equal("a%3Ab%2Cc");
  });

  it("leaves ordinary text untouched", function () {
    expect(escapeData("no-inert-default")).to.equal("no-inert-default");
    expect(escapeProperty("src/common/x.schema.json")).to.equal("src/common/x.schema.json");
  });
});

describe("scripts/lint-schemas pageSchemas", function () {
  it("reads the docs generator's own list rather than a duplicated copy", function () {
    const emitted = pageSchemas();
    expect(emitted.size).to.be.greaterThan(0);
    // Sanity: v3 schemas that produce reference pages are in; v1/v2 are not.
    expect(emitted.has("find_v3.schema.json")).to.equal(true);
    expect(emitted.has("find_v2.schema.json")).to.equal(false);
  });
});
