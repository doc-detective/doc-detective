// The docs-as-tests reference aims to show every authoring feature in at
// least one example. The coverage check walks the schemas for the fields a
// user can write and reports the ones no example uses.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  walkSchema,
  collectUsage,
  findGaps,
  findMissingNeedles,
} = require("../docs/.scripts/docsAsTestsCoverage.js");

// A tiny two-file schema set: a step whose `go` action is a string or an
// object (through $ref and anyOf), a result-only field, a deprecated alias,
// and a `tests` array that points at another root schema.
const schemas = {
  "step_v3.schema.json": {
    type: "object",
    properties: {
      go: { $ref: "go_v3.schema.json#" },
      stepId: { type: "string" },
      resultDescription: { type: "string" },
      durationMs: { type: "integer", readOnly: true },
      old: { $ref: "#/components/schemas/old" },
      inner: { type: "array", items: { $ref: "test_v3.schema.json" } },
    },
    components: { schemas: { old: { type: "string", deprecated: true } } },
  },
  "go_v3.schema.json": {
    anyOf: [{ $ref: "#/components/schemas/url" }, { $ref: "#/components/schemas/object" }],
    components: {
      schemas: {
        url: { type: "string" },
        object: {
          type: "object",
          properties: {
            url: { $ref: "#/components/schemas/url" },
            tabs: { anyOf: [{ type: "boolean" }, { type: "array", items: { type: "string" } }] },
          },
        },
      },
    },
  },
  "test_v3.schema.json": { type: "object", properties: { testId: { type: "string" } } },
};
const load = (file) => schemas[file];

describe("docs-as-tests coverage: schema walk", function () {
  const walked = walkSchema(["step_v3.schema.json"], load);

  it("walks each referenced schema file once, following $ref and anyOf into every form", function () {
    assert.deepEqual(walked.fields, {
      step: { go: ["object", "string"], stepId: ["string"], inner: ["array"] },
      go: { url: ["string"], tabs: ["array", "boolean"] },
      test: { testId: ["string"] },
    });
  });

  it("records where a field crosses into another schema file", function () {
    assert.deepEqual(walked.boundaries, { step: { go: ["go"], "inner[]": ["test"] }, go: {}, test: {} });
  });

  it("gives an object and an array of the same objects one set of field paths", function () {
    const ctx = {
      "context_v3.schema.json": {
        type: "object",
        properties: {
          browsers: { anyOf: [{ $ref: "#/components/schemas/b" }, { type: "array", items: { $ref: "#/components/schemas/b" } }] },
          off: { type: ["boolean", "null"] },
        },
        components: { schemas: { b: { type: "object", properties: { name: { type: "string" } } } } },
      },
    };
    const { fields, boundaries } = walkSchema(["context_v3.schema.json"], (f) => ctx[f]);
    assert.deepEqual(fields, { context: { browsers: ["array", "object"], "browsers.name": ["string"], off: ["boolean"] } });
    const usage = collectUsage({ browsers: [{ name: "x" }] }, "context", boundaries, {});
    assert.deepEqual(usage["context:browsers.name"], ["string"]);
  });

  it("keeps only the fields a filter allows, and the schemas they reach", function () {
    const kept = walkSchema(["step_v3.schema.json"], load, (root, p) => root !== "step" || p !== "go");
    assert.deepEqual(Object.keys(kept.fields), ["step", "test"]);
  });
});

describe("docs-as-tests coverage: usage and gaps", function () {
  const boundaries = { step: { go: ["go"], "inner[]": ["test"] } };

  it("records each used path with the type of its value, crossing into other schemas", function () {
    const usage = {};
    collectUsage({ go: { url: "x", tabs: true }, inner: [{ testId: "t" }] }, "step", boundaries, usage);
    assert.deepEqual(usage["step:go"], ["object"]);
    assert.deepEqual(usage["go:url"], ["string"]);
    assert.deepEqual(usage["go:tabs"], ["boolean"]);
    assert.deepEqual(usage["step:inner"], ["array"]);
    assert.deepEqual(usage["test:testId"], ["string"]);
  });

  it("reports unused fields and unused forms of multi-type fields", function () {
    const fields = { step: { go: ["object", "string"], "go.url": ["string"], stepId: ["string"] } };
    const usage = { "step:go": ["object"], "step:go.url": ["string"] };
    assert.deepEqual(findGaps(fields, usage), {
      total: 4,
      covered: 2,
      gaps: { step: ["go (string)", "stepId"] },
    });
  });

  it("treats number and integer as one form", function () {
    const fields = { step: { wait: ["boolean", "number"] } };
    const usage = { "step:wait": ["boolean", "number"] };
    assert.deepEqual(findGaps(fields, usage).gaps, {});
  });
});

describe("docs-as-tests coverage: needles", function () {
  const docs = [
    { file: "/ex/a/inline.md", text: '{"find": {"elementText": "/Hel+o/"}} <!-- test -->' },
    { file: "/ex/a/inline.rst", text: ".. test end" },
  ];

  it("matches plain strings and /regex/ needles against example files", function () {
    const features = [
      { id: "rst", since: "v5.4.0", needle: ".. test end" },
      { id: "regex-text", since: "v3.0.0", needle: '/"elementText":\\s*"\\//' },
      { id: "dita-pi", since: "v3.4.0", needle: "<?doc-detective" },
    ];
    assert.deepEqual(findMissingNeedles(features, docs).map((f) => f.id), ["dita-pi"]);
  });

  it("looks only in the files a feature's `files` pattern names", function () {
    const features = [
      { id: "md-comment", since: "v3.0.0", needle: "<!-- test", files: "\\.md$" },
      { id: "dita-comment", since: "v3.4.0", needle: "<!-- test", files: "\\.dita$" },
    ];
    assert.deepEqual(findMissingNeedles(features, docs).map((f) => f.id), ["dita-comment"]);
  });
});
