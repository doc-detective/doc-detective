const parser = require("@apidevtools/json-schema-ref-parser");
const path = require("path");
const fs = require("fs");

(async () => {
  await dereferenceSchemas();
})();

/**
 * Processes JSON schema files by updating reference paths, dereferencing all `$ref` pointers, and generating fully resolved schema outputs.
 *
 * For each schema in the input directory, this function updates reference paths, writes intermediate schemas to a build directory, dereferences all references, removes `$id` properties, and writes the final schemas to an output directory. It also creates a consolidated `schemas.json` file containing all dereferenced schemas keyed by filename.
 *
 * @remark The function assumes all schema files listed exist in the input directory and does not handle missing files or invalid JSON beyond throwing synchronous errors.
 */
async function dereferenceSchemas() {
  const inputDir = path.resolve(`${__dirname}/src_schemas`);
  const buildDir = path.resolve(`${__dirname}/build`);
  fs.mkdirSync(buildDir, { recursive: true });
  const outputDir = path.resolve(`${__dirname}/output_schemas`);
  fs.mkdirSync(outputDir, { recursive: true });
  const distDir = path.resolve(__dirname, `../../dist/schemas`);
  fs.mkdirSync(distDir, { recursive: true });

  // List of schema files to process
  // These files should be present in the input directory
  const files = [
    // v3 schemas
    "annotate_v3.schema.json",
    "annotation_v3.schema.json",
    "annotationDefaults_v3.schema.json",
    "assertion_v3.schema.json",
    "checkLink_v3.schema.json",
    "click_v3.schema.json",
    "closeSurface_v3.schema.json",
    "config_v3.schema.json",
    "context_v3.schema.json",
    "dragAndDrop_v3.schema.json",
    "find_v3.schema.json",
    "goTo_v3.schema.json",
    "loadCookie_v3.schema.json",
    "loadVariables_v3.schema.json",
    "httpRequest_v3.schema.json",
    "openApi_v3.schema.json",
    "record_v3.schema.json",
    "resolvedTests_v3.schema.json",
    "report_v3.schema.json",
    "routing_v3.schema.json",
    "runBrowserScript_v3.schema.json",
    "runCode_v3.schema.json",
    "runShell_v3.schema.json",
    "saveCookie_v3.schema.json",
    "screenshot_v3.schema.json",
    "sourceIntegration_v3.schema.json",
    "spec_v3.schema.json",
    "startSurface_v3.schema.json",
    "step_v3.schema.json",
    "stopRecord_v3.schema.json",
    "surface_v3.schema.json",
    "swipe_v3.schema.json",
    "test_v3.schema.json",
    "type_v3.schema.json",
    "wait_v3.schema.json",
    "waitUntil_v3.schema.json",
    // v2 schemas
    "checkLink_v2.schema.json",
    "config_v2.schema.json",
    "context_v2.schema.json",
    "find_v2.schema.json",
    "goTo_v2.schema.json",
    "httpRequest_v2.schema.json",
    "moveTo_v2.schema.json",
    "openApi_v2.schema.json",
    "runShell_v2.schema.json",
    "runCode_v2.schema.json",
    "saveScreenshot_v2.schema.json",
    "setVariables_v2.schema.json",
    "startRecording_v2.schema.json",
    "stopRecording_v2.schema.json",
    "spec_v2.schema.json",
    "test_v2.schema.json",
    "typeKeys_v2.schema.json",
    "wait_v2.schema.json",
  ];

  // Update schema reference paths
  console.log("Updating schema reference paths...");
  for (const file of files) {
    console.log(`File: ${file}`);
    const filePath = path.resolve(`${inputDir}/${file}`);
    const buildFilePath = path.resolve(`${buildDir}/${file}`);
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      // Load schema
      let schema = fs.readFileSync(filePath).toString();
      schema = JSON.parse(schema);

      // Update references to current relative path
      schema.$id = `${filePath}`;
      schema = updateRefPaths(schema);

      // Write to build directory
      fs.writeFileSync(buildFilePath, JSON.stringify(schema, null, 2));
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  // Dereference schemas
  console.log("Dereferencing schemas...");
  for await (const file of files) {
    console.log(`Processing file: ${file}`);
    const filePath = path.resolve(`${buildDir}/${file}`);
    const outputFilePath = path.resolve(`${outputDir}/${file}`);
    try {
      // Check if file exists
      if (!fs.existsSync(filePath))
        throw new Error(`File not found: ${filePath}`);

      // Load schema
      let schema = fs.readFileSync(filePath).toString();
      schema = JSON.parse(schema);

      // Dereference schema
      schema = await parser.dereference(schema);
      // Delete $id attributes
      schema = deleteDollarIds(schema);

      // Write to file
      fs.writeFileSync(outputFilePath, JSON.stringify(schema, null, 2));
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }
  // Build final schemas.json file
  console.log("Building schemas.json file...");
  const schemas = {};
  for (const file of files) {
    const key = file.replace(".schema.json", "");
    // Load schema from file
    const schema = require(`${outputDir}/${file}`);
    // Load into `schema` object
    schemas[key] = schema;
  }
  fs.writeFileSync(
    `${__dirname}/schemas.json`,
    JSON.stringify(schemas, null, 2)
  );

  // Build schemasReferenced.json: the same schemas with `$ref`s intact, for the
  // validator. Ajv compiles a shared subschema once instead of once per inlined
  // copy, which cuts first-validation compile time several-fold.
  console.log("Building schemasReferenced.json file...");
  fs.writeFileSync(
    `${__dirname}/schemasReferenced.json`,
    JSON.stringify(buildReferencedSchemas(inputDir, files), null, 2)
  );

  // Clean up build dir
  // fs.rm(buildDir, { recursive: true }, (err) => {
  //   if (err) throw err;
  // });

  // Publish v3 schemas to distribution directory
  const publishedSchemas = files.filter(file => file.includes('_v3.schema.json'));

  console.log("Publishing schemas to dist/schemas directory...");
  publishedSchemas.forEach((file) => {
    try {
      console.log(`Publishing file: ${file}`);
      const srcPath = path.resolve(`${outputDir}/${file}`);
      const destPath = path.resolve(`${distDir}/${file}`);

      // Verify source file exists before copying
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Source file not found: ${srcPath}`);
      }

      fs.copyFileSync(srcPath, destPath);
    } catch (err) {
      console.error(`Error publishing ${file}:`, err);
    }
  });
}

/**
 * Builds the `$ref`-intact schema set the validator compiles, shaped so Ajv
 * validates exactly as it does against the dereferenced schemas.json:
 *
 * - `schemas`: the listed schemas plus everything they reference, keyed like
 *   schemas.json, each with `$id` = its file name so the relative cross-file
 *   `$ref`s resolve.
 * - `noDefaults`: a copy of each with every `default`/`dynamicDefaults`
 *   removed, under a `.nodefaults.schema.json` `$id`.
 *
 * Both drop annotation keywords (title, description, examples, ...).
 *
 * Two Ajv behaviors differ between the forms and are compensated here:
 *
 * 1. Ajv ignores defaults under composite keywords (anyOf, oneOf, not, if,
 *    contains, propertyNames). Dereferenced, everything below one is inline so
 *    the rule reaches it; but a `$ref` target compiled as its own function
 *    forgets it and applies its defaults. So every `$ref` under a composite
 *    keyword points at the `noDefaults` copy of its target.
 * 2. Ajv assigns a property's default from the property's own schema, never
 *    through `$ref`. Dereferencing inlines a target's root `default` there, so
 *    it's copied onto each referencing `$ref` that lacks one.
 */
function buildReferencedSchemas(inputDir, files) {
  const sources = {};
  const pending = [...files];
  while (pending.length) {
    const file = pending.pop();
    if (sources[file]) continue;
    sources[file] = JSON.parse(fs.readFileSync(path.join(inputDir, file)));
    walkSchema(sources[file], (node) => {
      const refFile = typeof node.$ref === "string" && node.$ref.split("#")[0];
      if (refFile) pending.push(refFile);
    });
  }

  // (2) Hoist target root defaults. Repeat until stable: a target can itself be
  // a `$ref` that just gained one.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, schema] of Object.entries(sources)) {
      walkSchema(schema, (node) => {
        if (typeof node.$ref !== "string" || "default" in node) return;
        const [refFile, pointer = ""] = node.$ref.split("#");
        const target = resolvePointer(sources[refFile || file], pointer);
        if (target && typeof target === "object" && "default" in target) {
          node.default = target.default;
          changed = true;
        }
      });
    }
  }

  // (1) Composite-context `$ref`s → defaults-free copies.
  const noDefaultsId = (file) => file.replace(/\.schema\.json$/, ".nodefaults.schema.json");
  const toNoDefaults = (ref, file) => {
    const [refFile, pointer = ""] = ref.split("#");
    return `${noDefaultsId(refFile || file)}#${pointer}`;
  };
  const result = { schemas: {}, noDefaults: [] };
  for (const [file, source] of Object.entries(sources)) {
    const schema = structuredClone(source);
    walkSchema(schema, (node, inComposite) => {
      stripAnnotations(node);
      if (inComposite && typeof node.$ref === "string") node.$ref = toNoDefaults(node.$ref, file);
    });
    result.schemas[file.replace(".schema.json", "")] = { ...schema, $id: file };

    const stripped = structuredClone(source);
    walkSchema(stripped, (node) => {
      stripAnnotations(node);
      delete node.default;
      delete node.dynamicDefaults;
      if (typeof node.$ref === "string") node.$ref = toNoDefaults(node.$ref, file);
    });
    result.noDefaults.push({ ...stripped, $id: noDefaultsId(file) });
  }
  return result;
}

// Keywords whose subschemas Ajv validates with defaults switched off.
const COMPOSITE_KEYWORDS = new Set(["anyOf", "oneOf", "not", "if", "contains", "propertyNames"]);
// Keywords whose values are maps of name → schema (incl. OpenAPI-style
// `components.schemas`), so their keys are names, not keywords.
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties", "definitions", "$defs", "dependencies", "schemas"]);
// Keywords holding data, not schemas (examples may contain `$ref` or `default` keys).
const DATA_KEYWORDS = new Set(["default", "examples", "example", "const", "enum"]);

/**
 * Calls fn(node, inComposite) on every schema object in a schema document,
 * skipping data-valued keywords and treating schema-map keys as names.
 */
function walkSchema(node, fn, inComposite = false) {
  if (Array.isArray(node)) return node.forEach((item) => walkSchema(item, fn, inComposite));
  if (node === null || typeof node !== "object") return;
  fn(node, inComposite);
  for (const [key, value] of Object.entries(node)) {
    if (DATA_KEYWORDS.has(key) || value === null || typeof value !== "object") continue;
    const childComposite = inComposite || COMPOSITE_KEYWORDS.has(key);
    if (SCHEMA_MAP_KEYWORDS.has(key) && !Array.isArray(value)) {
      for (const sub of Object.values(value)) walkSchema(sub, fn, childComposite);
    } else {
      walkSchema(value, fn, childComposite);
    }
  }
}

// Annotation keywords Ajv never reads. The bundle is only for validation, so
// dropping them keeps it small (it's inlined into the CJS bundle and parsed on
// first validation).
function stripAnnotations(node) {
  for (const key of ["title", "description", "$comment", "examples", "example"]) delete node[key];
}

function resolvePointer(root, pointer) {
  return pointer
    .split("/")
    .slice(1)
    .map((part) => decodeURIComponent(part).replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, part) => (node == null ? undefined : node[part]), root);
}

// Prepend app-root path to referenced relative paths
function updateRefPaths(schema) {
  if (schema === null || typeof schema !== "object") return schema;
  for (let [key, value] of Object.entries(schema)) {
    if (typeof value === "object") {
      updateRefPaths(value);
    }
    if (key === "$ref" && !value.startsWith("#")) {
      // File name of the referenced schema
      const valueFile = value.split("#")[0];
      // Attribute path in the referenced schema
      const valueAttribute = value.split("#")[1];
      const valuePath = path.resolve(`${__dirname}/build/${valueFile}`);
      schema[key] = valueAttribute !== undefined
        ? `${valuePath}#${valueAttribute}`
        : valuePath;
      // console.log({value, valueFile, valueAttribute, final: schema[key]})
    }
  }
  return schema;
}

/**
 * Recursively removes all `$id` properties from a JSON schema object.
 *
 * @param {object} schema - The JSON schema object to process.
 * @returns {object} The schema object with all `$id` properties deleted.
 */
function deleteDollarIds(schema) {
  if (schema === null || typeof schema !== "object") return schema;
  for (let [key, value] of Object.entries(schema)) {
    if (typeof value === "object") {
      deleteDollarIds(value);
    }
    if (key === "$id") {
      delete schema[key];
    }
  }
  return schema;
}
