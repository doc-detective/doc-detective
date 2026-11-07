// Every fenced json/yaml example in the docs validates against doc-detective-common.
// Blocks are classified by shape; anything unrecognized (workflow YAML, fragments,
// output samples, markup templates) is skipped. A fence whose info string carries
// `invalid` (```json invalid) is a deliberate counter-example and is skipped too.
// Kept small on purpose: sibling repos copy the core of this file.
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { validate, schemas, stepActions } from "../dist/common/src/index.js";

// fs.globSync needs Node 22+ (CI runs 24+).
const FILES = [...fs.globSync("docs/fern/pages/**/*.mdx"), "README.md", "src/common/README.md"];
const configKeys = new Set(Object.keys(schemas.config_v3.properties));
const stepKeys = new Set(Object.keys(schemas.step_v3.properties)); // actions + step-level keys
const isAction = (key) => stepActions.includes(key);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function classify(object) {
  if (!isObject(object)) return null;
  const keys = Object.keys(object);
  if (keys.includes("tests")) return "spec_v3";
  if (Array.isArray(object.steps) && object.steps.some((s) => isObject(s) && Object.keys(s).some(isAction))) return "test_v3";
  // Only step-level keys, including an action. Sub-objects that happen to carry an action-named
  // key (a find object's `click`, a file type's `runShell`) aren't steps. Two actions still
  // classify as a step, so validation rejects them.
  if (keys.some(isAction) && keys.every((k) => stepKeys.has(k))) return "step_v3";
  if (keys.length > 0 && keys.every((k) => configKeys.has(k))) return "config_v3";
  return null;
}

function* fencedBlocks(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  // `\1` makes the closing fence match the opening fence's indentation.
  for (const m of text.matchAll(/^([ \t]*)```(json|ya?ml)([^\n]*)\n([\s\S]*?)^\1```/gm)) {
    const [, indent, lang, info, body] = m;
    const line = text.slice(0, m.index).split("\n").length;
    yield { where: `${file}:${line}`, lang, info, body: body.replace(new RegExp(`^${indent}`, "gm"), "") };
  }
}

function checkDocExamples() {
  const counts = { checked: 0, skipped: 0 };
  const failures = [];
  for (const file of FILES) {
    for (const { where, lang, info, body } of fencedBlocks(file)) {
      let object;
      try {
        object = lang === "json" ? JSON.parse(body) : YAML.parse(body);
      } catch {
        object = undefined; // A fragment, not a whole document.
      }
      let schemaKey = /\binvalid\b/.test(info) ? null : classify(object);
      // A step with `"$1"` values is a markup action template, not a step.
      if (schemaKey === "step_v3" && /"\$\d+"/.test(body)) schemaKey = null;
      if (!schemaKey) {
        counts.skipped++;
        continue;
      }
      counts.checked++;
      const result = validate({ schemaKey, object });
      if (!result.valid) failures.push(`${where} (${schemaKey}): ${result.errors}`);
    }
  }
  return { ...counts, failures };
}

describe("doc examples", function () {
  it("classifies a two-action step as a step, so validation rejects it", function () {
    assert.equal(classify({ goTo: "https://example.com", find: "Welcome" }), "step_v3");
    // null: `elementText` isn't a step-level key, so the every-key-is-a-step-key guard fails.
    assert.equal(classify({ elementText: "Welcome", click: true }), null);
  });

  it("every json/yaml example validates against doc-detective-common", function () {
    const { checked, skipped, failures } = checkDocExamples();
    console.log(`      ${checked} checked, ${skipped} skipped, ${failures.length} invalid`);
    assert.ok(checked > 0, "no examples were checked; is the glob right?");
    assert.deepEqual(failures, []);
  });

  // Core only (not part of the copy): the concepts page lists every action.
  it("concepts.mdx has a row for every step action", function () {
    const concepts = fs.readFileSync("docs/fern/pages/docs/get-started/concepts.mdx", "utf8");
    const missing = stepActions.filter((a) => !concepts.includes(`| [${a}](/docs/actions/${a.toLowerCase()})`));
    assert.deepEqual(missing, []);
  });
});
