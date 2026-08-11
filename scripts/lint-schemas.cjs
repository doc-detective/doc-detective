#!/usr/bin/env node

/**
 * Schema lint entry point.
 *
 * Runs two engines over `src/common/src/schemas/src_schemas`:
 *
 *   1. Spectral (schema-lint/ruleset.mjs) — structural rules, one document at a
 *      time, unresolved.
 *   2. The passes in this file — the rules Spectral can't express:
 *        - unique-title       cross-file identity
 *        - no-inert-default   needs Ajv's verdict, not a structural guess
 *        - examples-validate  needs Ajv to actually validate
 *
 * Gates the ROOT `npm run build` (see the repo-root package.json), running
 * BEFORE `build:common`, and therefore before dereferenceSchemas: the
 * dereferenced output, the generated TypeScript types, and the docs reference
 * pages are all derived from these sources, so
 * generating from input already known to be bad just launders the mistake into
 * three more artifacts.
 *
 * Usage:
 *   node scripts/lint-schemas.cjs [--format <spectral-format>] [--skip-spectral]
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const SRC_SCHEMAS = path.join(REPO_ROOT, "src", "common", "src", "schemas", "src_schemas");
const RULESET = path.join(REPO_ROOT, "schema-lint", "ruleset.mjs");
const ACK_FILE = path.join(REPO_ROOT, "schema-lint", "inert-defaults.json");
const BASELINE_FILE = path.join(REPO_ROOT, "schema-lint", "baseline.json");
const DOCS_GENERATOR = path.join(REPO_ROOT, "docs", ".scripts", "buildSchemaReferencesV4.js");

const COMPOSITION_KEYWORDS = ["anyOf", "oneOf", "not", "if", "then", "else"];

// Keywords Ajv actually descends into when validating. `components` and
// `definitions` are deliberately absent: they're containers reachable only by
// `$ref`, so treating them as traversable invents validation paths that don't
// exist. `allOf` IS an applicator but is NOT a composition keyword for default
// purposes — Ajv applies defaults through allOf.
const APPLICATORS = new Set([
  "properties",
  "patternProperties",
  "additionalProperties",
  "items",
  "additionalItems",
  "contains",
  "propertyNames",
  "dependencies",
  "dependentSchemas",
  "allOf",
  ...COMPOSITION_KEYWORDS,
]);
// Applicators whose value is a map of NAME -> schema rather than a schema.
const CHILD_MAP_KEYWORDS = new Set(["properties", "patternProperties", "dependencies", "dependentSchemas"]);
// Keywords whose values are DATA, not subschemas — descending into them would
// treat a user's example object as a schema node.
const DATA_KEYWORDS = new Set(["examples", "example", "default", "const", "enum"]);

const findings = [];
function report(rule, file, pointer, message) {
  findings.push({ rule, file, pointer, message });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function schemaFiles() {
  return fs.readdirSync(SRC_SCHEMAS).filter((f) => f.endsWith(".json")).sort();
}

/**
 * Parse an authored schema, or throw naming the file.
 *
 * Goes through readJson rather than JSON.parse for the reason recorded there:
 * Node's SyntaxError carries a character offset and no filename, so a bare parse
 * of one of 69 schemas reports "position 2" and leaves you guessing which.
 *
 * Callers deliberately do NOT catch. A schema that will not parse is a lint
 * failure, not a file to skip -- see the comment at lintUniqueTitles' loop.
 */
function readSchema(file) {
  return readJson(path.join(SRC_SCHEMAS, file), `The schema ${file}`);
}

/**
 * The schemas that become reference PAGES — parsed from the docs generator's own
 * `schemasToGenerate` list rather than duplicated here, so the two can't drift.
 *
 * Deliberately not the dereferencer's list: that one also emits v1/v2, which
 * produce no reference pages, and scoping to it made `find` look like a 3-way
 * collision across find_v2/find_v3/step_v3 when only the latter two can collide.
 *
 * @returns {Set<string>}
 */
function pageSchemas() {
  const source = fs.readFileSync(DOCS_GENERATOR, "utf8");
  const marker = "const schemasToGenerate = [";
  const start = source.indexOf(marker);
  // Fail loudly. Without this, renaming or reformatting that literal makes
  // `start` -1, the slice garbage, the regex match nothing, and pageSchemas()
  // return an empty Set — so unique-title would scan zero files, report nothing,
  // and exit 0. A safety net that silently switches itself off is worse than no
  // safety net, because it still looks green.
  if (start === -1) {
    throw new Error(
      `Could not find "${marker}" in ${DOCS_GENERATOR}. The unique-title rule reads that list to ` +
        `know which schemas become reference pages; update the marker here if the generator changed.`
    );
  }
  const list = source.slice(start, source.indexOf("]", start));
  const emitted = new Set([...list.matchAll(/"([A-Za-z0-9_]+_v\d)"/g)].map((m) => `${m[1]}.schema.json`));
  if (emitted.size === 0) {
    throw new Error(`Parsed "${marker}" in ${DOCS_GENERATOR} but found no schema names — the list format changed.`);
  }
  return emitted;
}

/**
 * Parse a JSON file, naming it if the parse fails.
 *
 * Node's `JSON.parse` SyntaxError reports only a character offset — "Expected
 * property name or '}' in JSON at position 2" — with no filename. Left bare,
 * a corrupt baseline or acknowledgement file surfaces as a stack trace that
 * doesn't say which file to look at.
 */
function readJson(file, label) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} (${path.relative(REPO_ROOT, file)}) is not valid JSON: ${error.message}`);
  }
}

/**
 * Findings recorded when this lint was introduced, shared with the Spectral
 * ruleset. Baselining rather than fixing keeps the tooling change reviewable on
 * its own; the list only shrinks, because deleting an entry that is still
 * violated fails the build.
 *
 * `existsSync` distinguishes "no baseline yet" (a legitimate state, returns {})
 * from "baseline present but unreadable". A malformed file must NOT degrade to
 * an empty set — that would silently re-fire every baselined finding at once —
 * so the parse error propagates, now carrying the filename.
 */
function loadBaseline() {
  return fs.existsSync(BASELINE_FILE) ? readJson(BASELINE_FILE, "The schema-lint baseline") : {};
}

/** Remove every `$id` in place. Mirrors deleteDollarIds in dereferenceSchemas.cjs. */
function stripIds(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(stripIds);
    return;
  }
  delete node.$id;
  for (const value of Object.values(node)) stripIds(value);
}

/**
 * Find every `default` that Ajv will never apply, by REACHABILITY.
 *
 * A default is applied only if some path from the schema root reaches it without
 * passing through a composition keyword. Two things make the naive checks wrong:
 *
 *   - Lexical nesting isn't enough. `components/schemas/object/properties/...`
 *     sits outside any composition, but in these schemas the only way in is the
 *     root `anyOf` following an internal `$ref` — so it's dead.
 *   - Ajv's own strict-mode warning isn't enough either. It fires for some
 *     shapes and not others: it flags httpRequest_v3's `statusCodes` but stays
 *     silent on find_v3's `moveTo`, which is provably inert (with
 *     `default: true` restored, validating `{selector}` still returns no
 *     `moveTo`). Trusting it would have shipped a lint that misses the exact bug
 *     it was written for.
 *
 * Internal `$ref`s are followed; cross-file ones are not, because each file is
 * analysed as its own root and a default in another file is that file's concern.
 * A node reached by BOTH a composed and an uncomposed path is live.
 *
 * @returns {{pointer: string, value: unknown}[]}
 */
function inertDefaults(schema) {
  const state = new Map(); // canonical pointer -> { live, composed, value, hasDefault }
  const seen = new Set();

  function resolvePointer(ref) {
    const parts = ref.slice(1).split("/").filter(Boolean).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let node = schema;
    for (const part of parts) {
      if (!node || typeof node !== "object") return null;
      node = node[part];
    }
    return node ? { node, pointer: ref.slice(1) } : null;
  }

  function visit(node, pointer, composed) {
    if (!node || typeof node !== "object") return;
    const key = `${pointer}|${composed}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${pointer}/${i}`, composed));
      return;
    }

    if (typeof node.$ref === "string" && node.$ref.startsWith("#")) {
      const target = resolvePointer(node.$ref);
      if (target) visit(target.node, target.pointer, composed);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(node, "default")) {
      const entry = state.get(pointer) || { live: false, composed: false, value: node.default };
      if (composed) entry.composed = true;
      else entry.live = true;
      state.set(pointer, entry);
    }

    // Descend ONLY through keywords Ajv actually applies. Walking every key
    // instead reaches `components/schemas/object` directly — but `components` is
    // an OpenAPI-style container Ajv ignores, so that path doesn't exist at
    // validation time. Counting it marked every one of these schemas' defaults
    // live and the detector reported nothing.
    for (const [k, v] of Object.entries(node)) {
      if (!APPLICATORS.has(k)) continue;
      const nowComposed = composed || COMPOSITION_KEYWORDS.includes(k);
      if (CHILD_MAP_KEYWORDS.has(k)) {
        // A map of name -> schema; the names are data, the values are schemas.
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const [name, child] of Object.entries(v)) visit(child, `${pointer}/${k}/${name}`, nowComposed);
        }
        continue;
      }
      visit(v, `${pointer}/${k}`, nowComposed);
    }
  }

  visit(schema, "", false);

  return [...state.entries()]
    .filter(([, e]) => e.composed && !e.live)
    .map(([pointer, e]) => ({ pointer, value: e.value }));
}

/**
 * Walk every schema node, calling visit(node, pointer).
 *
 * Composition tracking deliberately lives in inertDefaults() instead: that rule
 * needs reachability (following $refs, skipping non-applicator containers), which
 * a plain lexical walk gets wrong. Threading an unused `underComposition` through
 * here would imply this walk can answer that question. It can't.
 */
function walk(node, pointer, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${pointer}/${i}`, visit));
    return;
  }
  visit(node, pointer);
  for (const [key, value] of Object.entries(node)) {
    if (DATA_KEYWORDS.has(key)) continue;
    walk(value, `${pointer}/${key}`, visit);
  }
}

/**
 * Build an Ajv instance whose VALIDATION behavior matches
 * `src/common/src/validate.ts` — not a byte-for-byte copy of its options.
 *
 * What must match, and why: the keyword registrations. Measured on these
 * schemas, a bare instance emits 489 strict warnings of which only 61 are
 * relevant (the rest are the repo's own `transform`/`components`/
 * `dynamicDefaults` keywords reported as unknown), and registering the plugins
 * WITHOUT the `uuid` dynamic default leaves 23 schemas failing to compile —
 * silently unscanned, which is the failure mode this whole tool exists to
 * prevent. `useDefaults` and `coerceTypes` match for the same reason: they
 * decide what `examples-validate` actually sees.
 *
 * Where it deliberately differs:
 *
 * - `strictSchema: "log"` vs validate.ts's `false`. The lint WANTS the strict
 *   diagnostics; the runtime validator suppresses them so authored `$comment`s
 *   and custom keywords don't spam users.
 * - `validateSchema: false`, which validate.ts doesn't set. These schemas are
 *   linted as documents, and meta-schema validation would reject the repo's
 *   own `components`/`transform` vocabulary before any rule ran.
 * - No `ajv-errors`. It only rewrites error MESSAGES; the lint reports
 *   validity, not prose.
 *
 * @param {(msg: string) => void} onStrictWarning
 */
function buildAjv(onStrictWarning) {
  const Ajv = require("ajv");
  const addFormats = require("ajv-formats");
  const addKeywords = require("ajv-keywords");
  const dynamicDefaultsDef = require("ajv-keywords/dist/definitions/dynamicDefaults");

  // validate.ts registers a real UUID generator; the lint only needs the
  // keyword to be *known* so compilation reaches the rest of the schema.
  if (dynamicDefaultsDef && dynamicDefaultsDef.DEFAULTS && !dynamicDefaultsDef.DEFAULTS.uuid) {
    dynamicDefaultsDef.DEFAULTS.uuid = () => () => "00000000-0000-4000-8000-000000000000";
  }

  const ajv = new Ajv({
    strictSchema: "log",
    useDefaults: true,
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: true,
    validateSchema: false,
    logger: { log() {}, warn: onStrictWarning, error() {} },
  });
  addFormats(ajv);
  addKeywords(ajv);
  return ajv;
}

// ---------------------------------------------------------------------------
// Pass: unique-title
// ---------------------------------------------------------------------------

/**
 * The docs generator keys reference pages by `title`, so two different schemas
 * sharing one silently overwrite each other's page (annotation_v3's `point`
 * $comment records a real near-miss with swipe_v3's "Point").
 *
 * Scoped and de-duplicated deliberately:
 *   - Only schemas the dereferencer emits. `checkLink` appearing in v1/v2/v3 is
 *     correct versioning, and v1/v2 produce no reference pages.
 *   - Raw sources, never resolved. Resolution inlines the same subschema up to
 *     90 times in one document, so every title would appear to collide with its
 *     own copies.
 */
function lintUniqueTitles() {
  const emitted = pageSchemas();
  const index = new Map();

  for (const file of schemaFiles()) {
    if (!emitted.has(file)) continue;
    // No try/catch. A malformed schema used to be skipped silently here, which
    // turned "this file could not be read" into "this file has no titles" --
    // and with --skip-spectral nothing else would have noticed. Skipping the
    // input is indistinguishable from passing on it, and that has been this
    // tool's recurring failure mode. readSchema throws naming the file.
    const schema = readSchema(file);
    walk(schema, "", (node, pointer) => {
      if (typeof node.title !== "string" || !node.title.trim()) return;
      if (!index.has(node.title)) index.set(node.title, []);
      index.get(node.title).push({ file, pointer: pointer || "/" });
    });
  }

  const baselined = new Set(loadBaseline()["unique-title"] || []);

  for (const [title, sites] of index) {
    const files = new Set(sites.map((s) => s.file));
    if (files.size < 2) continue; // one declaration, or repeats within one file
    // Suppress only when EVERY site is baselined, not just an anchor site.
    // Keying on `sites[0]` alone meant a third schema joining an
    // already-recorded 2-way collision went unreported whenever it sorted after
    // the anchor — the collision would silently grow while the lint stayed
    // quiet. Requiring full coverage makes any new entrant reopen the finding.
    if (sites.every((s) => baselined.has(`${s.file}${s.pointer}`))) continue;
    const where = sites.map((s) => `${s.file}${s.pointer}`).join("\n      ");
    report(
      "unique-title",
      sites[0].file,
      sites[0].pointer,
      `Title "${title}" is declared in ${files.size} emitted schemas. The docs generator keys ` +
        `reference pages by title, so these overwrite each other and only one survives:\n      ${where}`
    );
  }
}

// ---------------------------------------------------------------------------
// Pass: no-inert-default
// ---------------------------------------------------------------------------

/**
 * A `default` under a composition keyword is never applied — Ajv skips defaults
 * inside anyOf/oneOf/not/if/then/else. That is how find_v3 advertised
 * `moveTo: true` for five years while the runtime used `false` (ADR 01086).
 *
 * Inertness alone is not the defect: annotation_v3's `timeout` is inert ON
 * PURPOSE, to populate the Default column on its generated reference page while
 * the runtime owns the real value. So the gate is ACKNOWLEDGEMENT — each inert
 * default must be registered with the runtime value it mirrors. Registering
 * `moveTo` would have forced someone to write "runtime: findElement does
 * `|| false`" beside `"default": true` and notice the contradiction.
 */
function lintInertDefaults() {
  // --- step 1: reachability decides WHICH defaults are inert -------------
  //
  // See inertDefaults(): Ajv's own strict warning was tried first as the oracle
  // and rejected — it flags httpRequest_v3's `statusCodes` but stays silent on
  // find_v3's `moveTo`, the very bug this rule exists to catch.
  const walkerHits = [];
  for (const file of schemaFiles()) {
    // Deliberately unguarded, as in lintUniqueTitles: a schema that will not
    // parse must fail the lint, not quietly contribute zero inert defaults.
    const schema = readSchema(file);
    for (const hit of inertDefaults(schema)) {
      walkerHits.push({ file, pointer: hit.pointer, value: hit.value });
    }
  }

  // --- step 2: the acknowledgement gate -----------------------------------
  let ack = {};
  if (fs.existsSync(ACK_FILE)) {
    ack = readJson(ACK_FILE, "The inert-default acknowledgements");
  }

  const seen = new Set();
  for (const hit of walkerHits) {
    const key = `${hit.file}${hit.pointer}`;
    seen.add(key);
    const entry = ack[hit.file] && ack[hit.file][hit.pointer];
    if (!entry) {
      report(
        "no-inert-default",
        hit.file,
        hit.pointer,
        `\`default: ${JSON.stringify(hit.value)}\` sits under a composition keyword, so Ajv never ` +
          `applies it — the real default lives in the runtime. If that's intentional, register it in ` +
          `schema-lint/inert-defaults.json with the runtime value it mirrors. If it isn't, this is a ` +
          `moveTo twin (ADR 01086).`
      );
      continue;
    }
    if (JSON.stringify(entry.value) !== JSON.stringify(hit.value)) {
      report(
        "no-inert-default",
        hit.file,
        hit.pointer,
        `Registered as \`${JSON.stringify(entry.value)}\` in schema-lint/inert-defaults.json but the ` +
          `schema now says \`${JSON.stringify(hit.value)}\`. One of them moved without the other; the ` +
          `registration records that this mirrors ${entry.runtime}.`
      );
    }
  }

  // Stale registrations, so the file can't accumulate claims about things that
  // no longer exist.
  for (const [file, pointers] of Object.entries(ack)) {
    for (const pointer of Object.keys(pointers)) {
      if (seen.has(`${file}${pointer}`)) continue;
      report(
        "no-inert-default",
        file,
        pointer,
        `schema-lint/inert-defaults.json registers this pointer, but it no longer has an inert ` +
          `default. Remove the entry.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pass: examples-validate
// ---------------------------------------------------------------------------

/**
 * A schema's own `examples` must validate against it. These are lifted straight
 * onto the generated reference pages, so an invalid one ships as documentation
 * telling users to write something the validator rejects.
 *
 * Root-level `examples` only: a nested example belongs to whichever subschema
 * declares it and would be re-checked once per inlining consumer.
 */
async function lintExamples() {
  // Dereference in memory with the same ref parser the build uses, BY PATH
  // rather than by handing over a parsed object. The path is what makes relative
  // refs like "surface_v3.schema.json#" resolve against the document's own
  // location; passing the object leaves the parser resolving them against
  // process.cwd(). dereferenceSchemas.cjs reaches the same place by a different
  // route — stamping `$id` onto a copy in a build directory first — because it
  // needs the rewritten file on disk. This doesn't.
  //
  // Validating the raw sources instead produces false failures: Ajv resolves
  // cross-file and `#/components/...` refs differently than the bundle that
  // actually ships, and annotation_v3's position-target example was reported
  // invalid when the real validator accepts it. Doing it in memory (rather than
  // reading output_schemas/) keeps the lint runnable BEFORE the build, which is
  // the whole point of gating on it.
  const parser = require("@apidevtools/json-schema-ref-parser");

  for (const file of schemaFiles()) {
    let raw;
    try {
      raw = readSchema(file);
    } catch (error) {
      report("examples-validate", file, "", `Not parseable as JSON: ${error.message}`);
      continue;
    }
    if (!Array.isArray(raw.examples) || raw.examples.length === 0) continue;

    let schema;
    try {
      // Dereference BY PATH, not by passing the parsed object: relative refs
      // like "surface_v3.schema.json#" resolve against the document's own
      // location, and handing over a bare object leaves the parser resolving
      // them against process.cwd() instead.
      schema = await parser.dereference(path.join(SRC_SCHEMAS, file));
    } catch (error) {
      report("examples-validate", file, "", `Refs don't resolve, so examples can't be checked: ${error.message}`);
      continue;
    }

    let validate;
    try {
      const ajv = buildAjv(() => {});
      // Strip every `$id`, not just the root's — mirrors deleteDollarIds in
      // dereferenceSchemas.cjs. Dereferencing inlines the same subschema at
      // several places, and each copy keeps its `$id`; Ajv then rejects the
      // document with "reference ... resolves to more than one schema".
      stripIds(schema);
      validate = ajv.compile(schema);
    } catch (error) {
      report("examples-validate", file, "", `Schema doesn't compile, so its examples can't be checked: ${error.message}`);
      continue;
    }
    if (!validate) continue;

    schema.examples.forEach((example, i) => {
      // useDefaults/coerceTypes mutate, so validate a clone — the same reason
      // validate.ts clones before its mutating pass.
      const clone = JSON.parse(JSON.stringify(example));
      if (validate(clone)) return;
      const detail = (validate.errors || [])
        .slice(0, 3)
        .map((e) => `${e.instancePath || "/"} ${e.message}`)
        .join("; ");
      report(
        "examples-validate",
        file,
        `/examples/${i}`,
        `Example ${i} doesn't validate against its own schema: ${detail}`
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Escape a workflow-command DATA payload (the part after `::`).
 *
 * Per the workflow-command spec, `%`, CR and LF must be encoded. `%` has to go
 * first or it would double-encode the escapes introduced after it. These
 * messages routinely carry both: findings embed JSON targets like
 * `{"elementTestId":"late-panel"}` and multi-line collision lists, and an
 * unescaped newline silently truncates the annotation at that point.
 */
function escapeData(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/**
 * Escape a workflow-command PROPERTY value (`file=`, `title=`).
 *
 * Properties additionally need `:` and `,` encoded, since both are structural
 * in the property list — an unescaped one would split a value into a bogus
 * extra property.
 */
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function runSpectral(format) {
  // Spawn Spectral's CLI entry with THIS node binary rather than `npx`, and with
  // no shell.
  //
  // `npx` on Windows is a .cmd, which can't be spawned without `shell: true` —
  // and `shell: true` concatenates argv without escaping (Node's own DEP0190
  // warns about it). Every path here is absolute and derived from __dirname, so
  // a checkout under an ordinary Windows home like `C:\Users\Jane Doe\...`
  // would split mid-path: the child receives `--ruleset C:/Users/Jane` plus a
  // stray `Doe/.../ruleset.mjs`. Resolving the entry script sidesteps the shell
  // entirely, so spaces are safe on every platform.
  let cli;
  try {
    cli = require.resolve("@stoplight/spectral-cli/dist/index.js");
  } catch (error) {
    console.error(
      `Schema lint could not locate @stoplight/spectral-cli (${error.message}). ` +
        `Run \`npm ci\` — the structural rules cannot run without it.`
    );
    return false;
  }

  // Pass the files EXPLICITLY rather than a glob.
  //
  // A glob has one failure mode this tool cannot afford: match nothing, lint
  // nothing, exit 0. The gate would look green while enforcing nothing — the
  // same silent no-op guarded against in pageSchemas() and loadBaseline(). It
  // also sidesteps the question of whether Spectral's glob parser wants
  // `/` separators when path.join() produces `\` on Windows. (Measured: it
  // handles native separators fine — 170 findings across 26 files — but an
  // explicit list makes the question moot rather than relying on that.)
  const targets = schemaFiles().map((f) => path.join(SRC_SCHEMAS, f));
  if (targets.length === 0) {
    console.error(`Schema lint found no schemas in ${SRC_SCHEMAS}. That is not a clean run.`);
    return false;
  }

  const args = [cli, "lint", "--ruleset", RULESET, "--fail-severity", "error", ...targets];
  if (format) args.push("--format", format);

  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    // The ruleset can't locate the baseline itself — Spectral transpiles
    // rulesets, which breaks `import.meta.url` — so hand it the absolute path.
    env: { ...process.env, SCHEMA_LINT_BASELINE: BASELINE_FILE },
  });

  // A failure to LAUNCH is not a rule violation. Without this, an ENOENT or
  // EPERM surfaces as "Schema lint FAILED: Spectral rules" with nothing printed
  // (stdio is inherited), sending someone hunting for a schema problem that
  // doesn't exist while four of the six rules silently never ran.
  if (result.error) {
    console.error(`Schema lint could not run Spectral: ${result.error.message}`);
    return false;
  }
  if (result.status === null) {
    console.error(`Schema lint: Spectral was terminated by signal ${result.signal}.`);
    return false;
  }
  return result.status === 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const formatIndex = argv.indexOf("--format");
  const format = formatIndex >= 0 ? argv[formatIndex + 1] : undefined;

  const spectralOk = argv.includes("--skip-spectral") ? true : runSpectral(format);

  lintUniqueTitles();
  lintInertDefaults();
  await lintExamples();

  if (findings.length > 0) {
    // `--format github-actions` is forwarded to Spectral, but these findings
    // never pass through it, so without this they'd print as plain text and
    // never become inline PR annotations — the job would claim a coverage it
    // didn't have.
    const annotate = format === "github-actions";
    console.error("");
    console.error("Schema lint (cross-file and Ajv-semantic rules):");
    console.error("");
    for (const f of findings) {
      if (annotate) {
        const file = path.relative(REPO_ROOT, path.join(SRC_SCHEMAS, f.file)).split(path.sep).join("/");
        const message = `${f.rule}: ${f.pointer ? `${f.pointer} — ` : ""}${f.message}`;
        console.log(
          `::error file=${escapeProperty(file)},title=${escapeProperty(f.rule)}::${escapeData(message)}`
        );
      }
      console.error(`  error  ${f.rule}  ${f.file}${f.pointer}`);
      console.error(`         ${f.message}`);
      console.error("");
    }
  }

  if (!spectralOk || findings.length > 0) {
    const parts = [];
    if (!spectralOk) parts.push("Spectral rules");
    if (findings.length > 0) parts.push(`${findings.length} finding(s) from the custom passes`);
    console.error(`Schema lint FAILED: ${parts.join(" and ")}.`);
    process.exit(1);
  }

  console.log("Schema lint passed.");
}

// Guarded so the internals can be exercised directly (and unit-tested) without
// running a whole lint as an import side effect.
if (require.main === module) {
  main().catch((error) => {
    console.error(`Schema lint crashed: ${error && error.stack ? error.stack : error}`);
    process.exit(1);
  });
}

module.exports = { inertDefaults, escapeData, escapeProperty, pageSchemas, readJson, readSchema, SRC_SCHEMAS };
