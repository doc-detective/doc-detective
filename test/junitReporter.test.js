// JUnit XML reporter — the machine-readable half of CI reporting.
//
// Well-formedness is the contract that matters: GitLab's `artifacts:reports:junit`
// parser rejects the whole file on a single stray control character, and a
// rejected file is indistinguishable from "no tests ran". Every assertion that
// claims the output is valid XML runs it through a real parser.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sinon from "sinon";
import { XMLParser } from "fast-xml-parser";

import { junitReporter, buildJunitXml } from "../dist/reporters/junitReporter.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep single children as arrays so assertions don't branch on arity.
  isArray: (name) => ["testsuite", "testcase"].includes(name),
});

function parse(xml) {
  return parser.parse(xml);
}

// A run with one spec per outcome, so a single fixture exercises the whole
// status mapping.
function makeResults(overrides = {}) {
  return {
    runId: "2026-07-26T13-24-05-334Z",
    runDir: "/out/.doc-detective/runs/2026-07-26T13-24-05-334Z",
    durationMs: 4500,
    summary: {
      specs: { pass: 1, fail: 1, warning: 1, skipped: 1 },
      tests: { pass: 1, fail: 1, warning: 1, skipped: 1 },
      contexts: { pass: 1, fail: 1, warning: 1, skipped: 1 },
      steps: { pass: 1, fail: 1, warning: 1, skipped: 1 },
    },
    specs: [
      {
        result: "PASS",
        specId: "spec-pass",
        description: "Passing spec",
        contentPath: "docs/pass.md",
        durationMs: 1000,
        tests: [
          {
            result: "PASS",
            testId: "test-pass",
            description: "Passing test",
            contentPath: "docs/pass.md",
            durationMs: 1000,
            contexts: [
              {
                result: "PASS",
                contextId: "ctx-pass",
                platform: "linux",
                browser: { name: "firefox", headless: true },
                durationMs: 1000,
                steps: [
                  { result: "PASS", stepId: "s-1", resultDescription: "ok" },
                ],
              },
            ],
          },
        ],
      },
      {
        result: "FAIL",
        specId: "spec-fail",
        description: "Failing spec",
        contentPath: "docs/fail.md",
        durationMs: 2000,
        tests: [
          {
            result: "FAIL",
            testId: "test-fail",
            description: "Failing test",
            contentPath: "docs/fail.md",
            durationMs: 2000,
            contexts: [
              {
                result: "FAIL",
                contextId: "ctx-fail",
                platform: "windows",
                browser: { name: "chrome" },
                durationMs: 2000,
                steps: [
                  {
                    result: "FAIL",
                    stepId: "s-bad",
                    resultDescription: "Couldn't find 'Sign in'",
                    location: { line: 42 },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        result: "WARNING",
        specId: "spec-warn",
        description: "Warning spec",
        contentPath: "docs/warn.md",
        durationMs: 500,
        tests: [
          {
            result: "WARNING",
            testId: "test-warn",
            description: "Warning test",
            durationMs: 500,
            contexts: [
              {
                result: "WARNING",
                contextId: "ctx-warn",
                platform: "mac",
                durationMs: 500,
                steps: [
                  {
                    result: "WARNING",
                    stepId: "s-warn",
                    resultDescription: "Screenshot varied by 3%",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        result: "SKIPPED",
        specId: "spec-skip",
        description: "Skipped spec",
        contentPath: "docs/skip.md",
        durationMs: 0,
        tests: [
          {
            result: "SKIPPED",
            testId: "test-skip",
            description: "Skipped test",
            durationMs: 0,
            contexts: [
              {
                result: "SKIPPED",
                contextId: "ctx-skip",
                platform: "linux",
                resultDescription: "No matching platform",
                durationMs: 0,
                steps: [],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("reporters/junitReporter", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-junit-"));
  });

  afterEach(function () {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildJunitXml() — structure", function () {
    it("emits a prolog and one testsuite per spec", function () {
      const xml = buildJunitXml(makeResults());
      assert.equal(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);

      const doc = parse(xml);
      const suites = doc.testsuites.testsuite;
      assert.equal(suites.length, 4);
      assert.deepEqual(
        suites.map((s) => s["@_name"]),
        ["Passing spec", "Failing spec", "Warning spec", "Skipped spec"]
      );
    });

    it("emits one testcase per test x context, carrying browser and platform", function () {
      const doc = parse(buildJunitXml(makeResults()));
      const names = doc.testsuites.testsuite.flatMap((s) =>
        s.testcase.map((c) => c["@_name"])
      );
      assert.deepEqual(names, [
        "Passing test [firefox / linux]",
        "Failing test [chrome / windows]",
        "Warning test [mac]",
        "Skipped test [linux]",
      ]);
    });

    it("counts tests, failures and skips to match results.summary", function () {
      const results = makeResults();
      const doc = parse(buildJunitXml(results));
      const root = doc.testsuites;
      const { contexts } = results.summary;
      const total =
        contexts.pass + contexts.fail + contexts.warning + contexts.skipped;

      assert.equal(Number(root["@_tests"]), total);
      assert.equal(Number(root["@_failures"]), contexts.fail);
      assert.equal(Number(root["@_skipped"]), contexts.skipped);
      assert.equal(Number(root["@_errors"]), 0);
    });

    it("converts durationMs to seconds", function () {
      const doc = parse(buildJunitXml(makeResults()));
      assert.equal(doc.testsuites["@_time"], "4.500");
      assert.equal(doc.testsuites.testsuite[1]["@_time"], "2.000");
      assert.equal(doc.testsuites.testsuite[1].testcase[0]["@_time"], "2.000");
    });
  });

  describe("buildJunitXml() — status mapping", function () {
    it("renders a FAIL as <failure> carrying the step's resultDescription", function () {
      const doc = parse(buildJunitXml(makeResults()));
      const testcase = doc.testsuites.testsuite[1].testcase[0];
      assert.equal(testcase.failure["@_message"], "Couldn't find 'Sign in'");
      assert.match(String(testcase.failure["#text"]), /s-bad/);
      assert.match(String(testcase.failure["#text"]), /Couldn't find 'Sign in'/);
    });

    it("renders a SKIPPED as <skipped> with its reason", function () {
      const doc = parse(buildJunitXml(makeResults()));
      const testcase = doc.testsuites.testsuite[3].testcase[0];
      assert.equal(testcase.skipped["@_message"], "No matching platform");
      assert.equal("failure" in testcase, false);
    });

    it("renders a WARNING as a passing testcase with <system-out>", function () {
      // JUnit has no warning state, and a warning must not fail the build.
      const doc = parse(buildJunitXml(makeResults()));
      const testcase = doc.testsuites.testsuite[2].testcase[0];
      assert.equal("failure" in testcase, false);
      assert.equal("skipped" in testcase, false);
      assert.match(String(testcase["system-out"]), /Screenshot varied by 3%/);
    });

    it("renders a PASS as a bare testcase", function () {
      const doc = parse(buildJunitXml(makeResults()));
      const testcase = doc.testsuites.testsuite[0].testcase[0];
      assert.equal("failure" in testcase, false);
      assert.equal("skipped" in testcase, false);
      assert.equal("system-out" in testcase, false);
    });
  });

  describe("buildJunitXml() — source attribution", function () {
    it("puts contentPath on the testsuite and testcase", function () {
      const doc = parse(buildJunitXml(makeResults()));
      assert.equal(doc.testsuites.testsuite[1]["@_file"], "docs/fail.md");
      assert.equal(
        doc.testsuites.testsuite[1].testcase[0]["@_file"],
        "docs/fail.md"
      );
    });

    it("puts the failing step's line on the testcase so CI can deep-link the doc", function () {
      const doc = parse(buildJunitXml(makeResults()));
      assert.equal(Number(doc.testsuites.testsuite[1].testcase[0]["@_line"]), 42);
      // Nothing failed here, so there is no line to point at.
      assert.equal("@_line" in doc.testsuites.testsuite[0].testcase[0], false);
    });
  });

  describe("buildJunitXml() — timestamp", function () {
    it("derives an ISO timestamp from runId", function () {
      const doc = parse(buildJunitXml(makeResults()));
      assert.equal(doc.testsuites["@_timestamp"], "2026-07-26T13:24:05.334Z");
    });

    it("omits the timestamp when runId carries a collision ordinal", function () {
      // getRunOutputDir appends `-2`, `-3` when two runs start in the same
      // millisecond; a positional reverse-transform would emit garbage.
      const doc = parse(
        buildJunitXml(makeResults({ runId: "2026-07-26T13-24-05-334Z-2" }))
      );
      assert.equal("@_timestamp" in doc.testsuites, false);
    });

    it("omits the timestamp when runId is absent", function () {
      const doc = parse(buildJunitXml(makeResults({ runId: undefined })));
      assert.equal("@_timestamp" in doc.testsuites, false);
    });
  });

  describe("buildJunitXml() — escaping and sanitization", function () {
    function withDescription(description) {
      const results = makeResults();
      results.specs[1].tests[0].contexts[0].steps[0].resultDescription =
        description;
      return results;
    }

    it("escapes XML metacharacters in attributes and text", function () {
      const xml = buildJunitXml(
        withDescription('Expected <a href="x"> & got \'b\'')
      );
      const doc = parse(xml);
      assert.equal(
        doc.testsuites.testsuite[1].testcase[0].failure["@_message"],
        'Expected <a href="x"> & got \'b\''
      );
    });

    it("strips control characters that make XML unparseable", function () {
      // Driver errors routinely carry ANSI escapes (\x1B) and NULs.
      const xml = buildJunitXml(
        withDescription("boom\u001B[31m red \u0000 end\u0007")
      );
      assert.doesNotThrow(() => parse(xml));
      assert.equal(xml.includes("\u0000"), false);
      assert.equal(xml.includes("\u001B"), false);
      assert.equal(xml.includes("\u0007"), false);
    });

    it("keeps tab, newline and carriage return, which are legal XML", function () {
      const xml = buildJunitXml(withDescription("line1\nline2\tend"));
      assert.doesNotThrow(() => parse(xml));
      assert.match(xml, /line1/);
      assert.match(xml, /line2/);
    });

    it("strips lone surrogates", function () {
      const xml = buildJunitXml(withDescription("bad \uD800 pair \uDC00 end"));
      assert.doesNotThrow(() => parse(xml));
      assert.equal(xml.includes("\uD800"), false);
      assert.equal(xml.includes("\uDC00"), false);
    });

    it("preserves a valid surrogate pair", function () {
      const xml = buildJunitXml(withDescription("emoji \u{1F600} ok"));
      assert.doesNotThrow(() => parse(xml));
      assert.match(xml, /\u{1F600}/u);
    });
  });

  describe("buildJunitXml() — degenerate input", function () {
    it("emits a valid empty document for a run with no specs", function () {
      // A zero-byte file is what GitLab's parser chokes on; an empty-but-valid
      // testsuites element is not the same thing as "no report".
      const xml = buildJunitXml({ specs: [], summary: {}, durationMs: 0 });
      const doc = parse(xml);
      assert.equal(Number(doc.testsuites["@_tests"]), 0);
      assert.equal(Number(doc.testsuites["@_failures"]), 0);
      assert.ok(xml.length > 0);
    });

    it("survives null results", function () {
      const xml = buildJunitXml(null);
      assert.doesNotThrow(() => parse(xml));
      assert.equal(Number(parse(xml).testsuites["@_tests"]), 0);
    });

    it("skips holes in the contexts array", function () {
      // test.contexts is `new Array(n)` with slots assigned as contexts
      // finish, so an aborted run leaves undefined entries.
      const results = makeResults();
      results.specs[0].tests[0].contexts = [
        undefined,
        results.specs[0].tests[0].contexts[0],
      ];
      const doc = parse(buildJunitXml(results));
      assert.equal(doc.testsuites.testsuite[0].testcase.length, 1);
    });

    it("tolerates missing tests, contexts and steps", function () {
      const xml = buildJunitXml({
        specs: [{ specId: "bare", result: "PASS" }],
        summary: {},
      });
      assert.doesNotThrow(() => parse(xml));
    });

    it("disambiguates testcases that would otherwise share a name", function () {
      // GitLab keys its test widget on classname + name; duplicates collapse.
      const results = makeResults();
      const ctx = results.specs[0].tests[0].contexts[0];
      results.specs[0].tests[0].contexts = [ctx, { ...ctx }];
      const doc = parse(buildJunitXml(results));
      const names = doc.testsuites.testsuite[0].testcase.map((c) => c["@_name"]);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe("junitReporter() — writing", function () {
    it("writes junit.xml into a directory output", async function () {
      const outputFile = await junitReporter({}, tmpDir, makeResults(), {});
      assert.equal(outputFile, path.join(tmpDir, "junit.xml"));
      assert.doesNotThrow(() => parse(fs.readFileSync(outputFile, "utf8")));
    });

    it("honors an explicit .xml output path", async function () {
      const target = path.join(tmpDir, "custom.xml");
      const outputFile = await junitReporter({}, target, makeResults(), {});
      assert.equal(outputFile, target);
    });

    it("writes beside a .json output path instead of treating it as a directory", async function () {
      // `--output results.json --reporters json junit` must not have junit
      // mkdir a directory where jsonReporter wants to write a file.
      const target = path.join(tmpDir, "results.json");
      const outputFile = await junitReporter({}, target, makeResults(), {});
      assert.equal(outputFile, path.join(tmpDir, "junit.xml"));
      assert.equal(fs.existsSync(target), false);
    });

    it("overwrites a previous run rather than suffixing", async function () {
      // A stable filename is the point: `artifacts:reports:junit: junit.xml`
      // would otherwise keep reading the first run's results forever.
      await junitReporter({}, tmpDir, makeResults(), {});
      await junitReporter({}, tmpDir, makeResults(), {});
      assert.deepEqual(fs.readdirSync(tmpDir), ["junit.xml"]);
    });

    it("creates a missing output directory", async function () {
      const nested = path.join(tmpDir, "a", "b");
      const outputFile = await junitReporter({}, nested, makeResults(), {});
      assert.equal(fs.existsSync(outputFile), true);
    });

    it("logs a path without the substring the GitHub Action parses", async function () {
      // The Action splits stdout on "results at " and require()s the last
      // segment; an XML path there is a syntax error.
      const log = sinon.stub(console, "log");
      await junitReporter({}, tmpDir, makeResults(), {});
      const output = log.args.map((a) => a.join(" ")).join("\n");
      assert.match(output, /See JUnit report at/);
      assert.equal(output.includes("results at "), false);
    });

    it("returns null and logs instead of throwing when the write fails", async function () {
      // Reporters run under Promise.all; a rejection here skips the CLI's
      // exit-code gate and telemetry flush.
      sinon.stub(console, "log");
      const error = sinon.stub(console, "error");
      sinon.stub(fs, "writeFileSync").throws(new Error("EACCES"));
      const outputFile = await junitReporter({}, tmpDir, makeResults(), {});
      assert.equal(outputFile, null);
      assert.match(error.args.map((a) => a.join(" ")).join("\n"), /EACCES/);
    });

    it("returns null when the output directory can't be created", async function () {
      sinon.stub(console, "log");
      sinon.stub(console, "error");
      sinon.stub(fs, "mkdirSync").throws(new Error("EPERM"));
      const outputFile = await junitReporter(
        {},
        path.join(tmpDir, "nope"),
        makeResults(),
        {}
      );
      assert.equal(outputFile, null);
    });
  });
});
