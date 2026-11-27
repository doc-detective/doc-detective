// Reports which authoring features the docs-as-tests reference examples in
// docs-as-tests/examples/ don't show yet.
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
  const via = Object.fromEntries(Object.keys(walked).map((key) => [key, []]));
  for (const [key, root] of Object.entries(walked)) {
    // An array's items count as a field of their own only when they take more than one form.
    for (const [p, set] of Object.entries(root.itemTypes)) if (set.size > 1) root.fields[p] = set;
    fields[key] = Object.fromEntries(Object.entries(root.fields).map(([p, set]) => [p, [...set].sort()]));
    boundaries[key] = root.boundaries;
    for (const [p, nexts] of Object.entries(root.boundaries)) {
      for (const next of nexts) if (next !== key && !entries.some((f) => rootKey({ file: f }) === next)) via[next].push(p === "" || p.startsWith("[]") ? key + p : join(key, p));
    }
  }
  return { fields, boundaries, via };
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

const LOCATOR_KEYS = new Set([
  "selector", "elementText", "elementId", "elementTestId", "elementClass", "elementAttribute", "elementAria", "elementImage",
]);
const STYLE_KEYS = new Set([
  "color", "background", "strokeWidth", "fontSize", "fontFamily", "opacity", "radius", "padding", "maxWidth", "intensity",
]);
const ANNOTATION_KINDS = new Set(["outline", "arrow", "badge", "callout", "blur", "text"]);

/**
 * Returns the shared key a field collapses onto, as `<family>:<key>`, or
 * null for a field that counts on its own. One concept that many places
 * accept, such as an element locator, an annotation style, or a surface
 * selector, counts once, covered by an example of it anywhere.
 * `rootFields` is the field map of `root`, used to spot a locator's `timeout`.
 */
function canonicalKey(root, p, rootFields = {}) {
  if (root === "config") return null;
  const segs = p.split(".");
  const leaf = segs[segs.length - 1].replace(/\[\]$/, "");
  const parent = segs.slice(0, -1).join(".");
  const sibling = (key) => join(parent, key) in rootFields;
  if (LOCATOR_KEYS.has(leaf)) return `locator:${leaf}`;
  if (leaf === "timeout" && (sibling("selector") || sibling("elementText"))) return "locator:timeout";
  if (root.startsWith("annotation")) {
    const at = segs.indexOf("position");
    if (at >= 0) return `position:${segs.slice(at + 1).join(".") || "position"}`;
    if (STYLE_KEYS.has(leaf)) return `style:${leaf}`;
    if (root === "annotationDefaults" && segs.length === 1 && ANNOTATION_KINDS.has(leaf)) return "style:per-kind block";
  }
  if (root.startsWith("surface") && (segs[0] === "window" || segs[0] === "tab")) return `surface:${p}`;
  if (leaf === "surface") return "surface:surface";
  return null;
}

/**
 * Compares walked fields with usage. Each form of a multi-type field counts
 * once. Fields that `canon(root, path)` maps to the same shared key count
 * once together, reported under `shared:<family>`; `shared` counts the
 * collapsed fields per schema.
 */
function findGaps(fieldsByRoot, usage, canon = () => null) {
  const { units, shared } = buildUnits(fieldsByRoot, canon);
  let total = 0;
  let covered = 0;
  const gaps = {};
  for (const unit of units) {
    const used = usedForms(unit, usage);
    const where = unit.shared ? ` — in ${unit.roots.join(", ")}` : "";
    for (const form of unit.forms) {
      total++;
      if (form ? used.has(form) : used.size) covered++;
      else (gaps[unit.group] ||= []).push(`${form ? `${unit.label} (${form})` : unit.label}${where}`);
    }
  }
  return { total, covered, gaps, shared };
}

/**
 * Groups fields into counting units: one per field, or one per shared key
 * that `canon` collapses fields onto. Each unit has its report `group` and
 * `label`, the `members` (`<schema>:<path>`) it covers, and its `forms`
 * (`[null]` when it takes one type). `shared` counts collapsed fields per schema.
 */
function buildUnits(fieldsByRoot, canon = () => null) {
  const byId = new Map();
  const shared = {};
  for (const [root, fields] of Object.entries(fieldsByRoot)) {
    for (const [p, types] of Object.entries(fields)) {
      const key = canon(root, p);
      if (key) shared[root] = (shared[root] || 0) + 1;
      const id = key || `${root}:${p}`;
      if (!byId.has(id)) {
        const [group, label] = key ? [`shared:${key.split(":")[0]}`, key.slice(key.indexOf(":") + 1)] : [root, p];
        byId.set(id, { group, label, shared: Boolean(key), types: new Set(), roots: new Set(), members: [] });
      }
      const unit = byId.get(id);
      for (const t of types) unit.types.add(t);
      unit.roots.add(root);
      unit.members.push(`${root}:${p}`);
    }
  }
  const units = [...byId.values()].map((u) => {
    const types = [...u.types].sort();
    return { ...u, roots: [...u.roots].sort(), forms: types.length > 1 ? types : [null] };
  });
  return { units, shared };
}

const usedForms = (unit, usage) => new Set(unit.members.flatMap((m) => usage[m] || []));

const PAGE_BASE = "/reference/docs-as-tests";

/** Slugs a heading the way the docs site anchors it. */
function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ +/g, "-");
}

/**
 * Maps each example ID to the page section that includes its
 * `examples/<id>/_variants.mdx`: `pages` is [{ slug, text }], and the anchor
 * is the nearest H2 or H3 above the include.
 */
function mapExamplesToPages(pages) {
  const map = {};
  for (const { slug, text } of pages) {
    let anchor = "";
    for (const line of text.split(/\r?\n/)) {
      const heading = /^#{2,3} (.+)$/.exec(line);
      if (heading) anchor = slugify(heading[1]);
      const include = /examples\/([^/]+)\/_variants\.mdx/.exec(line);
      if (include && !map[include[1]]) map[include[1]] = `${PAGE_BASE}/${slug}${anchor ? `#${anchor}` : ""}`;
    }
  }
  return map;
}

/**
 * Builds the examples-by-feature index: `<group>.<field> (<form>)` → the
 * examples that use that field in that form, as [{ example, page }] sorted
 * by example. `usageByExample` holds each example's usage, `pages` maps
 * example to page section, and `extra` adds keys found another way, such as
 * feature needles.
 */
function buildIndex(fieldsByRoot, usageByExample, canon, pages, extra = {}) {
  const entry = (example) => ({ example, page: pages[example] || null });
  const index = {};
  const examples = Object.keys(usageByExample).sort();
  for (const unit of buildUnits(fieldsByRoot, canon).units) {
    for (const form of unit.forms) {
      const users = examples.filter((ex) => {
        const used = usedForms(unit, usageByExample[ex]);
        return form ? used.has(form) : used.size > 0;
      });
      if (users.length) index[`${unit.group}.${form ? `${unit.label} (${form})` : unit.label}`] = users.map(entry);
    }
  }
  for (const [key, users] of Object.entries(extra)) if (users.length) index[key] = [...users].sort().map(entry);
  return index;
}

const sortedKeys = (index) => Object.keys(index).sort((a, b) => a.localeCompare(b, "en"));

function renderIndexJson(index) {
  return JSON.stringify(Object.fromEntries(sortedKeys(index).map((k) => [k, index[k]])), null, 2) + "\n";
}

function renderIndexMdx(index) {
  const groups = new Map();
  for (const key of sortedKeys(index)) {
    const dot = key.indexOf(".");
    const group = key.slice(0, dot);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([key.slice(dot + 1), index[key]]);
  }
  const lines = [
    "---",
    "title: Examples by feature",
    "sidebar-title: Examples by feature",
    "description: Every field and form the docs-as-tests examples use, with links to the examples that use it.",
    "---",
    "",
    "{/* Generated by `npm run docs:coverage-docs-as-tests -- --write-index`. Don't edit by hand. */}",
    "",
    "Look up a field or form to find each example that uses it.",
    "Groups follow the schemas.",
    "A `shared:` group holds a key that many actions share, such as an element locator.",
    "The `features` group holds statement forms and other patterns, listed in `docs/.scripts/docs-as-tests-features.yaml`.",
    "",
    // The tables are long lists of example IDs, which the prose linter reads as run-on sentences.
    "{/* vale off */}",
    "",
  ];
  for (const [group, rows] of groups) {
    lines.push(`## \`${group}\``, "", "| Field | Examples |", "|---|---|");
    for (const [field, users] of rows) {
      const links = users.map((u) => (u.page ? `[${u.example}](${u.page})` : u.example)).join(", ");
      lines.push(`| \`${field}\` | ${links} |`);
    }
    lines.push("");
  }
  lines.push("{/* vale on */}", "");
  return lines.join("\n");
}

/**
 * Splits `gaps` by the `known` list ({ key, reason }), whose keys read
 * `<group>.<gap>` as the report prints them, without a shared key's
 * `— in …` suffix. Returns the `unknown` gaps by group, the `known` entries
 * still open, and the `stale` entries whose gap is now covered.
 */
function splitKnownGaps(gaps, known) {
  const keys = new Set(known.map((k) => k.key));
  const open = new Set();
  const unknown = {};
  for (const [group, list] of Object.entries(gaps)) {
    for (const gap of list) {
      const key = `${group}.${gap.replace(/ — in .*$/, "")}`;
      if (keys.has(key)) open.add(key);
      else (unknown[group] ||= []).push(gap);
    }
  }
  return {
    unknown,
    known: known.filter((k) => open.has(k.key)),
    stale: known.filter((k) => !open.has(k.key)),
  };
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
  // assertion_v3 describes result records; authored `assertions` are strings.
  return walkSchema(
    ENTRY_FILES,
    loadSchema,
    (root, key) => root !== "assertion" && (root !== "config" || AUTHORING_CONFIG_KEYS.includes(key))
  );
}

// The resolver adds these to every test, so a dry run can't tell whether an
// author wrote them. Standalone specs, read as written, cover them instead.
const RESOLVER_TEST_KEYS = ["contexts", "runOn", "openApi", "contentPath", "location"];

function corpusUsage(boundaries, problems) {
  // `_` partials repeat what the variants that include them show, and folders hold run output.
  const files = listExampleFiles().filter((f) => !path.basename(f).startsWith("_") && fs.statSync(f).isFile());
  // Usage is kept per example, so the feature index can name who uses each field.
  const usageByExample = {};
  const exampleOf = (file) => path.relative(examplesDir, path.resolve(file)).split(path.sep)[0];
  const usageOf = (file) => (usageByExample[exampleOf(file)] ||= {});

  for (const file of files.filter((f) => /^standalone\.spec\.(json|ya?ml)$/.test(path.basename(f)))) {
    try {
      collectUsage(YAML.parse(fs.readFileSync(file, "utf8")), "spec", boundaries, usageOf(file));
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
        collectUsage(authored, "test", boundaries, usageOf(spec.contentPath));
      }
    }
  }

  for (const file of files.filter((f) => path.basename(f) === "doc-detective.json")) {
    try {
      collectUsage(JSON.parse(fs.readFileSync(file, "utf8")), "config", boundaries, usageOf(file));
    } catch (error) {
      problems.push(`Couldn't parse ${file}: ${error.message}`);
    }
  }

  const usage = {};
  for (const exampleUsage of Object.values(usageByExample)) {
    for (const [key, types] of Object.entries(exampleUsage)) usage[key] = [...new Set([...(usage[key] || []), ...types])].sort();
  }
  const docs = files.map((file) => ({ file, example: exampleOf(file), text: fs.readFileSync(file, "utf8") }));
  return { usage, usageByExample, docs };
}

const pagesDir = path.resolve(__dirname, "../fern/pages/reference/docs-as-tests");
const indexMdx = path.join(pagesDir, "feature-index.mdx");
const indexJson = path.resolve(__dirname, "../docs-as-tests/feature-index.json");

function readPages() {
  return fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".mdx") && f !== "feature-index.mdx")
    .sort()
    .map((f) => ({ slug: f.replace(/\.mdx$/, ""), text: fs.readFileSync(path.join(pagesDir, f), "utf8") }));
}

/** Writes the feature index with `--write-index`; otherwise returns a problem for each stale file. */
function syncIndex(index, write) {
  const problems = [];
  for (const [file, content] of [[indexMdx, renderIndexMdx(index)], [indexJson, renderIndexJson(index)]]) {
    if (write) fs.writeFileSync(file, content);
    else if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== content) {
      problems.push(
        `Couldn't confirm ${file} is current: it doesn't match the examples. ` +
          "Run `npm run docs:coverage-docs-as-tests -- --write-index`."
      );
    }
  }
  return problems;
}

function main() {
  const problems = [];
  const { fields, boundaries, via } = schemaFields();
  const { usage, usageByExample, docs } = corpusUsage(boundaries, problems);
  const canon = (root, p) => canonicalKey(root, p, fields[root]);
  const coverage = findGaps(fields, usage, canon);
  const list = YAML.parse(fs.readFileSync(featuresFile, "utf8"));
  const features = list.features || [];
  const missing = findMissingNeedles(features, docs);

  const exampleIds = Object.keys(usageByExample);
  const needleUsers = Object.fromEntries(
    features.map((f) => [
      `features.${f.id}`,
      exampleIds.filter((ex) => !findMissingNeedles([f], docs.filter((d) => d.example === ex)).length),
    ])
  );
  const index = buildIndex(fields, usageByExample, canon, mapExamplesToPages(readPages()), needleUsers);
  problems.push(...syncIndex(index, process.argv.includes("--write-index")));
  // Features join the field gaps as `features.<id>`, so knownGaps can list them too.
  const allGaps = { ...coverage.gaps, ...(missing.length ? { features: missing.map((f) => f.id) } : {}) };
  const split = splitKnownGaps(allGaps, list.knownGaps || []);
  const unknownCount = Object.values(split.unknown).flat().length;
  for (const k of split.stale) {
    problems.push(`Couldn't find known gap \`${k.key}\`: examples cover it now. Remove it from \`knownGaps\` in ${featuresFile}.`);
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      fields: { total: coverage.total, covered: coverage.covered, gaps: coverage.gaps, shared: coverage.shared, via },
      features: { total: features.length, covered: features.length - missing.length, gaps: missing },
      unknownGaps: split.unknown,
      knownGaps: split.known,
      problems,
    }, null, 2));
  } else {
    for (const [root, gaps] of Object.entries(split.unknown)) {
      if (root === "features") continue;
      // A shared schema collects usage from every field that reaches it.
      const from = via[root]?.length ? `, reached from ${via[root].join(", ")}` : "";
      // Keys collapsed onto a shared key are reported once under shared:*.
      const collapsed = coverage.shared[root] ? `, ${coverage.shared[root]} keys counted under shared:*` : "";
      console.log(`${root} (${gaps.length} not shown${collapsed}${from}):`);
      for (const gap of gaps) console.log(`  ${gap}`);
    }
    const newFeatures = missing.filter((f) => (split.unknown.features || []).includes(f.id));
    if (newFeatures.length) {
      console.log(`features (${newFeatures.length} not shown):`);
      for (const f of newFeatures) console.log(`  ${f.id} (${f.since}): ${f.needle}`);
    }
    if (split.known.length) {
      console.log(`known gaps (${split.known.length}, listed in knownGaps):`);
      for (const k of split.known) console.log(`  ${k.key}: ${k.reason}`);
    }
    for (const problem of problems) console.error(problem);
    console.log(
      `Examples show ${coverage.covered} of ${coverage.total} schema fields and forms, ` +
        `and ${features.length - missing.length} of ${features.length} features. ` +
        `${unknownCount} gaps aren't in knownGaps.`
    );
  }
  if (process.argv.includes("--check") && (unknownCount || problems.length)) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  walkSchema, collectUsage, findGaps, findMissingNeedles, canonicalKey, splitKnownGaps, AUTHORING_CONFIG_KEYS,
  slugify, mapExamplesToPages, buildIndex, renderIndexJson, renderIndexMdx,
};
