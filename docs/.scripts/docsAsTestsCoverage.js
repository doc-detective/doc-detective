// Reports which authoring features the docs-as-tests reference examples in
// fern/pages/reference/docs-as-tests/examples/ don't show yet.
//
// It walks the v3 schemas for every field a user can write: spec, test,
// context, and step fields, each action and its options, routing, and
// assertions, plus the config keys in AUTHORING_CONFIG_KEYS. Each schema file
// a `$ref` reaches is walked once and reported on its own, so a shared object,
// such as `annotationDefaults`, counts once rather than at every place that
// uses it. A field that accepts more than one type, such as `goTo` as a string
// or an object, needs an example of each form. Result-only, read-only, and
// deprecated fields don't count.
//
// A field is covered when an example uses it: in a standalone spec, in a
// test or step that `doc-detective run --dry-run` resolves from a detected or
// inline file, or in an example's own doc-detective.json. Forms a field walk
// can't see, such as a statement syntax, are needles in
// docs-as-tests-features.yaml that must appear in some example file.
//
// Run with `npm run docs:coverage-docs-as-tests` after `npm run build`.
// `-- --check` exits 1 on any gap, and `-- --json` prints the report as JSON.

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { groupByConfig, dryRun, listExampleFiles, examplesDir } = require("./checkDocsAsTests.js");

const schemasDir = path.resolve(__dirname, "../../src/common/src/schemas/src_schemas");
const featuresFile = path.join(__dirname, "docs-as-tests-features.yaml");

const ENTRY_FILES = ["spec_v3", "test_v3", "context_v3", "step_v3", "config_v3"].map((n) => `${n}.schema.json`);

// Config keys that change what a test does or how it's written. The rest,
// such as reporters, logLevel, and integrations, run or report tests.
// `beforeAny` is left out: it's the deprecated alias of `beforeAll`.
const AUTHORING_CONFIG_KEYS = [
  "detectSteps", "fileTypes", "allowUnsafeSteps", "resolveIncludes", "processDitaMaps", "loadVariables",
  "publicVariables", "origin", "originParams", "beforeAll", "afterAll", "runOn", "autoScreenshot",
  "autoRecord", "annotationDefaults", "overwriteScreenshots", "browserFallback", "retries",
];

// Fields that results fill in, or that the runner sets, rather than authors.
const RESULT_KEYS = new Set([
  "$schema", "durationMs", "startedAt", "autoScreenshotPath", "attempts", "visit", "location", "contentPath", "specPath",
  // Not marked readOnly, but their descriptions say Doc Detective sets them.
  "outputs", "sourceIntegration",
]);

const rootName = (file) => path.basename(file).replace(/_v3\.schema\.json$/, "").replace(/\.schema\.json$/, "");
const rootKey = ({ file, pointer }) => rootName(file) + (pointer && pointer !== "/" ? `#${pointer.split("/").pop()}` : "");
const join = (base, key) => (base ? `${base}.${key}` : key);
const jsonType = (t) => (t === "integer" ? "number" : t);
const valueType = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

function splitRef(ref, currentFile) {
  const [file, pointer = ""] = ref.split("#");
  return { file: file || currentFile, pointer };
}

function resolvePointer(schema, pointer) {
  return pointer
    .split("/")
    .filter(Boolean)
    .reduce((node, part) => node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
}

/** Follows `$ref`s from `node` and reports whether any step on the way is read-only or deprecated. */
function isHidden(node, file, load, seen = new Set()) {
  if (!node || typeof node !== "object") return false;
  if (node.readOnly || node.deprecated) return true;
  if (!node.$ref) return false;
  const ref = splitRef(node.$ref, file);
  const key = `${ref.file}#${ref.pointer}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return isHidden(resolvePointer(load(ref.file), ref.pointer), ref.file, load, seen);
}

/** Walks one schema node. A `$ref` into another file ends the walk there and is recorded as a boundary. */
function walkRoot({ file, pointer }, load) {
  const fields = {};
  const itemTypes = {};
  const boundaries = {};
  const targets = {};
  const types = new Set();
  const addType = (p, t) => {
    if (t === "null") return;
    const set = p === "" ? types : p.endsWith("[]") ? (itemTypes[p] ||= new Set()) : (fields[p] ||= new Set());
    set.add(jsonType(t));
  };

  // `p` is where the node's own types go; array items add `[]` to it.
  // `parent` is where its properties go, without `[]`, so `browsers.name`
  // covers both a `browsers` object and a `browsers` array of objects.
  function walk(node, current, p, parent, stack) {
    if (!node || typeof node !== "object") return;
    if (node.$ref) {
      const ref = splitRef(node.$ref, current);
      if (ref.file !== current) {
        const key = rootKey(ref);
        targets[key] = ref;
        const list = (boundaries[p] ||= []);
        if (!list.includes(key)) list.push(key);
        if (p.endsWith("[]")) itemTypes[p] ||= new Set();
      } else {
        const key = `${ref.file}#${ref.pointer}`;
        if (!stack.includes(key)) walk(resolvePointer(load(ref.file), ref.pointer), ref.file, p, parent, [...stack, key]);
      }
    }
    for (const t of [].concat(node.type || [])) addType(p, t);
    if (!node.type && (node.enum || "const" in node)) for (const v of node.enum || [node.const]) addType(p, valueType(v));
    if (!node.type && node.properties) addType(p, "object");
    for (const branch of [...(node.anyOf || []), ...(node.oneOf || []), ...(node.allOf || [])]) walk(branch, current, p, parent, stack);
    for (const [key, sub] of Object.entries(node.properties || {})) {
      if (RESULT_KEYS.has(key) || key.startsWith("result") || isHidden(sub, current, load)) continue;
      const child = join(parent, key);
      fields[child] ||= new Set();
      walk(sub, current, child, child, stack);
    }
    if (node.items && typeof node.items === "object" && !Array.isArray(node.items)) {
      walk(node.items, current, `${parent}[]`, parent, stack);
    }
  }

  walk(resolvePointer(load(file), pointer), file, "", "", [`${file}#${pointer}`]);
  return { fields, itemTypes, boundaries, targets, types };
}

/**
 * Walks the entry schema files and every schema they reach, each once.
 * Returns `fields`, each authorable property path per schema with the JSON
 * types it accepts, and `boundaries`, the paths whose value continues in
 * another schema. Array items add `[]` to a path. `keep(schema, path)` drops
 * top-level fields, and the schemas only they reach.
 */
function walkSchema(entries, load, keep = () => true) {
  const walked = {};
  const queue = entries.map((file) => ({ file, pointer: "" }));
  while (queue.length) {
    const target = queue.shift();
    const key = rootKey(target);
    if (walked[key]) continue;
    const root = (walked[key] = walkRoot(target, load));
    const kept = (p) => p === "" || keep(key, p.split(/\.|\[\]/)[0]);
    for (const p of Object.keys(root.fields)) if (!kept(p)) delete root.fields[p];
    for (const p of Object.keys(root.itemTypes)) if (!kept(p)) delete root.itemTypes[p];
    for (const p of Object.keys(root.boundaries)) if (!kept(p)) delete root.boundaries[p];
    for (const nexts of Object.values(root.boundaries)) for (const next of nexts) queue.push(root.targets[next]);
  }
  // A field that continues in another schema takes that schema's types. Repeat until nothing changes.
  for (let changed = true; changed; ) {
    changed = false;
    for (const root of Object.values(walked)) {
      for (const [p, nexts] of Object.entries(root.boundaries)) {
        const set = p === "" ? root.types : p.endsWith("[]") ? root.itemTypes[p] : (root.fields[p] ||= new Set());
        for (const t of nexts.flatMap((next) => [...walked[next].types])) {
          if (!set.has(t)) {
            set.add(t);
            changed = true;
          }
        }
      }
    }
  }
  const fields = {};
  const boundaries = {};
  for (const [key, root] of Object.entries(walked)) {
    // An array's items count as a field of their own only when they take more than one form.
    for (const [p, set] of Object.entries(root.itemTypes)) if (set.size > 1) root.fields[p] = set;
    fields[key] = Object.fromEntries(Object.entries(root.fields).map(([p, set]) => [p, [...set].sort()]));
    boundaries[key] = root.boundaries;
  }
  return { fields, boundaries };
}

/**
 * Adds `<schema>:<path>` → [types] for every path `value` uses, with paths
 * shaped as walkSchema's, following boundaries into other schemas.
 */
// ponytail: a value at a boundary with several target schemas (an anyOf of
// descriptors) counts toward each of them, so a key two descriptors share is
// covered in both by one example. Route by matching keys if that hides gaps.
function collectUsage(value, root, boundaries, usage, p = "", parent = p) {
  for (const next of boundaries[root]?.[p] || []) collectUsage(value, next, boundaries, usage);
  const record = (child, childParent, v) => {
    const key = `${root}:${child}`;
    usage[key] = [...new Set([...(usage[key] || []), valueType(v)])].sort();
    collectUsage(v, root, boundaries, usage, child, childParent);
  };
  if (Array.isArray(value)) for (const item of value) record(`${parent}[]`, parent, item);
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) record(join(parent, key), join(parent, key), v);
  }
  return usage;
}

/** Compares walked fields with usage. Each form of a multi-type field counts once. */
function findGaps(fieldsByRoot, usage) {
  let total = 0;
  let covered = 0;
  const gaps = {};
  for (const [root, fields] of Object.entries(fieldsByRoot)) {
    for (const [p, types] of Object.entries(fields)) {
      const used = usage[`${root}:${p}`] || [];
      const forms = types.length > 1 ? types : [null];
      for (const form of forms) {
        total++;
        if (form ? used.includes(form) : used.length) covered++;
        else (gaps[root] ||= []).push(form ? `${p} (${form})` : p);
      }
    }
  }
  return { total, covered, gaps };
}

function needleMatcher(needle) {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(needle);
  if (m) {
    const re = new RegExp(m[1], m[2]);
    return (text) => re.test(text);
  }
  return (text) => text.includes(needle);
}

/**
 * Returns the features whose needle appears in none of `docs` ({ file, text }).
 * A feature's optional `files` regex limits the search to matching paths.
 */
function findMissingNeedles(features, docs) {
  return features.filter((f) => {
    const match = needleMatcher(String(f.needle));
    const files = f.files ? new RegExp(f.files) : null;
    return !docs.some((d) => (!files || files.test(d.file.replace(/\\/g, "/"))) && match(d.text));
  });
}

function loadSchema(file) {
  return JSON.parse(fs.readFileSync(path.join(schemasDir, file), "utf8"));
}

function schemaFields() {
  const configProps = loadSchema("config_v3.schema.json").properties;
  const missing = AUTHORING_CONFIG_KEYS.filter((k) => !configProps[k] || configProps[k].deprecated);
  if (missing.length) throw new Error(`Couldn't find config keys in config_v3: ${missing.map((k) => `\`${k}\``).join(", ")}.`);
  return walkSchema(ENTRY_FILES, loadSchema, (root, key) => root !== "config" || AUTHORING_CONFIG_KEYS.includes(key));
}

// The resolver adds these to every test, so a dry run can't tell whether an
// author wrote them. Standalone specs, read as written, cover them instead.
const RESOLVER_TEST_KEYS = ["contexts", "runOn", "openApi", "contentPath", "location"];

function corpusUsage(boundaries, problems) {
  // Generated `_variants.mdx` files repeat the examples, and folders hold run output.
  const files = listExampleFiles().filter((f) => !path.basename(f).startsWith("_") && fs.statSync(f).isFile());
  const usage = {};

  for (const file of files.filter((f) => /^standalone\.spec\.(json|ya?ml)$/.test(path.basename(f)))) {
    try {
      collectUsage(YAML.parse(fs.readFileSync(file, "utf8")), "spec", boundaries, usage);
    } catch (error) {
      problems.push(`Couldn't parse ${file}: ${error.message}`);
    }
  }

  const tested = files.filter((f) => /^(detected|inline|standalone)\./.test(path.basename(f)));
  for (const [config, inputs] of groupByConfig(tested, path.join(examplesDir, ".doc-detective.json"))) {
    let specs = [];
    try {
      specs = dryRun(inputs, config);
    } catch (error) {
      problems.push(`Couldn't resolve the examples that use ${config}: ${String(error.stderr || error.message).trim()}`);
    }
    for (const spec of specs) {
      for (const test of spec.tests || []) {
        const authored = { ...test, steps: test.contexts?.[0]?.steps || [] };
        for (const key of RESOLVER_TEST_KEYS) delete authored[key];
        collectUsage(authored, "test", boundaries, usage);
      }
    }
  }

  for (const file of files.filter((f) => path.basename(f) === "doc-detective.json")) {
    try {
      collectUsage(JSON.parse(fs.readFileSync(file, "utf8")), "config", boundaries, usage);
    } catch (error) {
      problems.push(`Couldn't parse ${file}: ${error.message}`);
    }
  }

  const docs = files.map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));
  return { usage, docs };
}

function main() {
  const problems = [];
  const { fields, boundaries } = schemaFields();
  const { usage, docs } = corpusUsage(boundaries, problems);
  const coverage = findGaps(fields, usage);
  const features = YAML.parse(fs.readFileSync(featuresFile, "utf8")).features || [];
  const missing = findMissingNeedles(features, docs);
  const gapCount = coverage.total - coverage.covered + missing.length;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      fields: { total: coverage.total, covered: coverage.covered, gaps: coverage.gaps },
      features: { total: features.length, covered: features.length - missing.length, gaps: missing },
      problems,
    }, null, 2));
  } else {
    for (const [root, gaps] of Object.entries(coverage.gaps)) {
      console.log(`${root} (${gaps.length} not shown):`);
      for (const gap of gaps) console.log(`  ${gap}`);
    }
    if (missing.length) {
      console.log(`features (${missing.length} not shown):`);
      for (const f of missing) console.log(`  ${f.id} (${f.since}): ${f.needle}`);
    }
    for (const problem of problems) console.error(problem);
    console.log(
      `Examples show ${coverage.covered} of ${coverage.total} schema fields and forms, ` +
        `and ${features.length - missing.length} of ${features.length} features.`
    );
  }
  if (process.argv.includes("--check") && (gapCount || problems.length)) process.exit(1);
}

if (require.main === module) main();

module.exports = { walkSchema, collectUsage, findGaps, findMissingNeedles, AUTHORING_CONFIG_KEYS };
