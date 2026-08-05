// The `junit` and `markdown` reporters are pure transforms of the same results
// object the `json` reporter serializes.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { XMLParser } from "fast-xml-parser";

import { buildJunitXml, junitReporter } from "../dist/reporters/junitReporter.js";
import { buildMarkdown, markdownReporter } from "../dist/reporters/markdownReporter.js";
import { reporters } from "../dist/utils.js";

const results = {
  runDir: "/out/.doc-detective/runs/2026-08-05",
  durationMs: 3000,
  summary: {
    specs: { pass: 1, fail: 1, warning: 0, skipped: 0 },
    tests: { pass: 1, fail: 1, warning: 0, skipped: 1 },
    contexts: { pass: 1, fail: 1, warning: 0, skipped: 1 },
    steps: { pass: 4, fail: 1, warning: 0, skipped: 2 },
  },
  specs: [
    {
      result: "PASS",
      specId: "spec-pass",
      description: "Quickstart",
      tests: [
        {
          result: "PASS",
          testId: "t1",
          description: "Happy path",
          contexts: [
            {
              result: "PASS",
              platform: "linux",
              browser: { name: "firefox" },
              durationMs: 1000,
              steps: [{ result: "PASS", stepId: "s1" }],
            },
          ],
        },
      ],
    },
    {
      result: "FAIL",
      specId: "spec-fail",
      description: "Sign-in",
      tests: [
        {
          result: "FAIL",
          testId: "t2",
          description: "Sign in with email",
          contexts: [
            {
              result: "FAIL",
              platform: "windows",
              browser: { name: "chrome" },
              durationMs: 2000,
              steps: [
                { result: "PASS", stepId: "s2" },
                { result: "FAIL", stepId: "s3", resultDescription: "Couldn't find 'Sign in'" },
              ],
            },
            {
              result: "SKIPPED",
              platform: "mac",
              durationMs: 0,
              resultDescription: "No matching platform",
              steps: [],
            },
          ],
        },
      ],
    },
  ],
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

describe("junit and markdown reporters", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-reporters-"));
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildJunitXml()", function () {
    it("maps specs to suites and test x context to cases, with counts", function () {
      const doc = parser.parse(buildJunitXml(results));
      assert.equal(Number(doc.testsuites["@_tests"]), 3);
      assert.equal(Number(doc.testsuites["@_failures"]), 1);
      assert.equal(Number(doc.testsuites["@_skipped"]), 1);
      assert.equal(doc.testsuites.testsuite.length, 2);
    });

    it("carries browser and platform in the case name", function () {
      assert.match(buildJunitXml(results), /Happy path \[firefox \/ linux\]/);
    });

    it("renders FAIL as <failure> with the step's resultDescription", function () {
      const xml = buildJunitXml(results);
      assert.match(xml, /<failure message="Couldn&apos;t find &apos;Sign in&apos;"|<failure message="Couldn't find 'Sign in'"/);
      assert.match(xml, /s3/);
    });

    it("renders SKIPPED as <skipped>", function () {
      assert.match(buildJunitXml(results), /<skipped message="No matching platform"\/>/);
    });

    it("stays parseable when a description carries XML metacharacters and control chars", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        'a <b> & "c"\u001B[31m\u0000';
      assert.doesNotThrow(() => parser.parse(buildJunitXml(dirty)));
      assert.equal(buildJunitXml(dirty).includes("\u001B"), false);
    });

    it("emits a valid empty document for a run with no specs", function () {
      const doc = parser.parse(buildJunitXml({ specs: [], summary: {} }));
      assert.equal(Number(doc.testsuites["@_tests"]), 0);
    });

    it("survives null results and holes in contexts", function () {
      assert.doesNotThrow(() => parser.parse(buildJunitXml(null)));
      const holed = structuredClone(results);
      holed.specs[0].tests[0].contexts = [null, holed.specs[0].tests[0].contexts[0]];
      const doc = parser.parse(buildJunitXml(holed));
      assert.equal(Number(doc.testsuites["@_tests"]), 3);
    });
  });

  describe("buildMarkdown()", function () {
    it("renders a summary table matching results.summary", function () {
      const md = buildMarkdown(results);
      assert.match(md, /^# Doc Detective results/);
      assert.match(md, /\| Steps \| 4 \| 1 \| 0 \| 2 \| 7 \|/);
      assert.match(md, /\*\*Failed\*\* — 1 of 2 specs failed\./);
    });

    it("names failures but only counts passes", function () {
      const md = buildMarkdown(results);
      assert.match(md, /Sign in with email/);
      assert.match(md, /Couldn't find 'Sign in'/);
      assert.equal(md.includes("Happy path"), false);
    });

    it("escapes pipes and newlines so a description can't break the table", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "a | b\nc";
      const md = buildMarkdown(dirty);
      assert.match(md, /a \\\| b<br>c/);
    });

    it("produces a valid summary for an empty run", function () {
      const md = buildMarkdown({ specs: [], summary: {} });
      assert.match(md, /No tests ran/);
      assert.equal(md.includes("## Failures"), false);
    });

    it("survives null results", function () {
      assert.ok(buildMarkdown(null).length > 0);
    });
  });

  describe("writing", function () {
    it("junit writes junit.xml into a directory output", async function () {
      const file = await junitReporter({}, tmpDir, results, {});
      assert.equal(file, path.join(tmpDir, "junit.xml"));
      assert.doesNotThrow(() => parser.parse(fs.readFileSync(file, "utf8")));
    });

    it("markdown writes doc-detective-summary.md into a directory output", async function () {
      const file = await markdownReporter({}, tmpDir, results, {});
      assert.equal(file, path.join(tmpDir, "doc-detective-summary.md"));
      assert.match(fs.readFileSync(file, "utf8"), /^# Doc Detective results/);
    });

    it("writes beside a file output rather than inside it", async function () {
      // `--output results.json --reporters json junit` must not have junit
      // create a directory where the json reporter writes a file.
      const target = path.join(tmpDir, "results.json");
      assert.equal(await junitReporter({}, target, results, {}), path.join(tmpDir, "junit.xml"));
      assert.equal(fs.existsSync(target), false);
    });

    it("returns null instead of throwing when the path can't be written", async function () {
      // Reporters run under Promise.all; a rejection skips the CLI exit gate.
      const blocked = path.join(tmpDir, "blocked");
      fs.writeFileSync(blocked, "not a directory");
      assert.equal(await junitReporter({}, path.join(blocked, "sub"), results, {}), null);
      assert.equal(await markdownReporter({}, path.join(blocked, "sub"), results, {}), null);
    });
  });

  describe("selection", function () {
    it("registers both reporters under their shorthand names", function () {
      assert.equal(typeof reporters.junitReporter, "function");
      assert.equal(typeof reporters.markdownReporter, "function");
    });
  });
});
