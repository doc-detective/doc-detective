import { expect } from "chai";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
  classifyDocument,
  shouldHandleDocument,
  basenameFromUri,
} from "../dist/lsp/gate.js";
import {
  instancePathToSegments,
  parseJsonTree,
  rangeForInstancePath,
  findActionKeyedSteps,
} from "../dist/lsp/json/positions.js";
import {
  computeDiagnostics,
  schemaMessage,
  isSuppressedByActionKeyed,
  ACTION_KEYED_MESSAGE,
  V2_DEPRECATION_MESSAGE,
  DIAGNOSTIC_SOURCE,
} from "../dist/lsp/diagnostics.js";
import { buildModel } from "../dist/lsp/model.js";
import { isJsonUri, isYamlUri } from "../dist/lsp/gate.js";
import {
  fileTypeForUri,
  computeInlineDiagnostics,
  collectMatchOffsets,
  extractStatements,
} from "../dist/lsp/inline.js";
import {
  parseYamlTree,
  rangeForInstancePathYaml,
  findActionKeyedStepsYaml,
  yamlSyntaxErrors,
} from "../dist/lsp/yaml/positions.js";
import { registerHandlers } from "../dist/lsp/server.js";
import { lspCommand } from "../dist/lsp/command.js";
import {
  buildRegistry,
  getRegistry,
  branchesOf,
  findDescription,
  acceptsPrimitive,
  primitiveKindOf,
  collectFields,
  extractEnum,
} from "../dist/lsp/registry.js";
import {
  computeCompletions,
  isStepKeyContext,
  actionFieldContext,
  markdownDoc,
} from "../dist/lsp/completion.js";
import { computeHover } from "../dist/lsp/hover.js";
import { schemas } from "../dist/common/src/schemas/index.js";

/** Independently derive the action keys from step_v3.anyOf (for anti-drift). */
function actionKeysFromSchema() {
  const keys = [];
  for (const branch of schemas.step_v3.anyOf) {
    const parts = Array.isArray(branch.allOf) ? branch.allOf : [branch];
    const part = parts.find(
      (p) => Array.isArray(p.required) && p.required.length === 1 && p.required[0] !== "$schema",
    );
    if (part) keys.push(part.required[0]);
  }
  return keys;
}

/** Position of a `§` marker in `text`, returned with the marker stripped. */
function markerPos(text, marker = "§") {
  const off = text.indexOf(marker);
  const stripped = text.replace(marker, "");
  const d = TextDocument.create("file:///a/foo.spec.json", "doc-detective-spec", 1, stripped);
  return { doc: d, position: d.positionAt(off) };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "bin", "doc-detective.js");
const LSP_BIN = path.resolve(__dirname, "..", "bin", "doc-detective-lsp.js");

function doc(uri, text) {
  return TextDocument.create(uri, "doc-detective-spec", 1, text);
}

const VALID_SPEC = JSON.stringify({
  tests: [{ steps: [{ goTo: "https://example.com" }] }],
});
// Action-keyed AND invalid (unknown action), so it never transforms to a valid
// v2 spec — the flagship diagnostic should fire.
const ACTION_KEYED_SPEC = JSON.stringify(
  { tests: [{ steps: [{ action: "madeUpAction", value: 1 }] }] },
  null,
  2,
);
// A genuinely valid legacy v2 spec (action-keyed steps transform to valid
// spec_v3) — the LSP must NOT nag about it.
const VALID_V2_SPEC = JSON.stringify(
  { tests: [{ steps: [{ action: "goTo", url: "https://example.com" }] }] },
);

describe("lsp — detection gate", function () {
  it("classifies *.spec.json by filename", function () {
    expect(classifyDocument({ uri: "file:///a/foo.spec.json", text: "{}" })).to.equal("spec");
  });

  it("classifies .doc-detective.json by filename", function () {
    expect(classifyDocument({ uri: "file:///a/.doc-detective.json", text: "{}" })).to.equal("config");
  });

  it("classifies *.spec.yaml by filename (identity, even though Phase 1 won't validate it)", function () {
    expect(classifyDocument({ uri: "file:///a/foo.spec.yaml", text: "tests: []" })).to.equal("spec");
  });

  it("honors an explicit $schema opt-in for non-conventional names", function () {
    const specText = JSON.stringify({ $schema: "https://x/dist/schemas/spec_v3.schema.json", tests: [] });
    expect(classifyDocument({ uri: "file:///a/thing.json", text: specText })).to.equal("spec");
    const cfgText = JSON.stringify({ $schema: "https://x/dist/schemas/config_v3.schema.json" });
    expect(classifyDocument({ uri: "file:///a/thing.json", text: cfgText })).to.equal("config");
  });

  it("sniffs a top-level tests array as a spec", function () {
    expect(classifyDocument({ uri: "file:///a/thing.json", text: '{"tests":[]}' })).to.equal("spec");
  });

  it("sniffs a YAML file by shape and $schema (non-conventional name)", function () {
    expect(classifyDocument({ uri: "file:///a/thing.yaml", text: "tests: []" })).to.equal("spec");
    expect(
      classifyDocument({ uri: "file:///a/thing.yml", text: "$schema: x/config_v3.schema.json" }),
    ).to.equal("config");
  });

  it("stays silent on malformed YAML with a non-conventional name", function () {
    // Reaches the YAML parse catch branch.
    expect(classifyDocument({ uri: "file:///a/thing.yaml", text: "a:\n  - b: [\n : :" })).to.equal(null);
  });

  it("stays silent (null) on unrelated JSON", function () {
    expect(classifyDocument({ uri: "file:///a/package.json", text: '{"name":"x","version":"1.0.0"}' })).to.equal(null);
    expect(shouldHandleDocument({ uri: "file:///a/package.json", text: "{}" })).to.equal(false);
  });

  it("stays silent on non-object / unparseable content", function () {
    expect(classifyDocument({ uri: "file:///a/thing.json", text: "[1,2,3]" })).to.equal(null);
    expect(classifyDocument({ uri: "file:///a/thing.json", text: "not json at all" })).to.equal(null);
    expect(classifyDocument({ uri: "file:///a/thing.json", text: "" })).to.equal(null);
  });

  it("derives a lowercase basename from URIs with query/fragment and mixed slashes", function () {
    expect(basenameFromUri("file:///A/B/Foo.SPEC.JSON?x=1#y")).to.equal("foo.spec.json");
    expect(basenameFromUri("C:\\a\\b\\bar.spec.json")).to.equal("bar.spec.json");
  });

  it("returns an empty basename for trailing-slash / empty inputs", function () {
    expect(basenameFromUri("some/dir/")).to.equal("");
    expect(basenameFromUri("")).to.equal("");
  });
});

describe("lsp — json positions", function () {
  it("splits an AJV instancePath into typed segments", function () {
    expect(instancePathToSegments("/tests/0/steps/1/goTo")).to.deep.equal(["tests", 0, "steps", 1, "goTo"]);
    expect(instancePathToSegments("")).to.deep.equal([]);
    expect(instancePathToSegments("/a~1b/~0c")).to.deep.equal(["a/b", "~c"]);
  });

  it("resolves the source span for a nested instancePath", function () {
    const { root } = parseJsonTree(VALID_SPEC);
    const range = rangeForInstancePath(root, "/tests/0/steps/0/goTo");
    expect(range).to.not.equal(null);
    const slice = VALID_SPEC.slice(range.start, range.end);
    expect(slice).to.contain("https://example.com");
  });

  it("falls back to the nearest present ancestor when the exact node is absent", function () {
    const { root } = parseJsonTree('{"tests":[{"steps":[]}]}');
    // No /tests/0/steps/0 node exists; should anchor on /tests/0/steps (the array).
    const range = rangeForInstancePath(root, "/tests/0/steps/0");
    expect(range).to.not.equal(null);
    expect(VALID_SPEC).to.be.a("string"); // sanity
  });

  it("finds action-keyed steps with the step pointer", function () {
    const { root } = parseJsonTree(ACTION_KEYED_SPEC);
    const found = findActionKeyedSteps(root);
    expect(found).to.have.length(1);
    expect(found[0].pointer).to.equal("/tests/0/steps/0");
    const slice = ACTION_KEYED_SPEC.slice(found[0].keyRange.start, found[0].keyRange.end);
    expect(slice).to.equal('"action"');
  });

  it("returns no action-keyed steps for a compact-form spec", function () {
    const { root } = parseJsonTree(VALID_SPEC);
    expect(findActionKeyedSteps(root)).to.have.length(0);
  });

  it("ignores a non-array steps value", function () {
    const { root } = parseJsonTree('{"tests":[{"steps":{"action":"goTo"}}]}');
    expect(findActionKeyedSteps(root)).to.have.length(0);
  });

  it("ignores non-object elements inside a steps array", function () {
    const { root } = parseJsonTree('{"tests":[{"steps":["not-an-object"]}]}');
    expect(findActionKeyedSteps(root)).to.have.length(0);
  });
});

describe("lsp — diagnostics", function () {
  it("returns no diagnostics for a valid spec", function () {
    const d = computeDiagnostics(doc("file:///a/foo.spec.json", VALID_SPEC));
    expect(d).to.deep.equal([]);
  });

  it("reports a missing required property with a range", function () {
    const d = computeDiagnostics(doc("file:///a/foo.spec.json", "{}"));
    expect(d.length).to.be.greaterThan(0);
    expect(d[0].source).to.equal(DIAGNOSTIC_SOURCE);
    expect(d.some((x) => /required|tests/i.test(x.message))).to.equal(true);
  });

  it("gives the flagship action-keyed diagnostic and suppresses the anyOf noise", function () {
    const d = computeDiagnostics(doc("file:///a/foo.spec.json", ACTION_KEYED_SPEC));
    const flagship = d.filter((x) => x.message === ACTION_KEYED_MESSAGE);
    expect(flagship).to.have.length(1);
    expect(flagship[0].code).to.equal("action-keyed-step");
    // The friendly diagnostic is the ONLY thing reported for that step — no
    // wall of anyOf failures.
    expect(d).to.have.length(1);
    // And it points at the "action" key.
    const text = ACTION_KEYED_SPEC;
    const start = text.split("\n").slice(0, flagship[0].range.start.line).join("\n").length;
    expect(text.slice(start)).to.contain('"action"');
  });

  it("warns (not errors) on a valid legacy v2 spec", function () {
    // Action-keyed steps that transform to a valid spec_v3 are legitimately
    // valid — no ERROR, but a soft deprecation WARNING steering to v3.
    const d = computeDiagnostics(doc("file:///a/legacy.spec.json", VALID_V2_SPEC));
    expect(d).to.have.length(1);
    expect(d[0].severity).to.equal(2); // Warning
    expect(d[0].message).to.equal(V2_DEPRECATION_MESSAGE);
    expect(d[0].code).to.equal("legacy-v2-step");
    // Not the blocking error.
    expect(d.some((x) => x.message === ACTION_KEYED_MESSAGE)).to.equal(false);
  });

  it("names the offending property on additionalProperties errors", function () {
    const d = computeDiagnostics(
      doc("file:///a/.doc-detective.json", '{"totallyBogusKey": true}'),
    );
    expect(d.some((x) => /totallyBogusKey/.test(x.message))).to.equal(true);
  });

  it("surfaces JSON syntax errors itself", function () {
    const d = computeDiagnostics(doc("file:///a/foo.spec.json", '{"tests": ['));
    expect(d.some((x) => /JSON syntax/.test(x.message))).to.equal(true);
  });

  it("stays silent for unrelated documents", function () {
    expect(computeDiagnostics(doc("file:///a/package.json", '{"name":"x"}'))).to.deep.equal([]);
  });

  it("validates config files against config_v3", function () {
    const d = computeDiagnostics(doc("file:///a/.doc-detective.json", '{"logLevel":"nonsense"}'));
    expect(d.length).to.be.greaterThan(0);
    expect(d[0].source).to.equal(DIAGNOSTIC_SOURCE);
  });

  it("handles an empty spec-named file without throwing", function () {
    // The filename classifies it as a spec, but there's no parse tree.
    expect(computeDiagnostics(doc("file:///a/foo.spec.json", "   "))).to.be.an("array");
  });

  it("stays silent when the spec value is a JSON primitive", function () {
    // Filename says spec, but the content is a bare primitive — nothing to
    // schema-validate; only (absent) syntax errors would show.
    expect(computeDiagnostics(doc("file:///a/foo.spec.json", "42"))).to.deep.equal([]);
  });
});

describe("lsp — schemaMessage + suppression helpers", function () {
  it("appends the offending property for additionalProperties", function () {
    expect(
      schemaMessage({
        keyword: "additionalProperties",
        message: "must NOT have additional properties",
        params: { additionalProperty: "bogus" },
      }),
    ).to.contain('"bogus"');
  });

  it("returns the base message for a required error", function () {
    expect(
      schemaMessage({
        keyword: "required",
        message: "must have required property 'tests'",
        params: { missingProperty: "tests" },
      }),
    ).to.equal("must have required property 'tests'");
  });

  it("falls back to a generic message and empty params defensively", function () {
    expect(schemaMessage({})).to.equal("does not match the schema");
    // additionalProperties keyword but no params → generic base, no crash.
    expect(schemaMessage({ keyword: "additionalProperties", message: "x" })).to.equal("x");
  });

  it("suppresses errors under a step pointer and vague ancestor anyOf/oneOf", function () {
    const ptrs = ["/tests/0/steps/0"];
    // under the step
    expect(isSuppressedByActionKeyed("/tests/0/steps/0/goTo", "type", ptrs)).to.equal(true);
    expect(isSuppressedByActionKeyed("/tests/0/steps/0", "anyOf", ptrs)).to.equal(true);
    // vague ancestor container failure
    expect(isSuppressedByActionKeyed("/tests/0", "anyOf", ptrs)).to.equal(true);
    expect(isSuppressedByActionKeyed("/tests/0", "oneOf", ptrs)).to.equal(true);
    // ancestor but NOT a vague container keyword → keep it
    expect(isSuppressedByActionKeyed("/tests/0", "required", ptrs)).to.equal(false);
    // unrelated path → keep it
    expect(isSuppressedByActionKeyed("/tests/1/runOn", "type", ptrs)).to.equal(false);
  });
});

describe("lsp — action registry", function () {
  it("derives every step_v3 action (anti-drift)", function () {
    const registry = buildRegistry();
    const schemaKeys = actionKeysFromSchema();
    expect(schemaKeys.length).to.be.greaterThan(0);
    // Every action the schema defines must appear in the registry, so a new
    // action added to the schemas can't silently miss completion/hover.
    for (const key of schemaKeys) {
      expect(registry.byKey.has(key), `registry missing action "${key}"`).to.equal(true);
    }
    expect(registry.actions.length).to.equal(schemaKeys.length);
  });

  it("captures fields, descriptions, and primitive kinds", function () {
    const registry = buildRegistry();
    const find = registry.byKey.get("find");
    expect(find.fields.map((f) => f.name)).to.include.members(["selector", "timeout"]);
    const goTo = registry.byKey.get("goTo");
    expect(goTo.acceptsPrimitive).to.equal(true); // goTo accepts a bare URL string
    expect(goTo.primitiveKind).to.equal("string");
    expect(registry.byKey.get("wait").primitiveKind).to.equal("number");
    expect(registry.byKey.get("stopRecord").primitiveKind).to.equal("boolean");
    const httpRequest = registry.byKey.get("httpRequest");
    expect(httpRequest.description).to.be.a("string").with.length.greaterThan(0);
  });

  it("caches the shared registry instance", function () {
    expect(getRegistry()).to.equal(getRegistry());
  });
});

describe("lsp — registry helpers", function () {
  it("branchesOf gathers self + anyOf/oneOf/allOf and tolerates non-objects", function () {
    expect(branchesOf(null)).to.deep.equal([]);
    expect(branchesOf("nope")).to.deep.equal([]);
    const schema = { type: "object", anyOf: [{ a: 1 }], oneOf: [{ b: 2 }], allOf: [{ c: 3 }] };
    expect(branchesOf(schema)).to.have.length(4);
  });

  it("findDescription digs through branches and returns undefined when absent", function () {
    expect(findDescription({ anyOf: [{}, { description: "deep" }] })).to.equal("deep");
    expect(findDescription({ type: "object" })).to.equal(undefined);
  });

  it("acceptsPrimitive handles string and array type declarations", function () {
    expect(acceptsPrimitive({ type: "string" })).to.equal(true);
    expect(acceptsPrimitive({ type: ["null", "number"] })).to.equal(true);
    expect(acceptsPrimitive({ type: "object" })).to.equal(false);
    expect(acceptsPrimitive({ anyOf: [{ type: "object" }] })).to.equal(false);
  });

  it("primitiveKindOf maps schema types to snippet kinds", function () {
    expect(primitiveKindOf({ type: "string" })).to.equal("string");
    expect(primitiveKindOf({ type: "integer" })).to.equal("number");
    expect(primitiveKindOf({ type: ["null", "boolean"] })).to.equal("boolean");
    expect(primitiveKindOf({ anyOf: [{ type: "object" }, { type: "number" }] })).to.equal("number");
    expect(primitiveKindOf({ type: "object" })).to.equal(null);
    expect(primitiveKindOf({ type: "array" })).to.equal(null);
  });

  it("collectFields merges properties, dedupes, and skips $schema", function () {
    const schema = {
      properties: { a: { description: "A" }, $schema: {} },
      anyOf: [{ properties: { a: { description: "dup" }, b: { enum: ["x"] } } }],
    };
    const fields = collectFields(schema);
    const names = fields.map((f) => f.name);
    expect(names).to.have.members(["a", "b"]);
    expect(names).to.not.include("$schema");
    // First occurrence of `a` wins (dedupe).
    expect(fields.find((f) => f.name === "a").description).to.equal("A");
    expect(fields.find((f) => f.name === "b").enumValues).to.deep.equal(["x"]);
  });

  it("collectFields ignores branches without a properties object", function () {
    expect(collectFields({ type: "string" })).to.deep.equal([]);
  });

  it("extractEnum returns a copy or undefined", function () {
    expect(extractEnum({ enum: ["a", "b"] })).to.deep.equal(["a", "b"]);
    expect(extractEnum({ type: "string" })).to.equal(undefined);
  });

  it("buildRegistry tolerates a branch without allOf and a part without a title", function () {
    // Injected schema: branch has no `allOf` (actionPartOf falls back to
    // [branch]) and the action part has no `title` (title falls back to key).
    const reg = buildRegistry({
      anyOf: [{ required: ["wait"], properties: { wait: { type: "number" } } }],
    });
    expect(reg.actions).to.have.length(1);
    expect(reg.actions[0].key).to.equal("wait");
    expect(reg.actions[0].title).to.equal("wait");
  });

  it("buildRegistry tolerates a schema with no anyOf", function () {
    expect(buildRegistry({}).actions).to.deep.equal([]);
  });
});

describe("lsp — completion", function () {
  it("markdownDoc wraps text and drops empties", function () {
    expect(markdownDoc("hello")).to.deep.equal({ kind: "markdown", value: "hello" });
    expect(markdownDoc("")).to.equal(undefined);
    expect(markdownDoc(undefined)).to.equal(undefined);
  });

  it("classifies step-key and action-field path contexts", function () {
    expect(isStepKeyContext(["tests", 0, "steps", 0, ""])).to.equal(true);
    expect(isStepKeyContext(["tests", 0, "steps", 0, "find", ""])).to.equal(false);
    expect(actionFieldContext(["tests", 0, "steps", 0, "find", ""])).to.equal("find");
    expect(actionFieldContext(["tests", 0, "steps", 0, ""])).to.equal(null);
  });

  it("offers every action at an empty step-object key position (insert path)", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{§}]}]}');
    const items = computeCompletions(d, position);
    expect(items.length).to.equal(buildRegistry().actions.length);
    const goTo = items.find((i) => i.label === "goTo");
    expect(goTo.insertTextFormat).to.equal(2); // Snippet
    // Empty object → plain insert (no token to replace).
    expect(goTo.textEdit).to.equal(undefined);
    expect(goTo.insertText).to.equal('"goTo": "$1"');
  });

  it("uses an unquoted placeholder for numeric/boolean actions", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{§}]}]}');
    const items = computeCompletions(d, position);
    const wait = items.find((i) => i.label === "wait");
    expect(wait.insertText).to.equal('"wait": $1'); // number → no quotes
    const stopRecord = items.find((i) => i.label === "stopRecord");
    expect(stopRecord.insertText).to.equal('"stopRecord": $1'); // boolean → no quotes
    const goTo = items.find((i) => i.label === "goTo");
    expect(goTo.insertText).to.equal('"goTo": "$1"'); // string → quoted
  });

  it("replaces a partial key token via textEdit", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{"go§"}]}]}');
    const items = computeCompletions(d, position);
    const goTo = items.find((i) => i.label === "goTo");
    expect(goTo.textEdit).to.be.an("object");
    expect(goTo.textEdit.newText).to.equal('"goTo": "$1"');
  });

  it("offers an action's fields inside its object body", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{"find":{§}}]}]}');
    const items = computeCompletions(d, position);
    const labels = items.map((i) => i.label);
    expect(labels).to.include.members(["selector", "timeout"]);
  });

  it("returns nothing at a non-key (value) position", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{"goTo":§}]}]}');
    expect(computeCompletions(d, position)).to.deep.equal([]);
  });

  it("returns nothing for non-spec, non-json, or unknown actions", function () {
    const outsideSteps = markerPos('{"tests":[{"§":""}]}');
    expect(computeCompletions(outsideSteps.doc, outsideSteps.position)).to.deep.equal([]);
    const yaml = TextDocument.create("file:///a/foo.spec.yaml", "x", 1, "tests: []");
    expect(computeCompletions(yaml, { line: 0, character: 0 })).to.deep.equal([]);
    const unrelated = TextDocument.create("file:///a/package.json", "json", 1, '{"a":{"b":1}}');
    expect(computeCompletions(unrelated, { line: 0, character: 6 })).to.deep.equal([]);
  });
});

describe("lsp — hover", function () {
  it("shows an action's description on its key", function () {
    const text = '{"tests":[{"steps":[{"find":{}}]}]}';
    const d = doc("file:///a/foo.spec.json", text);
    const h = computeHover(d, d.positionAt(text.indexOf("find") + 1));
    expect(h).to.not.equal(null);
    expect(h.contents.value).to.contain("find");
    expect(h.contents.value.toLowerCase()).to.contain("element");
  });

  it("returns null off an action key", function () {
    const text = '{"tests":[{"steps":[{"goTo":"https://x.com"}]}]}';
    const d = doc("file:///a/foo.spec.json", text);
    // hover over the "tests" key, not a step action
    expect(computeHover(d, d.positionAt(text.indexOf("tests") + 1))).to.equal(null);
    // hover over a string VALUE (the URL), not a key
    expect(computeHover(d, d.positionAt(text.indexOf("https") + 1))).to.equal(null);
    // hover over a non-string node (the outer array)
    expect(computeHover(d, d.positionAt(text.indexOf("[")))).to.equal(null);
  });

  it("returns null on a non-action step key", function () {
    // `description` is a valid step-level key but not an action.
    const text = '{"tests":[{"steps":[{"description":"x","goTo":"https://x.com"}]}]}';
    const d = doc("file:///a/foo.spec.json", text);
    expect(computeHover(d, d.positionAt(text.indexOf("description") + 1))).to.equal(null);
  });

  it("returns null for non-spec, non-json, and empty documents", function () {
    expect(computeHover(doc("file:///a/package.json", '{"find":1}'), { line: 0, character: 2 })).to.equal(null);
    expect(computeHover(doc("file:///a/foo.spec.yaml", "find: {}"), { line: 0, character: 0 })).to.equal(null);
    expect(computeHover(doc("file:///a/foo.spec.json", "   "), { line: 0, character: 0 })).to.equal(null);
  });
});

describe("lsp — YAML diagnostics", function () {
  const VALID_V3_YAML = "tests:\n  - steps:\n      - goTo: https://example.com\n";
  const VALID_V2_YAML =
    "tests:\n  - steps:\n      - action: goTo\n        url: https://example.com\n";

  it("returns no diagnostics for a valid v3 YAML spec", function () {
    expect(computeDiagnostics(doc("file:///a/x.spec.yaml", VALID_V3_YAML))).to.deep.equal([]);
  });

  it("warns on a valid legacy v2 YAML spec", function () {
    const d = computeDiagnostics(doc("file:///a/x.spec.yaml", VALID_V2_YAML));
    expect(d).to.have.length(1);
    expect(d[0].severity).to.equal(2); // Warning
    expect(d[0].code).to.equal("legacy-v2-step");
  });

  it("reports schema errors in a YAML spec with source ranges", function () {
    const d = computeDiagnostics(doc("file:///a/x.spec.yaml", "notTests: 1\n"));
    expect(d.length).to.be.greaterThan(0);
    expect(d[0].source).to.equal(DIAGNOSTIC_SOURCE);
    expect(d.some((x) => /required|tests/i.test(x.message))).to.equal(true);
  });

  it("surfaces YAML syntax errors and suppresses schema noise", function () {
    const d = computeDiagnostics(doc("file:///a/x.spec.yaml", "tests:\n  - steps: [ unclosed\n"));
    expect(d.some((x) => /YAML syntax/.test(x.message))).to.equal(true);
    // No schema "must be object" noise while the buffer is syntactically broken.
    expect(d.every((x) => /YAML syntax/.test(x.message))).to.equal(true);
  });

  it("fires the flagship error on an invalid action-keyed YAML step", function () {
    const d = computeDiagnostics(
      doc("file:///a/x.spec.yaml", "tests:\n  - steps:\n      - action: madeUpAction\n"),
    );
    expect(d.some((x) => x.message === ACTION_KEYED_MESSAGE)).to.equal(true);
  });

  it("also validates YAML config files", function () {
    const d = computeDiagnostics(doc("file:///a/.doc-detective.yaml", "logLevel: nonsense\n"));
    expect(d.length).to.be.greaterThan(0);
  });
});

describe("lsp — yaml positions", function () {
  it("parses to a value and locates instance paths", function () {
    const text = "tests:\n  - steps:\n      - goTo: https://example.com\n";
    const { doc: yDoc, value } = parseYamlTree(text);
    expect(value.tests[0].steps[0].goTo).to.equal("https://example.com");
    const range = rangeForInstancePathYaml(yDoc, "/tests/0/steps/0/goTo");
    expect(range).to.not.equal(null);
    expect(text.slice(range.start, range.end)).to.contain("example.com");
  });

  it("falls back to the nearest ancestor for an absent path", function () {
    const { doc: yDoc } = parseYamlTree("tests:\n  - steps: []\n");
    const range = rangeForInstancePathYaml(yDoc, "/tests/0/steps/0");
    expect(range).to.not.equal(null);
  });

  it("falls all the way back to document contents for a fully-absent path", function () {
    const { doc: yDoc } = parseYamlTree("tests: []\n");
    const range = rangeForInstancePathYaml(yDoc, "/totally/absent/path");
    expect(range).to.not.equal(null);
  });

  it("returns null for any path in an empty document", function () {
    const { doc: yDoc } = parseYamlTree("");
    expect(rangeForInstancePathYaml(yDoc, "/tests")).to.equal(null);
  });

  it("finds action-keyed steps in YAML with the step pointer", function () {
    const text = "tests:\n  - steps:\n      - action: goTo\n        url: x\n";
    const { doc: yDoc } = parseYamlTree(text);
    const found = findActionKeyedStepsYaml(yDoc);
    expect(found).to.have.length(1);
    expect(found[0].pointer).to.equal("/tests/0/steps/0");
    expect(text.slice(found[0].keyRange.start, found[0].keyRange.end)).to.equal("action");
  });

  it("reports YAML syntax errors as offset spans", function () {
    const { doc: yDoc } = parseYamlTree("tests:\n  - steps: [ unclosed\n");
    const errors = yamlSyntaxErrors(yDoc);
    expect(errors.length).to.be.greaterThan(0);
    expect(errors[0].range).to.have.keys(["start", "end"]);
  });

  it("returns no action-keyed steps for a compact-form YAML spec", function () {
    const { doc: yDoc } = parseYamlTree("tests:\n  - steps:\n      - goTo: x\n");
    expect(findActionKeyedStepsYaml(yDoc)).to.have.length(0);
  });

  it("ignores non-map elements inside a YAML steps sequence", function () {
    const { doc: yDoc } = parseYamlTree("tests:\n  - steps:\n      - just-a-scalar\n");
    expect(findActionKeyedStepsYaml(yDoc)).to.have.length(0);
  });
});

describe("lsp — document model", function () {
  it("classifies URIs by extension", function () {
    expect(isJsonUri("file:///a/x.spec.json")).to.equal(true);
    expect(isJsonUri("file:///a/x.spec.yaml")).to.equal(false);
    expect(isYamlUri("file:///a/x.spec.yaml")).to.equal(true);
    expect(isYamlUri("file:///a/x.spec.yml")).to.equal(true);
    expect(isYamlUri("file:///a/x.spec.json")).to.equal(false);
  });

  it("builds a JSON or YAML model, or null for unsupported extensions", function () {
    expect(buildModel("file:///a/x.spec.json", "{}")).to.be.an("object");
    expect(buildModel("file:///a/x.spec.yaml", "tests: []")).to.be.an("object");
    expect(buildModel("file:///a/x.spec.txt", "whatever")).to.equal(null);
  });

  it("exposes value, syntax errors, ranges, and action-keyed steps uniformly", function () {
    const jsonModel = buildModel("file:///a/x.spec.json", '{"tests":[]}');
    expect(jsonModel.value).to.deep.equal({ tests: [] });
    expect(jsonModel.syntaxErrors).to.deep.equal([]);
    const yamlModel = buildModel("file:///a/x.spec.yaml", "tests: []");
    expect(yamlModel.value).to.deep.equal({ tests: [] });
  });

  it("handles an empty JSON buffer (no parse tree)", function () {
    const model = buildModel("file:///a/x.spec.json", "   ");
    expect(model.value).to.equal(undefined);
    expect(model.actionKeyedSteps()).to.deep.equal([]);
    expect(model.rangeForPath("/tests")).to.equal(null);
  });
});

describe("lsp — inline tests (markup fileTypes)", function () {
  const md = (text) => computeDiagnostics(doc("file:///a/doc.md", text));

  it("routes markup files by extension to the inline pipeline", function () {
    expect(fileTypeForUri("file:///a/doc.md")).to.be.an("object");
    expect(fileTypeForUri("file:///a/doc.adoc")).to.be.an("object");
    expect(fileTypeForUri("file:///a/doc.html")).to.be.an("object");
    expect(fileTypeForUri("file:///a/doc.dita")).to.be.an("object");
    expect(fileTypeForUri("file:///a/doc.txt")).to.equal(null);
    expect(fileTypeForUri("file:///a/x.spec.json")).to.equal(null);
  });

  it("stays silent on markup with no Doc Detective statements", function () {
    expect(md("# Just docs\n\nNothing to see.\n")).to.deep.equal([]);
  });

  it("returns no diagnostics for a valid inline test + step", function () {
    expect(
      md('<!-- test {"testId":"t1"} -->\n<!-- step {"goTo":"https://example.com"} -->\n<!-- test end -->\n'),
    ).to.deep.equal([]);
  });

  it("collapses an invalid step to one concise, action-scoped error", function () {
    const d = md('<!-- step {"goTo":123} -->\n');
    expect(d).to.have.length(1);
    expect(d[0].severity).to.equal(1);
    expect(d[0].message).to.match(/^goTo:/);
  });

  it("flags a step whose key is not a known action", function () {
    const d = md('<!-- step {"notAnAction":1} -->\n');
    expect(d).to.have.length(1);
    expect(d[0].message).to.match(/Not a recognized Doc Detective step/);
  });

  it("fires the flagship error on an invalid action-keyed inline step", function () {
    const d = md('<!-- step {"action":"madeUpAction"} -->\n');
    expect(d.some((x) => x.message === ACTION_KEYED_MESSAGE)).to.equal(true);
  });

  it("warns (not errors) on a valid legacy v2 inline step", function () {
    const d = md('<!-- step {"action":"goTo","url":"https://example.com"} -->\n');
    expect(d).to.have.length(1);
    expect(d[0].severity).to.equal(2);
    expect(d[0].code).to.equal("legacy-v2-step");
  });

  it("does not require steps/contexts on a test-open statement (relaxed)", function () {
    expect(md('<!-- test {"testId":"ok"} -->\n')).to.deep.equal([]);
  });

  it("accepts a fully valid test-open statement carrying inline steps", function () {
    expect(
      md('<!-- test {"testId":"ok","steps":[{"goTo":"https://example.com"}]} -->\n'),
    ).to.deep.equal([]);
  });

  it("still validates real fields in a test-open statement", function () {
    const d = md('<!-- test {"runOn":"notarray"} -->\n');
    expect(d.length).to.be.greaterThan(0);
    expect(d[0].message).to.match(/must be array/);
  });

  it("flags an unknown property in a test-open statement (steps/contexts still relaxed)", function () {
    const d = md('<!-- test {"testId":"ok","bogusField":1} -->\n');
    expect(d.some((x) => /bogusField|additional/i.test(x.message))).to.equal(true);
  });

  it("falls back to a generic step message when no attributable error exists", function () {
    // goTo's value is valid, but a bad sibling meta field (`variables`) makes
    // the step invalid with errors that aren't under `/goTo`.
    const d = md('<!-- step {"goTo":"https://example.com","variables":"notobj"} -->\n');
    expect(d).to.have.length(1);
    expect(d[0].message).to.match(/Invalid "goTo" step/);
  });

  it("skips statements inside an ignore block", function () {
    expect(
      md('<!-- test ignore start -->\n<!-- step {"goTo":123} -->\n<!-- test ignore end -->\n'),
    ).to.deep.equal([]);
  });

  it("ignores to end of document when an ignore block is never closed", function () {
    expect(md('<!-- test ignore start -->\n<!-- step {"goTo":123} -->\n')).to.deep.equal([]);
  });

  it("skips an inline statement whose payload does not parse to an object", function () {
    // `{bad json` can't be parsed → no crash, no diagnostic for that fragment.
    expect(md('<!-- step {bad json -->\n')).to.deep.equal([]);
    expect(md('<!-- test {bad json -->\n')).to.deep.equal([]);
  });

  it("tolerates a fileType missing inlineStatements/patterns (malformed config)", function () {
    // Defensive: a custom fileType with no inline statements yields nothing,
    // never throws. Exercises the `|| {}` / `|| []` / optional-chaining guards.
    const d = computeInlineDiagnostics(doc("file:///a/x.md", '<!-- step {"goTo":123} -->'), {});
    expect(d).to.deep.equal([]);
    const d2 = computeInlineDiagnostics(
      doc("file:///a/x.md", "x"),
      { inlineStatements: {} },
    );
    expect(d2).to.deep.equal([]);
  });

  it("works across asciidoc, html, and dita fileTypes", function () {
    const bad = '{"goTo":123}';
    expect(
      computeDiagnostics(doc("file:///a/d.adoc", `// (step ${bad})\n`)).length,
    ).to.be.greaterThan(0);
    expect(
      computeDiagnostics(doc("file:///a/d.html", `<!-- step ${bad} -->\n`)).length,
    ).to.be.greaterThan(0);
    expect(
      computeDiagnostics(doc("file:///a/d.dita", `<!-- step ${bad} -->\n`)).length,
    ).to.be.greaterThan(0);
  });
});

describe("lsp — review hardening", function () {
  it("gate: refuses to classify malformed JSON by content sniff", function () {
    // A partial buffer jsonc can still coerce to {tests:[]} must NOT be treated
    // as a spec when the filename didn't already say so.
    expect(classifyDocument({ uri: "file:///a/thing.json", text: '{"tests":[],' })).to.equal(null);
    // But a filename-classified spec is still handled (syntax errors shown there).
    expect(classifyDocument({ uri: "file:///a/foo.spec.json", text: '{"tests":[],' })).to.equal("spec");
  });

  it("yaml: an alias bomb surfaces an error instead of crashing", function () {
    // Classic "billion laughs": a non-empty leaf doubled each level blows past
    // the yaml lib's maxAliasCount weighting; toJS throws.
    const lines = ['a0: &a0 "lol"'];
    for (let i = 1; i <= 15; i++) lines.push(`a${i}: &a${i} [*a${i - 1}, *a${i - 1}]`);
    const bomb = lines.join("\n");
    const parsed = parseYamlTree(bomb);
    expect(parsed.value).to.equal(undefined);
    expect(parsed.valueError).to.be.a("string").with.length.greaterThan(0);
    // End to end: it becomes a diagnostic, not a thrown exception.
    const d = computeDiagnostics(doc("file:///a/foo.spec.yaml", bomb));
    expect(d.some((x) => /YAML error/.test(x.message))).to.equal(true);
  });

  it("completion: quotes string field placeholders, leaves numeric bare", function () {
    const { doc: d, position } = markerPos('{"tests":[{"steps":[{"find":{§}}]}]}');
    const items = computeCompletions(d, position);
    const text = (i) => (i.textEdit ? i.textEdit.newText : i.insertText);
    const selector = items.find((i) => i.label === "selector");
    const timeout = items.find((i) => i.label === "timeout");
    expect(text(selector)).to.equal('"selector": "$1"'); // string → quoted
    expect(text(timeout)).to.equal('"timeout": $1'); // number → bare
  });

  it("inline: zero-width regex patterns terminate instead of hanging", function () {
    // `x?` / `(x?)` match the empty string at every position; without the
    // lastIndex nudge these would loop forever.
    const offsets = collectMatchOffsets("abc", ["x?"]);
    expect(offsets).to.deep.equal([0, 1, 2, 3]);
    const stmts = extractStatements("abc", ["(x?)"], []);
    expect(stmts).to.have.length(4);
  });
});

describe("lsp — server wiring", function () {
  function fakes(docStore = new Map()) {
    const sent = [];
    let initResult;
    const handlers = {};
    const connection = {
      onInitialize(handler) {
        initResult = handler();
      },
      sendDiagnostics(params) {
        sent.push(params);
      },
      onCompletion(handler) {
        handlers.completion = handler;
      },
      onHover(handler) {
        handlers.hover = handler;
      },
    };
    const documents = {
      onDidChangeContent(handler) {
        handlers.change = handler;
      },
      onDidClose(handler) {
        handlers.close = handler;
      },
      get(uri) {
        return docStore.get(uri);
      },
    };
    return { connection, documents, handlers, sent, docStore, getInit: () => initResult };
  }

  it("advertises full text sync, completion, and hover on initialize", function () {
    const f = fakes();
    registerHandlers(f.connection, f.documents);
    const caps = f.getInit().capabilities;
    expect(caps.textDocumentSync).to.equal(1); // Full
    expect(caps.completionProvider).to.be.an("object");
    expect(caps.hoverProvider).to.equal(true);
  });

  it("routes completion + hover requests to the open document", function () {
    const store = new Map();
    const uri = "file:///a/foo.spec.json";
    const text = '{"tests":[{"steps":[{"goTo":"https://x.com"}]}]}';
    store.set(uri, doc(uri, text));
    const f = fakes(store);
    registerHandlers(f.connection, f.documents);
    // key position inside the step object (just after the opening `{`)
    const completions = f.handlers.completion({
      textDocument: { uri },
      position: { line: 0, character: 21 },
    });
    expect(completions.length).to.be.greaterThan(0);
    // hover on the action key routes to a real result
    const hover = f.handlers.hover({
      textDocument: { uri },
      position: { line: 0, character: text.indexOf("goTo") + 1 },
    });
    expect(hover).to.not.equal(null);
    expect(hover.contents.value).to.contain("goTo");
    // hover on an unknown doc returns null
    expect(
      f.handlers.hover({ textDocument: { uri: "file:///nope.spec.json" }, position: { line: 0, character: 0 } }),
    ).to.equal(null);
    // completion on an unknown doc returns []
    expect(
      f.handlers.completion({ textDocument: { uri: "file:///nope.spec.json" }, position: { line: 0, character: 0 } }),
    ).to.deep.equal([]);
  });

  it("publishes diagnostics on content change", function () {
    const f = fakes();
    registerHandlers(f.connection, f.documents);
    f.handlers.change({ document: doc("file:///a/foo.spec.json", "{}") });
    expect(f.sent).to.have.length(1);
    expect(f.sent[0].uri).to.equal("file:///a/foo.spec.json");
    expect(f.sent[0].diagnostics.length).to.be.greaterThan(0);
  });

  it("clears diagnostics on close", function () {
    const f = fakes();
    registerHandlers(f.connection, f.documents);
    f.handlers.close({ document: doc("file:///a/foo.spec.json", "{}") });
    expect(f.sent).to.have.length(1);
    expect(f.sent[0].diagnostics).to.deep.equal([]);
  });
});

describe("lsp — command module", function () {
  it("registers as the `lsp` subcommand", function () {
    expect(lspCommand.command).to.equal("lsp");
    expect(lspCommand.describe).to.be.a("string").with.length.greaterThan(0);
  });

  it("declares a --stdio option defaulting to true", function () {
    const recorded = {};
    const fakeYargs = {
      option(name, cfg) {
        recorded[name] = cfg;
        return fakeYargs;
      },
    };
    lspCommand.builder(fakeYargs);
    expect(recorded.stdio).to.be.an("object");
    expect(recorded.stdio.default).to.equal(true);
    expect(recorded.stdio.type).to.equal("boolean");
  });
});

describe("lsp — protocol (spawned server end-to-end)", function () {
  this.timeout(20000);

  // Drive a spawned LSP server over stdio: initialize → didOpen an
  // action-keyed spec → assert the flagship diagnostic is published.
  function drivesFlagshipDiagnostic(spawnCmd, spawnArgs, done) {
    const child = spawn(spawnCmd, spawnArgs, {
      env: { ...process.env, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = Buffer.alloc(0);
    let stderr = "";
    let settled = false;

    // Helper-owned watchdog: if the server never publishes the expected
    // diagnostic, fail fast (and kill the child) instead of leaking the process
    // until Mocha's suite timeout fires.
    const watchdog = setTimeout(() => {
      finish(new Error(`server never published expected diagnostic; stderr:\n${stderr}`));
    }, 12000);

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      done(err);
    }

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    // A server that exits before publishing is a failure, not a hang.
    child.on("close", (code) => {
      finish(new Error(`server exited early (code ${code}); stderr:\n${stderr}`));
    });

    // If the server dies mid-write, stdin emits EPIPE on the stream itself,
    // which bypasses child.on("error") — route it through the same failure path.
    child.stdin.on("error", finish);

    function send(message) {
      const json = JSON.stringify(message);
      const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
      child.stdin.write(payload);
    }

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Parse as many complete LSP messages as are buffered.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd).toString("utf8");
        const match = /Content-Length: (\d+)/i.exec(header);
        if (!match) break;
        const length = Number(match[1]);
        const start = headerEnd + 4;
        if (buffer.length < start + length) break;
        const body = buffer.slice(start, start + length).toString("utf8");
        buffer = buffer.slice(start + length);
        let msg;
        try {
          msg = JSON.parse(body);
        } catch {
          continue;
        }
        if (
          msg.method === "textDocument/publishDiagnostics" &&
          msg.params?.uri?.endsWith("foo.spec.json")
        ) {
          try {
            const messages = msg.params.diagnostics.map((d) => d.message);
            expect(messages).to.include(ACTION_KEYED_MESSAGE);
            finish();
          } catch (err) {
            finish(err);
          }
        }
      }
    });

    child.on("error", finish);

    // initialize → initialized → didOpen
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { processId: process.pid, rootUri: null, capabilities: {} } });
    send({ jsonrpc: "2.0", method: "initialized", params: {} });
    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: "file:///tmp/foo.spec.json",
          languageId: "doc-detective-spec",
          version: 1,
          text: ACTION_KEYED_SPEC,
        },
      },
    });
  }

  it("initializes and publishes the action-keyed diagnostic via `doc-detective lsp`", function (done) {
    drivesFlagshipDiagnostic(process.execPath, [CLI, "lsp", "--stdio"], done);
  });

  it("starts the same server via the bare `doc-detective-lsp` bin", function (done) {
    drivesFlagshipDiagnostic(process.execPath, [LSP_BIN], done);
  });
});
