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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This suite is ESM, so there is no __dirname. Spelling it out rather than
// reaching for one: a bare `__dirname` here throws a ReferenceError that an
// enclosing catch swallows, which is how the subprocess test below first
// "failed to spawn" while looking like the lint had simply printed nothing.
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const require = createRequire(import.meta.url);
const { execFileSync } = require("node:child_process");
const {
  inertDefaults,
  escapeData,
  escapeProperty,
  pageSchemas,
  readJson,
  readSchema,
  SRC_SCHEMAS,
} = require("../scripts/lint-schemas.cjs");

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

  it("records a `default` that sits BESIDE a $ref, not just below it", function () {
    // The $ref branch returns, so recording the node's own default after it
    // dropped every `{ "$ref": …, "default": … }` node on the floor. config_v2
    // has five of these -- `input` is
    // `{ "$ref": "#/definitions/input", "default": "." }` -- and a missed inert
    // default is exactly the moveTo class of bug this rule exists to catch.
    const composed = {
      type: "object",
      definitions: { input: { type: "string" } },
      anyOf: [{ properties: { input: { $ref: "#/definitions/input", default: "." } } }],
    };
    expect(inertPointers(composed)).to.deep.equal(["/anyOf/0/properties/input"]);
  });

  it("leaves an uncomposed $ref-sibling default alone, because Ajv applies it", function () {
    // Draft-07 says $ref siblings are ignored, so the tempting fix is to call
    // every such default inert. Ajv disagrees: useDefaults acts at the
    // `properties` level and the sibling DOES land -- pinned against a live
    // validator below. Reporting it would have been a false positive on all
    // five of config_v2's, which are reachable without composition.
    const uncomposed = {
      type: "object",
      definitions: { input: { type: "string" } },
      properties: { input: { $ref: "#/definitions/input", default: "." } },
    };
    expect(inertDefaults(uncomposed)).to.deep.equal([]);
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

  it("reports a default under oneOf", function () {
    // Not hypothetical: find_v2's `click` default is reached this way and is
    // registered in inert-defaults.json today. Only anyOf and allOf were pinned
    // before, so a regression dropping oneOf from COMPOSITION_KEYWORDS would
    // have gone unnoticed.
    const schema = {
      type: "object",
      properties: { click: { oneOf: [{ type: "boolean", default: false }] } },
    };
    expect(inertPointers(schema)).to.deep.equal(["/properties/click/oneOf/0"]);
  });

  it("reports a default under `if`, but NOT under `then` or `else`", function () {
    // The if/then/else family does not behave uniformly, which is the trap this
    // pins. `if` is evaluated only as a predicate, so its own defaults never
    // land. `then`/`else` are ordinary subschemas applied when their branch is
    // selected, so their defaults DO land -- conditionally, but conditional
    // liveness is still liveness.
    //
    // Reported as inert here originally. That was a false positive on every
    // such default in the repo, and it pushed live ones into
    // inert-defaults.json as though they were dead.
    const schema = {
      type: "object",
      if: { properties: { a: { default: "I" } } },
      then: { properties: { b: { default: "T" } } },
      else: { properties: { c: { default: "E" } } },
    };
    expect(inertPointers(schema)).to.deep.equal(["/if/properties/a"]);
  });

  it("still reports a `then` default when a composition keyword sits above it", function () {
    // Nesting composes: `then` does not block, but the `anyOf` above it does.
    const schema = {
      type: "object",
      anyOf: [{ if: { properties: { k: { const: "a" } } }, then: { properties: { deep: { default: "D" } } } }],
    };
    expect(inertPointers(schema)).to.deep.equal(["/anyOf/0/then/properties/deep"]);
  });
});

describe("scripts/lint-schemas COMPOSITION_KEYWORDS vs the real Ajv", function () {
  // The classification above is only as good as its agreement with the Ajv the
  // repo actually validates with. These assertions run a live validator so an
  // Ajv upgrade that changes default application fails HERE -- loudly, in one
  // place -- instead of silently re-misclassifying every schema in the repo.
  //
  // Ajv's own strict-mode warning is not usable as this oracle: it flags
  // httpRequest_v3's `statusCodes` but stays silent on find_v3's `moveTo`. See
  // the header of this file.

  /** Validate `data` against `schema` with the repo's mutating Ajv settings. */
  function applyDefaults(schema, data) {
    const Ajv = require("ajv");
    // Mirrors src/common/src/validate.ts's mutating instance for the settings
    // that decide default application.
    new Ajv({ useDefaults: true, strict: false }).validate(schema, data);
    return data;
  }

  const BLOCKS = [
    ["anyOf", { type: "object", anyOf: [{ properties: { x: { default: "V" } } }] }],
    ["oneOf", { type: "object", oneOf: [{ properties: { x: { default: "V" } } }] }],
    ["not", { type: "object", not: { properties: { x: { default: "V" } }, required: ["nope"] } }],
    ["if", { type: "object", if: { properties: { x: { default: "V" } } }, then: {} }],
  ];

  for (const [keyword, schema] of BLOCKS) {
    it(`Ajv does NOT apply a default under \`${keyword}\``, function () {
      expect(applyDefaults(schema, {})).to.deep.equal({});
    });
  }

  const APPLIES = [
    ["allOf", { type: "object", allOf: [{ properties: { x: { default: "V" } } }] }, {}],
    [
      "then",
      {
        type: "object",
        if: { properties: { k: { const: "a" } }, required: ["k"] },
        then: { properties: { x: { default: "V" } } },
      },
      { k: "a" },
    ],
    [
      "else",
      {
        type: "object",
        if: { properties: { k: { const: "a" } }, required: ["k"] },
        else: { properties: { x: { default: "V" } } },
      },
      { k: "z" },
    ],
  ];

  for (const [keyword, schema, seed] of APPLIES) {
    it(`Ajv DOES apply a default under \`${keyword}\``, function () {
      expect(applyDefaults(schema, { ...seed }).x).to.equal("V");
    });
  }

  it("applies a `default` that is a SIBLING of $ref, contrary to draft-07", function () {
    // Draft-07 says $ref siblings are ignored. Ajv's useDefaults acts at the
    // `properties` level and applies it anyway. The detector's treatment of
    // config_v2's five such nodes as live rests entirely on this, so it is
    // asserted rather than assumed -- if a future Ajv honors the spec here,
    // those five become inert and this test says so.
    const schema = {
      type: "object",
      definitions: { input: { type: "string" } },
      properties: { input: { $ref: "#/definitions/input", default: "." } },
    };
    expect(applyDefaults(schema, {})).to.deep.equal({ input: "." });
  });

  it("reports a default under not", function () {
    const schema = { type: "object", not: { properties: { a: { default: "N" } } } };
    expect(inertPointers(schema)).to.deep.equal(["/not/properties/a"]);
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

describe("scripts/lint-schemas readJson", function () {
  it("names the offending file when JSON is malformed", function () {
    // Node's own SyntaxError reports only a character offset — "Expected
    // property name or '}' in JSON at position 2" — with no filename, so a
    // corrupt baseline used to surface as a stack trace that didn't say which
    // file to open. Pinned because the code comment previously claimed the
    // opposite and nothing checked it.
    const bare = (() => {
      try {
        JSON.parse("{ broken");
      } catch (error) {
        return error.message;
      }
    })();
    expect(bare).to.not.contain(".json");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-schemas-"));
    try {
      const file = path.join(dir, "broken.json");
      fs.writeFileSync(file, "{ broken");
      // The filename assertion is the point of the test. Checking only the
      // label and the phrase would still pass if readJson stopped naming the
      // file — which is the exact regression this guards.
      expect(() => readJson(file, "The test fixture")).to.throw(path.basename(file));
      expect(() => readJson(file, "The test fixture")).to.throw(/The test fixture/);
      expect(() => readJson(file, "The test fixture")).to.throw(/is not valid JSON/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns parsed content when the file is valid", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-schemas-"));
    try {
      const file = path.join(dir, "ok.json");
      fs.writeFileSync(file, '{"a":1}');
      expect(readJson(file, "The test fixture")).to.deep.equal({ a: 1 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scripts/lint-schemas malformed schemas", function () {
  // Generous even though this path fails fast: on a cold cache the spawn plus
  // module load has been seen past mocha's 10s default on Windows CI.
  this.timeout(120000);

  // Both custom passes used to wrap readSchema in `catch { continue; }`, so a
  // schema that would not parse was skipped in silence. Skipping an input is
  // indistinguishable from passing on it: the lint reported "no findings" for a
  // file it never read, and `--skip-spectral` removed the only other reader.
  // That is the same silent-no-op class as the zero-match glob and the missing
  // baseline, and it is why neither call site catches any more.

  it("names the offending schema rather than a character offset", function () {
    // The seam both passes go through. Ajv-style "position 2" with no filename
    // is useless across 69 schemas -- see the sibling readJson test.
    expect(() => readSchema("definitely-not-a-real.schema.json")).to.throw();
    try {
      readSchema("definitely-not-a-real.schema.json");
    } catch (error) {
      expect(error.message).to.contain("definitely-not-a-real.schema.json");
    }
  });

  it("fails the whole lint on an unparseable schema, even with --skip-spectral", function () {
    // End-to-end on purpose. A unit test on readSchema alone would still have
    // passed with the `catch { continue; }` in place -- the defect was in the
    // callers, not the reader. --skip-spectral proves the CUSTOM passes catch
    // it, with Spectral (which would also reject the file) taken out of play.
    //
    // Covers the lintInertDefaults call site specifically: lintUniqueTitles
    // only reads page-producing schemas, and a planted file is not one, so no
    // fixture can reach that branch from outside. The reader is shared and the
    // test above pins it.
    const planted = path.join(SRC_SCHEMAS, "zz-lint-selftest-malformed.schema.json");
    fs.writeFileSync(planted, '{ "title": "broken",');
    try {
      let failed = false;
      let output = "";
      try {
        execFileSync(process.execPath, ["scripts/lint-schemas.cjs", "--skip-spectral"], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (error) {
        failed = true;
        // Asserting on the OUTPUT, not just the exit code. A non-zero exit
        // alone would also be satisfied by the harness failing to spawn node at
        // all -- which is exactly what happened on the first run of this test.
        output = `${error.stdout || ""}${error.stderr || ""}`;
      }
      expect(failed, "lint must exit non-zero on an unparseable schema").to.equal(true);
      expect(output).to.contain("zz-lint-selftest-malformed.schema.json");
    } finally {
      // Planted inside the real schema directory because SRC_SCHEMAS is derived
      // from the module's own location and cannot be redirected. Removed even
      // if the assertions throw, so a failure here cannot break every later run.
      fs.rmSync(planted, { force: true });
    }
  });
});

describe("scripts/lint-schemas inert-default registrations", function () {
  // These spawn a full lint, which compiles all 69 schemas through Ajv in
  // lintExamples -- comfortably past mocha's 10s default. The malformed-schema
  // test nearby doesn't need this because it crashes before reaching that pass.
  this.timeout(120000);

  const ACK = path.join(REPO_ROOT, "schema-lint", "inert-defaults.json");

  /** Run the lint with the custom passes only; return {failed, output}. */
  function runLint() {
    try {
      execFileSync(process.execPath, ["scripts/lint-schemas.cjs", "--skip-spectral"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });
      return { failed: false, output: "" };
    } catch (error) {
      return { failed: true, output: `${error.stdout || ""}${error.stderr || ""}` };
    }
  }

  it("every shipped registration carries a runtime and a why", function () {
    // These two fields ARE the gate. Registering a moveTo twin is only caught
    // because doing so forces someone to write the runtime's real behavior
    // beside the declared default, where the contradiction is visible. An entry
    // of just `{ "value": … }` would pass every other check while recording
    // nothing, which turns the acknowledgement file into a suppression list.
    const ack = JSON.parse(fs.readFileSync(ACK, "utf8"));
    const bad = [];
    for (const [file, pointers] of Object.entries(ack)) {
      for (const [pointer, entry] of Object.entries(pointers)) {
        for (const field of ["runtime", "why"]) {
          if (typeof entry[field] !== "string" || !entry[field].trim()) bad.push(`${file}${pointer} (${field})`);
        }
      }
    }
    expect(bad, `registrations missing metadata:\n${bad.join("\n")}`).to.deep.equal([]);
  });

  it("fails the lint when a registration drops its runtime", function () {
    // Asserted end-to-end rather than by reading the source, because the check
    // being present is not the same as the check being reached: the value and
    // orphan branches both `continue` before it in earlier drafts.
    const original = fs.readFileSync(ACK, "utf8");
    try {
      const ack = JSON.parse(original);
      const [file] = Object.keys(ack);
      const [pointer] = Object.keys(ack[file]);
      delete ack[file][pointer].runtime;
      fs.writeFileSync(ACK, JSON.stringify(ack, null, 2));

      const { failed, output } = runLint();
      expect(failed, "lint must reject a registration with no runtime").to.equal(true);
      expect(output).to.contain("has no `runtime`");
      expect(output).to.contain(pointer);
    } finally {
      fs.writeFileSync(ACK, original);
    }
  });

  it("fails the lint on a registration whose pointer no longer exists", function () {
    // The claim the ADR makes about stale entries. Unpinned, the file could
    // quietly accumulate assertions about schemas that have since changed.
    const original = fs.readFileSync(ACK, "utf8");
    try {
      const ack = JSON.parse(original);
      const [file] = Object.keys(ack);
      ack[file]["/properties/thisPointerDoesNotExist"] = {
        value: "x",
        runtime: "nowhere",
        why: "orphan probe",
      };
      fs.writeFileSync(ACK, JSON.stringify(ack, null, 2));

      const { failed, output } = runLint();
      expect(failed).to.equal(true);
      expect(output).to.contain("no longer has an inert default");
    } finally {
      fs.writeFileSync(ACK, original);
    }
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
