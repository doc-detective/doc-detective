// validate() runs validators precompiled at build time (Ajv standalone code in
// dist/schemas/validators.cjs) instead of compiling schemasReferenced.json at
// runtime. This proves the swap is invisible: for every schema, in both the
// mutating and the non-mutating (compatible-schema probe) configuration, the
// precompiled validator returns the same validity, the same errors, and leaves
// the data in the same state as the runtime-compiled one. See ADR 01138.
import { expect } from "chai";
import { execFileSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { createAjv, standaloneValidatorFiles } from "../dist/ajv.js";
import { schemas } from "../dist/index.js";
import { schemasReferenced } from "../dist/schemas/referenced.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..", "..");
const distSchemas = path.join(here, "..", "dist", "schemas");
const require = createRequire(import.meta.url);

function jsonFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith(suffix))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

const CONFIG_FILES = [
  ".doc-detective.json",
  "docs/.doc-detective.json",
  "docs/.doc-detective.preview.json",
  "samples/.doc-detective.json",
  "dev/dev.config.json",
  "test/test-config.json",
  "test/artifacts/config.json",
  "test/core-artifacts/config.json",
  "test/core-artifacts/config.groups.json",
];

// Every schema example, every spec fixture, and the repo's config files. Each
// is run against every schema, so invalid inputs and their errors are covered.
const corpus = [
  ...Object.values(schemas).flatMap((schema) => schema.examples || []),
  ...jsonFiles(path.join(repoRoot, "test", "core-artifacts"), ".spec.json"),
  ...jsonFiles(path.join(repoRoot, "test", "artifacts"), ".spec.json"),
  ...CONFIG_FILES.map((f) => path.join(repoRoot, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8"))),
];

// uuid dynamic defaults differ call to call; compare them as a placeholder.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const normalize = (value) => JSON.parse(JSON.stringify(value).replace(UUID, "<uuid>"));

function run(check, object) {
  const data = JSON.parse(JSON.stringify(object));
  const valid = check(data);
  // Whole error objects: instancePath, schemaPath, keyword, params, message.
  return normalize({ valid, errors: check.errors || null, data });
}

describe("precompiled validators", function () {
  this.timeout(600000);

  const validators = require(path.join(distSchemas, "validators.cjs"));
  const precompiled = { true: validators.mutating, false: validators.loadCheck() };

  it("ship the code the current schemas and Ajv options generate", function () {
    for (const [file, code] of Object.entries(standaloneValidatorFiles())) {
      expect(fs.readFileSync(path.join(distSchemas, file), "utf8") === code, file).to.equal(true);
    }
  });

  it("export a validator for every schema key, and nothing else", function () {
    const keys = Object.keys(schemasReferenced.schemas).sort();
    expect(Object.keys(precompiled.true).sort()).to.deep.equal(keys);
    expect(Object.keys(precompiled.false).sort()).to.deep.equal(keys);
  });

  for (const mutating of [true, false]) {
    it(`validate the corpus identically to runtime-compiled schemas (mutating: ${mutating})`, function () {
      const runtime = createAjv({ mutating });
      for (const [key, schema] of Object.entries(schemasReferenced.schemas)) runtime.addSchema(schema, key);
      runtime.addSchema(schemasReferenced.noDefaults);

      let compared = 0;
      let invalid = 0;
      for (const key of Object.keys(schemasReferenced.schemas)) {
        const expected = runtime.getSchema(key);
        const actual = precompiled[mutating][key];
        corpus.forEach((object, i) => {
          const want = run(expected, object);
          expect(run(actual, object), `${key} vs corpus[${i}]`).to.deep.equal(want);
          compared++;
          if (!want.valid) invalid++;
        });
      }
      expect(corpus.length).to.be.greaterThan(200);
      expect(compared).to.be.greaterThan(10000);
      expect(invalid).to.be.greaterThan(1000);
    });
  }

  it("apply uuid dynamic defaults in the mutating validators only", function () {
    const mutated = {};
    expect(precompiled.true.context_v3(mutated)).to.equal(true);
    expect(mutated.contextId).to.match(UUID);
    const untouched = {};
    expect(precompiled.false.context_v3(untouched)).to.equal(true);
    expect(untouched).to.deep.equal({});
  });

  it("refuse to precompile a dynamic default other than uuid", function () {
    const ajv = createAjv({ mutating: true, standalone: true });
    expect(() => ajv.compile({ type: "object", dynamicDefaults: { ts: "timestamp" } })).to.throw(
      /only "uuid"/,
    );
  });

  it("let validate() run without loading the Ajv compiler", function () {
    const script = `
      const { validate } = await import(${JSON.stringify(new URL("../dist/validate.js", import.meta.url).href)});
      const { createRequire } = await import("module");
      const r = validate({ schemaKey: "config_v3", object: { input: ["a.md"] } });
      const loaded = Object.keys(createRequire(import.meta.url).cache)
        .filter((f) => /[\\\\/]ajv[\\\\/]dist[\\\\/](ajv|core|compile[\\\\/]index)\\.js$/.test(f));
      console.log(JSON.stringify({ valid: r.valid, loaded }));
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    expect(JSON.parse(out)).to.deep.equal({ valid: true, loaded: [] });
  });
});
