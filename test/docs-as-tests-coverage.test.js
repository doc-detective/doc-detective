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
  canonicalKey,
  splitKnownGaps,
  slugify,
  mapExamplesToPages,
  buildIndex,
  renderIndexJson,
  renderIndexMdx,
} = require("../docs/.scripts/docsAsTestsCoverage.js");

describe("docs-as-tests coverage: feature index", function () {
  it("slugs a heading the way the docs site anchors it", function () {
    assert.equal(slugify("Take screenshots of a sign-in form"), "take-screenshots-of-a-sign-in-form");
    assert.equal(slugify("Run `curl` and check its output"), "run-curl-and-check-its-output");
  });

  it("maps each example to the page that includes it, at the nearest H2 or H3 above", function () {
    const pages = [
      {
        slug: "capture",
        text: [
          "---", "title: x", "---", "## Take screenshots", "", '<Markdown src="examples/shots/_variants.mdx" />',
          "### What detection finds", "## Record a walkthrough", "### Where it runs",
          '<Markdown src="examples/rec/_variants.mdx" />',
        ].join("\n"),
      },
    ];
    assert.deepEqual(mapExamplesToPages(pages), {
      shots: "/reference/docs-as-tests/capture#take-screenshots",
      rec: "/reference/docs-as-tests/capture#where-it-runs",
    });
  });

  it("lists, for each covered field and form, the examples that use it", function () {
    const fields = { goTo: { url: ["string"], newTab: ["boolean", "string"] }, click: { elementId: ["string"] }, find: { elementId: ["string"] } };
    const usageByExample = {
      tabs: { "goTo:url": ["string"], "goTo:newTab": ["string"] },
      ids: { "find:elementId": ["string"], "goTo:url": ["string"] },
    };
    const canon = (root, p) => canonicalKey(root, p, fields[root]);
    const pages = { tabs: "/reference/docs-as-tests/s#tabs" };
    assert.deepEqual(buildIndex(fields, usageByExample, canon, pages, { "features.rst": ["ids"] }), {
      "features.rst": [{ example: "ids", page: null }],
      "goTo.newTab (string)": [{ example: "tabs", page: "/reference/docs-as-tests/s#tabs" }],
      "goTo.url": [{ example: "ids", page: null }, { example: "tabs", page: "/reference/docs-as-tests/s#tabs" }],
      "shared:locator.elementId": [{ example: "ids", page: null }],
    });
  });

  it("renders the index as sorted JSON and as a page with one table per group", function () {
    const index = {
      "goTo.url": [{ example: "tabs", page: "/reference/docs-as-tests/s#tabs" }, { example: "ids", page: null }],
      "click.button": [{ example: "ids", page: null }],
    };
    assert.equal(renderIndexJson(index), JSON.stringify({ "click.button": index["click.button"], "goTo.url": index["goTo.url"] }, null, 2) + "\n");
    const mdx = renderIndexMdx(index);
    assert.match(mdx, /^---\ntitle: Examples by feature\n/);
    assert.ok(mdx.indexOf("## `click`") < mdx.indexOf("## `goTo`"));
    assert.match(mdx, /\| `url` \| \[tabs\]\(\/reference\/docs-as-tests\/s#tabs\), ids \|/);
  });
});

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

  it("names the fields each reached schema is reached from, so a gap can be traced to its action", function () {
    assert.deepEqual(walked.via, { step: [], go: ["step.go"], test: ["step.inner[]"] });
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
      shared: {},
    });
  });

  it("treats number and integer as one form", function () {
    const fields = { step: { wait: ["boolean", "number"] } };
    const usage = { "step:wait": ["boolean", "number"] };
    assert.deepEqual(findGaps(fields, usage).gaps, {});
  });
});

describe("docs-as-tests coverage: shared keys", function () {
  const clickFields = { selector: ["string"], elementId: ["string"], timeout: ["number"], button: ["string"] };

  it("collapses element locator keys, and a timeout beside them, onto one shared key", function () {
    assert.equal(canonicalKey("click", "elementId", clickFields), "locator:elementId");
    assert.equal(canonicalKey("dragAndDrop", "source.elementClass", { "source.elementClass": [] }), "locator:elementClass");
    assert.equal(canonicalKey("click", "timeout", clickFields), "locator:timeout");
    assert.equal(canonicalKey("goTo", "timeout", { url: ["string"], timeout: ["number"] }), null);
    assert.equal(canonicalKey("click", "button", clickFields), null);
    assert.equal(canonicalKey("config", "selector", { selector: [] }), null);
  });

  it("collapses annotation style and position keys, and surface selectors", function () {
    assert.equal(canonicalKey("annotationDefaults", "arrow.color", {}), "style:color");
    assert.equal(canonicalKey("annotationDefaults", "padding", {}), "style:padding");
    assert.equal(canonicalKey("annotationDefaults", "blur", {}), "style:per-kind block");
    assert.equal(canonicalKey("annotation", "style.opacity", {}), "style:opacity");
    assert.equal(canonicalKey("annotation", "badge.position.offset.x", {}), "position:offset.x");
    assert.equal(canonicalKey("annotation", "callout.position", {}), "position:position");
    assert.equal(canonicalKey("surface#app", "window.title", {}), "surface:window.title");
    assert.equal(canonicalKey("surface", "tab", {}), "surface:tab");
    assert.equal(canonicalKey("swipe", "surface", {}), "surface:surface");
    assert.equal(canonicalKey("surface", "name", {}), null);
  });

  it("counts a collapsed key once, with each form, covered by use in any of its places", function () {
    const fields = {
      click: { elementId: ["string"], surface: ["object", "string"], button: ["string"] },
      find: { elementId: ["string"] },
      swipe: { surface: ["object"] },
    };
    const usage = { "find:elementId": ["string"], "swipe:surface": ["object"] };
    const canon = (root, p) => canonicalKey(root, p, fields[root]);
    const result = findGaps(fields, usage, canon);
    assert.equal(result.total, 4);
    assert.equal(result.covered, 2);
    assert.deepEqual(result.gaps, {
      click: ["button"],
      "shared:surface": ["surface (string) — in click, swipe"],
    });
    assert.deepEqual(result.shared, { click: 2, find: 1, swipe: 1 });
  });
});

describe("docs-as-tests coverage: known gaps", function () {
  it("separates listed gaps, keyed `<group>.<gap>`, from new ones, and flags listed gaps that are now covered", function () {
    const gaps = {
      step: ["saveState (string)", "wait (boolean)"],
      "shared:locator": ["elementClass (string) — in click, find"],
    };
    const known = [
      { key: "step.saveState (string)", reason: "Never overwrites." },
      { key: "shared:locator.elementClass (string)", reason: "Example pending." },
      { key: "runCode.directory", reason: "Fixed upstream." },
    ];
    assert.deepEqual(splitKnownGaps(gaps, known), {
      unknown: { step: ["wait (boolean)"] },
      known: known.slice(0, 2),
      stale: [known[2]],
    });
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
