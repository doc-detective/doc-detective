import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {
  detectTests,
  parseTests,
  generateSpecId,
} from "../dist/core/detectTests.js";
import { setConfig } from "../dist/core/config.js";

// Exercises currently-uncovered paths in src/core/detectTests.ts:
// qualifyFiles (dir recursion, dedup, missing input, glob), isValidSourceFile
// (non-spec JSON/YAML skip, missing before/after skip, disallowed extension),
// parseTests (markdown inline statements, YAML specs, runShell fileType,
// before/after merge, JSON parse-error fallback), and generateSpecId.
//
// Hermetic: tmpdir fixtures only, cleaned in afterEach. No network, no `dita`.

describe("detectTests coverage", function () {
  // AJV compiles config_v3 (a large schema) on the first setConfig call.
  this.timeout(30000);

  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-cov-"));
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  // The minimal valid spec used by most fixtures: one test, one goTo step.
  function specJSON(url) {
    return JSON.stringify({ tests: [{ steps: [{ goTo: url }] }] });
  }

  async function makeConfig(overrides) {
    return setConfig({
      config: { logLevel: "silent", ...overrides },
    });
  }

  describe("qualifyFiles", function () {
    it("returns [] and warns when no input sources are specified", async function () {
      // Build a valid config first, then blank out input so the
      // sequence-empty short-circuit (no beforeAny/input/afterAll) runs.
      const config = await makeConfig({ input: ["./README.md"] });
      config.input = [];
      config.beforeAny = [];
      config.afterAll = [];
      const specs = await detectTests({ config });
      assert.deepEqual(specs, []);
    });

    it("recurses a directory and collects valid spec files", async function () {
      write("top.json", specJSON("https://a.com"));
      write("nested/deep.json", specJSON("https://b.com"));
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 2);
    });

    it("skips node_modules entries during directory recursion", async function () {
      write("keep.json", specJSON("https://a.com"));
      write("node_modules/pkg.json", specJSON("https://b.com"));
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
    });

    it("does not recurse subdirectories when config.recursive is false", async function () {
      write("top.json", specJSON("https://a.com"));
      write("nested/deep.json", specJSON("https://b.com"));
      const config = await makeConfig({ input: [tmpDir], recursive: false });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
    });

    it("dedupes a file listed more than once", async function () {
      const f = write("a.json", specJSON("https://a.com"));
      const config = await makeConfig({ input: [f, f] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
    });

    it("skips a missing input path", async function () {
      const f = write("a.json", specJSON("https://a.com"));
      const config = await makeConfig({
        input: [f, path.join(tmpDir, "does-not-exist.json")],
      });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
    });

    it("skips an unstattable input path (e.g. a glob pattern) with a warning", async function () {
      // qualifyFiles fs.statSync's the raw source string; a glob pattern is not
      // a real path, so statSync throws and the source is skipped (catch branch).
      write("one.json", specJSON("https://a.com"));
      const real = write("two.json", specJSON("https://b.com"));
      const config = await makeConfig({
        input: [path.join(tmpDir, "*.json").split(path.sep).join("/"), real],
      });
      const specs = await detectTests({ config });
      // Only the real explicit file resolves; the glob string is skipped.
      assert.equal(specs.length, 1);
    });

    it("processes a single explicit file path", async function () {
      const f = write("solo.json", specJSON("https://a.com"));
      const config = await makeConfig({ input: [f] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
    });

    it("stamps the beforeAny / main / afterAll phase onto detected specs", async function () {
      const before = write("before.md", "# B\n\n<!-- step {\"goTo\": \"https://b.com\"} -->\n");
      const main = write("main.json", specJSON("https://m.com"));
      const after = write("after.md", "# A\n\n<!-- step {\"goTo\": \"https://a.com\"} -->\n");
      const config = await makeConfig({
        input: [main],
        beforeAny: [before],
        afterAll: [after],
      });
      const specs = await detectTests({ config });
      const phases = specs.map((s) => s._phase).sort();
      assert.deepEqual(phases, ["afterAll", "beforeAny", "main"]);
    });
  });

  describe("isValidSourceFile", function () {
    it("skips a JSON file that is valid JSON but not a valid spec", async function () {
      write("notspec.json", JSON.stringify({ hello: "world" }));
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a JSON file whose parsed content is not an object (a bare number)", async function () {
      // readFile returns a number for `42`, so the `typeof content !== "object"`
      // guard short-circuits before schema validation.
      write("scalar.json", "42");
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a YAML file that is not a valid spec", async function () {
      write("notspec.yaml", "hello: world\nnope: true\n");
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a spec whose test.before points to a missing file (relativePathBase=file)", async function () {
      write(
        "missing-before.json",
        JSON.stringify({
          tests: [{ before: "./nope-before.json", steps: [{ goTo: "https://a.com" }] }],
        })
      );
      const config = await makeConfig({ input: [tmpDir], relativePathBase: "file" });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a spec whose test.after points to a missing file (relativePathBase=file)", async function () {
      write(
        "missing-after.json",
        JSON.stringify({
          tests: [{ after: "./nope-after.json", steps: [{ goTo: "https://a.com" }] }],
        })
      );
      const config = await makeConfig({ input: [tmpDir], relativePathBase: "file" });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a spec whose test.before points to a missing file (relativePathBase=cwd)", async function () {
      // An absolute path under the (wiped-per-test) tmpDir is hermetically
      // guaranteed not to exist — unlike a bare cwd-relative name.
      const missing = path.join(tmpDir, "nonexistent-before.json");
      write(
        "missing-before-cwd.json",
        JSON.stringify({
          tests: [{ before: missing, steps: [{ goTo: "https://a.com" }] }],
        })
      );
      const config = await makeConfig({ input: [tmpDir], relativePathBase: "cwd" });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a spec whose test.after points to a missing file (relativePathBase=cwd)", async function () {
      const missing = path.join(tmpDir, "nonexistent-after.json");
      write(
        "missing-after-cwd.json",
        JSON.stringify({
          tests: [{ after: missing, steps: [{ goTo: "https://a.com" }] }],
        })
      );
      const config = await makeConfig({ input: [tmpDir], relativePathBase: "cwd" });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("skips a file whose extension is not in config.fileTypes", async function () {
      // .txt is not in any default fileType's extension list, and isn't
      // json/yaml/yml, so it falls through to the allowed-extension check.
      write("notes.txt", "just some prose, no tests here");
      const config = await makeConfig({ input: [tmpDir] });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 0);
    });

    it("includes a spec whose before/after point to existing files (merge path)", async function () {
      const beforeSpec = write(
        "setup.json",
        JSON.stringify({ tests: [{ steps: [{ runShell: { command: "echo", args: ["before"] } }] }] })
      );
      const afterSpec = write(
        "cleanup.json",
        JSON.stringify({ tests: [{ steps: [{ runShell: { command: "echo", args: ["after"] } }] }] })
      );
      const main = write(
        "main.json",
        JSON.stringify({
          tests: [
            {
              before: beforeSpec,
              after: afterSpec,
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        })
      );
      const config = await makeConfig({ input: [main] });
      const specs = await parseTests({ config, files: [main] });
      assert.equal(specs.length, 1);
      // 1 before + 1 original + 1 after = 3 steps merged.
      assert.equal(specs[0].tests[0].steps.length, 3);
    });
  });

  describe("parseTests text/markdown branches", function () {
    it("parses a markdown file with an inline step statement", async function () {
      const md = write("doc.md", "# Title\n\n<!-- step {\"goTo\": \"https://example.com\"} -->\n");
      const config = await makeConfig({ input: [md] });
      const specs = await parseTests({ config, files: [md] });
      assert.equal(specs.length, 1);
      assert.equal(specs[0].tests[0].steps[0].goTo, "https://example.com");
    });

    it("yields no spec for a markdown file containing no test statements", async function () {
      const md = write("plain.md", "# Just a heading\n\nSome prose with no tests.\n");
      const config = await makeConfig({ input: [md] });
      const specs = await parseTests({ config, files: [md] });
      // Spec has zero tests after the empty-test filter, so nothing is pushed.
      assert.equal(specs.length, 0);
    });

    it("emits a spec with a runShell step from a custom runShell fileType (#435)", async function () {
      const script = write("run.task", "echo task");
      const config = await makeConfig({
        input: [script],
        fileTypes: [
          { name: "task", extensions: ["task"], runShell: { command: "echo", args: ["ran"] } },
        ],
      });
      // The runShell branch builds + validates the test, then finalizes the
      // spec (spec_v3 validation + resolvePaths + specs.push) just like the
      // non-runShell path — so a runShell-typed file emits one spec whose single
      // test has a single runShell step.
      const specs = await parseTests({ config, files: [script] });
      assert.equal(specs.length, 1);
      assert.equal(specs[0].tests.length, 1);
      assert.equal(specs[0].tests[0].steps.length, 1);
      assert.ok(specs[0].tests[0].steps[0].runShell, "step should be a runShell step");
    });

    it("skips a file when its runShell template produces an invalid step", async function () {
      // An empty runShell object (no `command`) builds a step that fails
      // test_v3 validation, so the file is skipped (warning) and no spec emits.
      const script = write("bad.task", "echo task");
      const config = await makeConfig({
        input: [script],
        fileTypes: [
          { name: "task", extensions: ["task"], runShell: {} },
        ],
      });
      const specs = await parseTests({ config, files: [script] });
      assert.deepEqual(specs, []);
    });
  });

  describe("parseTests JSON/YAML branches", function () {
    it("parses a valid JSON spec and assigns specId / contentPath", async function () {
      const f = write("valid.json", specJSON("https://a.com"));
      const config = await makeConfig({ input: [f] });
      const specs = await parseTests({ config, files: [f] });
      assert.equal(specs.length, 1);
      assert.ok(specs[0].specId, "specId should be assigned");
      assert.equal(specs[0].contentPath, f);
    });

    it("parses a valid YAML spec file", async function () {
      const f = write(
        "valid.yaml",
        "tests:\n  - steps:\n      - goTo: https://a.com\n      - find: hello\n"
      );
      const config = await makeConfig({ input: [f] });
      const specs = await parseTests({ config, files: [f] });
      assert.equal(specs.length, 1);
      assert.equal(specs[0].tests[0].steps.length, 2);
    });

    it("falls back to readFile parsing when JSON is malformed", async function () {
      // Malformed JSON triggers the catch in the json/yaml read block, which
      // warns and falls back to readFile. readFile returns a string for broken
      // JSON, so it flows into the text branch and yields no tests.
      const f = write("broken.json", "{ this is not valid json ");
      const config = await makeConfig({ input: [f] });
      const specs = await parseTests({ config, files: [f] });
      assert.deepEqual(specs, []);
    });

    it("skips a JSON file that parses to null without crashing", async function () {
      // A JSON file whose entire content is the literal `null` parses to null.
      // Because typeof null === "object", without the null guard parseTests would
      // enter the spec branch and crash on the first property access. It must be
      // skipped (no spec emitted) instead. Bypasses qualifyFiles, which would
      // otherwise filter it — this guards direct parseTests callers.
      const f = write("null.json", "null");
      const config = await makeConfig({ input: [f] });
      const specs = await parseTests({ config, files: [f] });
      assert.deepEqual(specs, []);
    });

    it("suffixes the testId when two tests hash identically", async function () {
      // Two byte-identical tests produce the same `<specId>~<contentHash>`
      // base, so the second gets a `-2` collision suffix.
      const f = write(
        "dups.json",
        JSON.stringify({
          tests: [
            { steps: [{ goTo: "https://a.com" }] },
            { steps: [{ goTo: "https://a.com" }] },
          ],
        })
      );
      const config = await makeConfig({ input: [f] });
      const specs = await parseTests({ config, files: [f] });
      const ids = specs[0].tests.map((t) => t.testId);
      assert.equal(ids.length, 2);
      assert.notEqual(ids[0], ids[1]);
      assert.ok(ids[1].endsWith("-2"), `second id should have -2 suffix: ${ids[1]}`);
    });

    it("defaults _phase to main when no phase map is present", async function () {
      const f = write("nophase.json", specJSON("https://a.com"));
      const config = await makeConfig({ input: [f] });
      // Call parseTests directly without qualifyFiles, so config._phaseByFile
      // is absent and the `?? "main"` fallback runs.
      const specs = await parseTests({ config, files: [f] });
      assert.equal(specs[0]._phase, "main");
    });
  });

  describe("generateSpecId", function () {
    it("relativizes a path inside cwd", function () {
      const inside = path.join(process.cwd(), "sub", "spec.json");
      const id = generateSpecId(inside);
      assert.equal(id, "sub/spec.json");
    });

    it("keeps an absolute path outside cwd absolute", function () {
      // A sibling that shares a prefix with cwd must NOT be relativized.
      const sibling = process.cwd() + "-other-sibling/spec.json";
      const id = generateSpecId(sibling);
      // Should retain the sibling path, not collapse into ../-laden relatives.
      assert.ok(!id.includes(".."), `id should not contain '..': ${id}`);
      assert.ok(id.includes("-other-sibling"), `id should keep sibling segment: ${id}`);
    });

    it("strips a leading ./ and uses forward slashes", function () {
      const inside = path.join(process.cwd(), "a", "b.json");
      const id = generateSpecId(inside);
      assert.ok(!id.startsWith("./"));
      assert.ok(!id.includes("\\"), `id should use forward slashes: ${id}`);
      assert.equal(id, "a/b.json");
    });

    it("sanitizes special characters into underscores", function () {
      const inside = path.join(process.cwd(), "we ird (name)!.json");
      const id = generateSpecId(inside);
      // Spaces, parens and ! are not in [a-zA-Z0-9._\-\/], so they become _.
      assert.ok(/^[a-zA-Z0-9._\-\/]+$/.test(id), `id should be url-safe: ${id}`);
      assert.ok(id.includes("_"), `special chars should be replaced: ${id}`);
    });

    it("returns a deterministic id for the same input", function () {
      const inside = path.join(process.cwd(), "stable", "x.json");
      assert.equal(generateSpecId(inside), generateSpecId(inside));
    });
  });
});
