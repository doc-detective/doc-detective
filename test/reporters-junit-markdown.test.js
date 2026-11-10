// The `junit` and `markdown` reporters are pure transforms of the same results
// object the `json` reporter serializes.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sinon from "sinon";
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
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const environment = {
    platform: "linux",
    arch: "x64",
    osRelease: "6.8.0-1017-azure",
    docDetectiveVersion: "5.0.0",
    nodeVersion: "24.15.0",
  };
  // A run folder with real media, and a report that points at it: one failing
  // step, its fold, a warning, and a skipped context.
  function mixedRun() {
    const runDir = path.join(tmpDir, ".doc-detective", "runs", "r1");
    const shot = "specs/install-guide/shots/03 click save.png";
    const warnShot = "specs/install-guide/shots/02.png";
    const video = "specs/install-guide/recordings/linux-chrome.mp4";
    for (const file of [shot, warnShot, video]) {
      fs.mkdirSync(path.dirname(path.join(runDir, file)), { recursive: true });
      fs.writeFileSync(path.join(runDir, file), "x");
    }
    return {
      runDir,
      shot,
      video,
      report: {
        runId: "r1",
        runDir,
        startedAt: "2026-11-06T02:33:28.631Z",
        durationMs: 14200,
        environment,
        summary: {
          specs: { pass: 0, fail: 1, warning: 0, skipped: 1 },
          tests: { pass: 1, fail: 1, warning: 1, skipped: 1 },
          contexts: { pass: 1, fail: 1, warning: 1, skipped: 1 },
          steps: { pass: 1, fail: 1, warning: 1, skipped: 2 },
        },
        specs: [
          {
            specId: "install-guide",
            description: "The install guide",
            result: "FAIL",
            durationMs: 9400,
            tests: [
              {
                testId: "install",
                description: "Install the CLI",
                result: "FAIL",
                contexts: [
                  {
                    contextId: "linux-chrome",
                    result: "FAIL",
                    durationMs: 6100,
                    autoRecording: { result: "PASS", recordingPath: video },
                    steps: [
                      { stepId: "open", result: "PASS" },
                      {
                        stepId: "click-save",
                        description: "Click Save",
                        result: "FAIL",
                        resultDescription: "Couldn't find element `#save`.",
                        resultHint: "Check the selector.",
                        resultCode: "element_not_found",
                        autoScreenshotPath: shot,
                      },
                      { stepId: "next", result: "SKIPPED", resultDescription: "Skipped: a prior step failed." },
                      { stepId: "last", result: "SKIPPED", resultDescription: "Skipped: a prior step failed." },
                    ],
                  },
                ],
              },
              {
                testId: "verify",
                description: "Verify the dashboard",
                result: "WARNING",
                contexts: [
                  {
                    contextId: "linux-chrome",
                    result: "WARNING",
                    durationMs: 3300,
                    autoRecording: { result: "PASS", recordingPath: video },
                    steps: [
                      {
                        stepId: "compare",
                        result: "WARNING",
                        resultDescription: "It varied by <3%>.",
                        autoScreenshotPath: warnShot,
                      },
                    ],
                  },
                ],
              },
              {
                testId: "clean",
                result: "PASS",
                contexts: [
                  {
                    contextId: "linux-chrome",
                    result: "PASS",
                    durationMs: 100,
                    autoRecording: { result: "PASS", recordingPath: video },
                    steps: [
                      { stepId: "ok", result: "PASS" },
                      { stepId: "guarded", result: "SKIPPED", resultDescription: "Skipped: guard `if` condition not met." },
                    ],
                  },
                ],
              },
            ],
          },
          {
            specId: "mac-guide",
            result: "SKIPPED",
            tests: [
              {
                testId: "setup",
                description: "Set up a Mac",
                result: "SKIPPED",
                contexts: [
                  { contextId: "default", result: "SKIPPED", resultDescription: "Skipped: not on a Mac.", steps: [] },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  describe("buildJunitXml()", function () {
    // The parser reads single children as objects: always look at a list.
    const list = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
    const parsed = (xml) => parser.parse(xml).testsuites;
    const cases = (xml) => list(parsed(xml).testsuite).flatMap((suite) => list(suite.testcase));
    const caseNamed = (xml, name) => cases(xml).find((c) => c["@_name"] === name);
    const textOf = (node) => (typeof node === "object" ? node["#text"] : node);

    it("maps specs to suites and test x context to cases, with counts", function () {
      const doc = parsed(buildJunitXml(results));
      assert.equal(doc["@_name"], "Doc Detective");
      assert.equal(Number(doc["@_tests"]), 3);
      assert.equal(Number(doc["@_failures"]), 1);
      assert.equal(Number(doc["@_skipped"]), 1);
      assert.equal(doc.testsuite.length, 2);
    });

    it("names suites and classnames by specId, and cases as testId › contextId — description", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const [suite] = list(parsed(xml).testsuite);
      assert.equal(suite["@_name"], "install-guide");
      const testCase = caseNamed(xml, "install › linux-chrome — Install the CLI");
      assert.equal(testCase["@_classname"], "install-guide");
      assert.equal(testCase["@_time"], "6.100");
      assert.ok(caseNamed(xml, "clean › linux-chrome"), "a test with no description has no dash");
    });

    it("gives a FAIL case one <failure> with type, message, and every failing item", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const { failure } = caseNamed(xml, "install › linux-chrome — Install the CLI");
      assert.equal(failure["@_type"], "element_not_found");
      assert.equal(failure["@_message"], "Couldn't find element `#save`.");
      assert.equal(
        textOf(failure),
        [
          "install-guide › install › linux-chrome › click-save — Click Save",
          "Couldn't find element `#save`.",
          "Hint: Check the selector.",
          "2 more steps skipped after the failure.",
        ].join("\n")
      );
    });

    it("omits type when the failure has no resultCode", function () {
      const doc = buildJunitXml(results);
      assert.match(doc, /<failure message="Couldn't find 'Sign in'">/);
    });

    it("attaches the first non-PASS step's screenshot, then the recording, relative to junit.xml", function () {
      const { report, shot, video } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const out = caseNamed(xml, "install › linux-chrome — Install the CLI")["system-out"];
      const base = ".doc-detective/runs/r1/";
      assert.deepEqual(textOf(out).split("\n"), [
        `[[ATTACHMENT|${base}${shot}]]`,
        `[[ATTACHMENT|${base}${video}]]`,
      ]);
    });

    it("resolves attachments from junit.xml's own folder", function () {
      const { report, video } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "reports", "junit.xml"));
      assert.ok(xml.includes(`[[ATTACHMENT|../.doc-detective/runs/r1/${video}]]`));
    });

    it("attaches the recording to a passing case too, but nothing to a skipped case", function () {
      const { report, video } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const out = textOf(caseNamed(xml, "clean › linux-chrome")["system-out"]);
      assert.equal(out.split("\n")[0], `[[ATTACHMENT|.doc-detective/runs/r1/${video}]]`);
      assert.equal(caseNamed(xml, "setup › default — Set up a Mac")["system-out"], undefined);
    });

    it("attaches nothing when the files aren't there", function () {
      const { report } = mixedRun();
      fs.rmSync(report.runDir, { recursive: true, force: true });
      assert.equal(buildJunitXml(report, path.join(tmpDir, "junit.xml")).includes("[[ATTACHMENT|"), false);
    });

    it("puts warnings in <system-err> as Warning: lines, and keeps the case passing", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const testCase = caseNamed(xml, "verify › linux-chrome — Verify the dashboard");
      assert.equal(testCase.failure, undefined);
      assert.equal(testCase["system-err"], "Warning: install-guide › verify › linux-chrome › compare — It varied by <3%>.");
      assert.ok(xml.includes("It varied by &lt;3%&gt;."), "the description is escaped");
    });

    it("puts a step skip in a passing case in <system-out> as a Skipped: line", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const out = textOf(caseNamed(xml, "clean › linux-chrome")["system-out"]);
      assert.equal(out.split("\n")[1], "Skipped: install-guide › clean › linux-chrome › guarded — guard `if` condition not met.");
    });

    it("renders a whole-case skip with the reason as attribute and text", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const { skipped } = caseNamed(xml, "setup › default — Set up a Mac");
      assert.equal(skipped["@_message"], "Skipped: not on a Mac.");
      assert.equal(textOf(skipped), "Skipped: not on a Mac.");
      assert.match(xml, /<skipped message="Skipped: not on a Mac\.">Skipped: not on a Mac\.<\/skipped>/);
    });

    it("lists the other steps of a skipped case as Skipped: lines", function () {
      const xml = buildJunitXml({
        specs: [
          {
            specId: "s",
            tests: [
              {
                testId: "t",
                contexts: [
                  {
                    contextId: "c",
                    result: "SKIPPED",
                    steps: [
                      { stepId: "a", result: "SKIPPED", resultDescription: "Skipped: one." },
                      { stepId: "b", result: "SKIPPED", resultDescription: "Skipped: two." },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const testCase = caseNamed(xml, "t › c");
      assert.equal(testCase.skipped["@_message"], "Skipped: one.");
      assert.equal(testCase["system-out"], "Skipped: s › t › c › b — two.");
    });

    it("shows a failed automatic recording as the failure when no step failed", function () {
      const xml = buildJunitXml({
        specs: [
          {
            specId: "s",
            tests: [
              {
                testId: "t",
                contexts: [
                  {
                    contextId: "c",
                    result: "FAIL",
                    autoRecording: { result: "FAIL", resultDescription: "Couldn't stop recording." },
                    steps: [{ stepId: "ok", result: "PASS" }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const { failure } = caseNamed(xml, "t › c");
      assert.equal(failure["@_message"], "Couldn't stop recording.");
      assert.equal(textOf(failure), "s › t › c › autoRecording\nCouldn't stop recording.");
      assert.equal(xml.includes("Test failed"), false);
    });

    it("adds the suite timestamp and properties", function () {
      const { report } = mixedRun();
      const xml = buildJunitXml(report, path.join(tmpDir, "junit.xml"));
      const [suite] = list(parsed(xml).testsuite);
      assert.equal(suite["@_timestamp"], "2026-11-06T02:33:28.631Z");
      const props = Object.fromEntries(list(suite.properties.property).map((p) => [p["@_name"], p["@_value"]]));
      assert.deepEqual(props, {
        runId: "r1",
        docDetectiveVersion: "5.0.0",
        nodeVersion: "24.15.0",
        platform: "linux",
        arch: "x64",
        osRelease: "6.8.0-1017-azure",
      });
    });

    it("leaves out the timestamp and properties when a run has no runId or environment", function () {
      const xml = buildJunitXml(results);
      assert.equal(xml.includes("timestamp="), false);
      assert.equal(xml.includes("<properties>"), false);
      assert.equal(xml.includes("undefined"), false);
    });

    it("has no hostname", function () {
      const { report } = mixedRun();
      assert.equal(buildJunitXml(report, path.join(tmpDir, "junit.xml")).includes("hostname"), false);
    });

    it("stays parseable when a description carries XML metacharacters and control chars", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        'a <b> & "c"\u001B[31m\u0000';
      assert.doesNotThrow(() => parser.parse(buildJunitXml(dirty)));
      assert.equal(buildJunitXml(dirty).includes("\u001B"), false);
    });

    it("strips noncharacters and unpaired surrogates that XML 1.0 forbids", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        "a￾b￿c\uD800d\uDC00e";
      const xml = buildJunitXml(dirty);
      assert.doesNotThrow(() => parser.parse(xml));
      for (const bad of ["￾", "￿", "\uD800", "\uDC00"]) {
        assert.equal(xml.includes(bad), false, `expected ${escape(bad)} to be stripped`);
      }
      // A valid pair is not a lone surrogate and must survive.
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "ok \u{1F600}";
      assert.match(buildJunitXml(dirty), /\u{1F600}/u);
    });

    it("falls back to position labels when IDs are absent", function () {
      const xml = buildJunitXml({
        specs: [{ result: "FAIL", tests: [{ result: "FAIL", contexts: [{ result: "FAIL", steps: [{ result: "FAIL" }] }] }] }],
        summary: {},
      });
      assert.doesNotThrow(() => parser.parse(xml));
      assert.match(xml, /classname="spec 1"/);
      assert.match(xml, /name="test 1 › context 1"/);
      assert.match(xml, /spec 1 › test 1 › context 1 › step 1/);
    });

    it("falls back from the reason to the ID path for a failure with no description", function () {
      const noReason = structuredClone(results);
      const ctx = noReason.specs[1].tests[0].contexts[0];
      ctx.steps = [];
      ctx.resultDescription = "context-level reason";
      assert.match(buildJunitXml(noReason), /message="context-level reason"/);

      delete ctx.resultDescription;
      const xml = buildJunitXml(noReason);
      assert.equal(xml.includes("Test failed"), false);
      assert.match(xml, /<failure message="spec-fail › t2 › context 1">/);
    });

    it("gives a non-PASS spec with no tests, or a test with no contexts, a case of its own", function () {
      const xml = buildJunitXml({
        specs: [
          { specId: "empty", result: "SKIPPED", resultDescription: "Skipped: empty." },
          { specId: "lonely", result: "FAIL", tests: [{ testId: "t", result: "FAIL", resultDescription: "Couldn't run." }] },
          { specId: "ok", result: "PASS" },
        ],
        summary: {},
      });
      assert.equal(caseNamed(xml, "empty").skipped["@_message"], "Skipped: empty.");
      assert.equal(caseNamed(xml, "t").failure["@_message"], "Couldn't run.");
      assert.match(xml, /<testsuite name="ok" tests="0"[^>]*>\s*<\/testsuite>/);
    });

    it("emits an empty skipped element when no reason is given", function () {
      const noReason = structuredClone(results);
      delete noReason.specs[1].tests[0].contexts[1].resultDescription;
      assert.match(buildJunitXml(noReason), /<skipped message=""><\/skipped>/);
    });

    it("treats a missing or negative duration as zero seconds", function () {
      const odd = structuredClone(results);
      odd.durationMs = -5;
      odd.specs[0].tests[0].contexts[0].durationMs = "not a number";
      assert.equal(parsed(buildJunitXml(odd))["@_time"], "0.000");
    });

    it("emits a valid empty document for a run with no specs", function () {
      assert.equal(Number(parsed(buildJunitXml({ specs: [], summary: {} }))["@_tests"]), 0);
    });

    it("tolerates specs, tests and contexts that omit their child arrays", function () {
      const ragged = {
        summary: {},
        specs: [
          { result: "FAIL", specId: "no-tests" },
          { result: "FAIL", specId: "no-contexts", tests: [{ testId: "t" }] },
          {
            result: "FAIL",
            specId: "no-steps",
            tests: [{ testId: "t", contexts: [{ result: "FAIL" }] }],
          },
          {
            result: "FAIL",
            specId: "bare-step",
            tests: [{ testId: "t", contexts: [{ result: "FAIL", steps: [{ result: "FAIL" }] }] }],
          },
        ],
      };
      const xml = buildJunitXml(ragged);
      assert.doesNotThrow(() => parser.parse(xml));
      assert.equal(Number(parser.parse(xml).testsuites["@_failures"]), 3);
    });

    it("survives null results and holes in contexts", function () {
      assert.doesNotThrow(() => parser.parse(buildJunitXml(null)));
      const holed = structuredClone(results);
      holed.specs[0].tests[0].contexts = [null, holed.specs[0].tests[0].contexts[0]];
      assert.equal(Number(parsed(buildJunitXml(holed))["@_tests"]), 3);
    });
  });

  describe("buildMarkdown()", function () {
    const counts = (pass, fail, warning, skipped) => ({ pass, fail, warning, skipped });
    const verdictOf = (tests) => buildMarkdown({ summary: { tests }, specs: [] }).split("\n")[2];

    it("renders a summary table matching results.summary", function () {
      const md = buildMarkdown(results);
      assert.match(md, /^# Doc Detective results/);
      assert.match(md, /\| Steps \| 4 \| 1 \| 0 \| 2 \| 7 \|/);
    });

    it("reads the verdict at the test level, for every row", function () {
      assert.equal(verdictOf(counts(0, 0, 0, 0)), "**No tests ran.**");
      assert.equal(verdictOf(counts(9, 1, 2, 3)), "**Failed** — 1 of 15 tests failed (2 with warnings, 3 skipped).");
      assert.equal(verdictOf(counts(0, 0, 0, 3)), "**Skipped** — All 3 tests skipped.");
      assert.equal(verdictOf(counts(0, 0, 2, 0)), "**Passed with warnings** — 2 of 2 tests passed (2 with warnings).");
      assert.equal(verdictOf(counts(7, 0, 2, 3)), "**Passed with warnings** — 9 of 12 tests passed (2 with warnings, 3 skipped).");
      assert.equal(verdictOf(counts(1, 0, 0, 0)), "**Passed** — 1 of 1 test passed.");
    });

    it("lays out the verdict, table, environment line, and sections in order", function () {
      const { report } = mixedRun();
      const md = buildMarkdown(report, path.join(tmpDir, "doc-detective-summary.md"));
      const order = [
        "# Doc Detective results",
        "**Failed** — 1 of 4 tests failed (1 with warnings, 1 skipped).",
        "| Level | Pass | Fail | Warning | Skipped | Total |",
        "Doc Detective 5.0.0 · Node.js 24.15.0 · linux 6.8.0-1017-azure (x64) · Started 2026-11-06T02:33:28.631Z · Took 14.2 s",
        "## Failures",
        "| Location | Details |",
        "<details><summary>Warnings (1)</summary>",
        "<details><summary>Skipped (2)</summary>",
        "Run artifacts: `.doc-detective/runs/r1`",
      ];
      const places = order.map((line) => md.indexOf(line));
      assert.ok(places.every((place) => place >= 0), `${places} in:\n${md}`);
      assert.deepEqual(places, [...places].sort((x, y) => x - y));
      assert.equal(md.split("</details>").length, 3);
    });

    it("names each item by ID path and description, with its reason, hint, evidence, and fold", function () {
      const { report, shot, video } = mixedRun();
      const md = buildMarkdown(report, path.join(tmpDir, "doc-detective-summary.md"));
      const row = md.split("\n").find((line) => line.includes("click-save"));
      assert.equal(
        row,
        "| `install-guide › install › linux-chrome › click-save` Click Save | Couldn't find element `#save`.<br>Hint: Check the selector.<br>" +
          `Screenshot: \`.doc-detective/runs/r1/${shot}\`<br>Recording: \`.doc-detective/runs/r1/${video}\`<br>2 more steps skipped after the failure. |`
      );
    });

    it("prints paths relative to the summary file's folder", function () {
      const { report, video } = mixedRun();
      const md = buildMarkdown(report, path.join(tmpDir, "reports", "doc-detective-summary.md"));
      assert.ok(md.includes(`Recording: \`../.doc-detective/runs/r1/${video}\``));
      assert.ok(md.includes("Run artifacts: `../.doc-detective/runs/r1`"));
    });

    it("prints Run artifacts only when the run folder exists", function () {
      const { report } = mixedRun();
      const file = path.join(tmpDir, "doc-detective-summary.md");
      assert.ok(buildMarkdown(report, file).includes("Run artifacts"));
      fs.rmSync(report.runDir, { recursive: true, force: true });
      assert.equal(buildMarkdown(report, file).includes("Run artifacts"), false);
      const { runDir, ...noDir } = report;
      assert.equal(buildMarkdown(noDir, file).includes("Run artifacts"), false);
    });

    it("leaves a section out when it has no items", function () {
      const md = buildMarkdown({
        summary: { tests: counts(1, 0, 0, 0) },
        specs: [{ specId: "s", tests: [{ testId: "t", contexts: [{ contextId: "c", result: "PASS", steps: [] }] }] }],
      });
      for (const heading of ["## Failures", "Warnings (", "Skipped ("]) assert.equal(md.includes(heading), false, heading);
    });

    it("shows a failed automatic recording as the failure when no step failed", function () {
      const md = buildMarkdown({
        summary: { tests: counts(0, 1, 0, 0) },
        specs: [
          {
            specId: "s",
            tests: [
              {
                testId: "t",
                contexts: [
                  { contextId: "c", result: "FAIL", autoRecording: { result: "FAIL", resultDescription: "Couldn't stop recording." }, steps: [] },
                ],
              },
            ],
          },
        ],
      });
      assert.ok(md.includes("| `s › t › c › autoRecording` | Couldn't stop recording. |"));
    });

    it("escapes pipes and newlines so a description can't break the table", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "a | b\nc";
      const md = buildMarkdown(dirty);
      assert.match(md, /a \\\| b<br>c/);
    });

    it("escapes a pipe in an ID path, which would split the cell even inside a code span", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].stepId = "a|b";
      assert.ok(buildMarkdown(dirty).includes("a\\|b`"));
    });

    it("converts a bare carriage return, not just newlines", function () {
      // Captured stdout from a progress bar is full of bare \r, and one would
      // end the table row exactly as a newline does.
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "10%\r50%\r\n100%\ndone";
      const md = buildMarkdown(dirty);
      assert.match(md, /10%<br>50%<br>100%<br>done/);
      assert.equal(/[\r\n]done/.test(md), false);
    });

    it("escapes a raw < so a description naming an element doesn't swallow the cell", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        "Couldn't find '<button>' before the timeout";
      const md = buildMarkdown(dirty);
      assert.match(md, /&lt;button&gt;|&lt;button>/);
      assert.match(md, /before the timeout/);
    });

    it("escapes an ampersand so an entity in the text isn't decoded away", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "expected a &lt; b, got AT&T";
      const md = buildMarkdown(dirty);
      // The literal entity survives as text rather than rendering as `a < b`.
      assert.match(md, /expected a &amp;lt; b, got AT&amp;T/);
    });

    it("escapes a backslash so it can't consume the pipe escape", function () {
      // `a\|b` would otherwise render as a literal backslash followed by a
      // cell break.
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "a\\|b";
      const md = buildMarkdown(dirty);
      // `a\|b` must become `a\\\|b`: the backslash escaped to a literal
      // backslash, then the pipe escaped separately. Without the first
      // replacement it would be `a\\|b` — a literal backslash and a cell break.
      assert.ok(md.includes("a\\\\\\|b"), `expected an escaped backslash and pipe in: ${md}`);
    });

    it("clamps each value after expanding line breaks, not before", function () {
      // Each break expands from one character to four. Clamping before the
      // expansion let a break-dense description grow past the limit.
      const dense = "a\n".repeat(400);
      const md = buildMarkdown({
        summary: { tests: counts(0, 1, 0, 0) },
        specs: [
          {
            specId: dense,
            tests: [
              {
                testId: dense,
                contexts: [{ result: "FAIL", steps: [{ result: "FAIL", stepId: dense, description: dense, resultDescription: dense, resultHint: dense }] }],
              },
            ],
          },
        ],
      });
      const row = md.split("\n").find((line) => line.startsWith("| `a"));
      // ID path, description, reason, and hint, each at most 300 plus the ellipsis.
      assert.ok(row.length <= 4 * 301 + 32, `row was ${row.length} characters`);
      // A cut that lands inside an inserted <br> must not leave `<b`.
      assert.equal(/<b?r?…/.test(md), false);
    });

    it("keeps evidence paths whole when the reason fills its clamp", function () {
      const { report, video } = mixedRun();
      report.specs[0].tests[0].contexts[0].steps[1].resultDescription = "x".repeat(3_000_000);
      const md = buildMarkdown(report, path.join(tmpDir, "doc-detective-summary.md"));
      assert.ok(Buffer.byteLength(md, "utf8") < 1024 * 1024);
      assert.ok(md.includes(`x…<br>Hint: Check the selector.<br>Screenshot: `));
      assert.ok(md.includes(`Recording: \`.doc-detective/runs/r1/${video}\``));
    });

    function reportWith(status, length, extra = {}) {
      return {
        result: status,
        contextId: "c",
        steps: Array.from({ length }, (_, i) => ({ result: status, stepId: `${status}-${i}`, resultDescription: "boom", ...extra })),
      };
    }

    it("caps each section at 100 rows, then says how many more", function () {
      const md = buildMarkdown({
        summary: { tests: counts(0, 1, 1, 1) },
        specs: [
          {
            specId: "s",
            tests: [
              { testId: "f", contexts: [reportWith("FAIL", 150)] },
              { testId: "w", contexts: [reportWith("WARNING", 101)] },
              { testId: "k", contexts: [reportWith("SKIPPED", 100)] },
            ],
          },
        ],
      });
      assert.equal(md.split("\n").filter((l) => l.includes("FAIL-")).length, 100);
      assert.ok(md.includes("… and 50 more"));
      assert.equal(md.split("\n").filter((l) => l.includes("WARNING-")).length, 100);
      assert.ok(md.includes("… and 1 more"));
      assert.equal(md.split("\n").filter((l) => l.includes("SKIPPED-")).length, 100);
      assert.equal(md.match(/… and \d+ more/g).length, 2);
    });

    // 300 rows of multi-byte values reach GitHub's 1 MiB limit past every clamp.
    const cjk = "一".repeat(400);
    const heavy = { stepId: cjk, description: cjk, resultDescription: cjk, resultHint: cjk };
    const heavyRun = (...statuses) => ({
      summary: { tests: counts(0, 1, 1, 1) },
      specs: [
        {
          specId: "s",
          tests: statuses.map((status) => ({ testId: status, contexts: [reportWith(status, 100, heavy)] })),
        },
      ],
    });

    it("cuts Skipped, then Warnings, before Failures, to fit 1 MiB", function () {
      const md = buildMarkdown(heavyRun("FAIL", "WARNING", "SKIPPED"));
      const bytes = Buffer.byteLength(md, "utf8");
      assert.ok(bytes <= 1024 * 1024, `summary was ${bytes} bytes`);
      assert.equal(md.includes("Skipped ("), false, "Skipped goes first");
      assert.ok(md.includes("Warnings ("), "Warnings stay while they fit");
      assert.ok(md.includes("## Failures"));
      assert.match(md, /summary truncated to fit the 1 MiB limit/);
      // Truncating on a byte offset can split a character; the guard must not
      // leave a replacement character behind.
      assert.equal(md.includes("�"), false);
    });

    it("cuts Warnings too when Failures and Warnings still don't fit", function () {
      // Evidence paths aren't clamped, and a summary far from its run folder has
      // long ones. No folder on this path has to exist.
      fs.writeFileSync(path.join(tmpDir, "a.png"), "x");
      const shot = { autoScreenshotPath: path.join(tmpDir, "a.png") };
      const run = {
        runDir: tmpDir,
        summary: { tests: counts(0, 1, 1, 0) },
        specs: [
          {
            specId: "s",
            tests: [
              { testId: "f", contexts: [reportWith("FAIL", 100, shot)] },
              { testId: "w", contexts: [reportWith("WARNING", 100, shot)] },
            ],
          },
        ],
      };
      const md = buildMarkdown(run, path.join(tmpDir, "d/".repeat(2000), "doc-detective-summary.md"));
      assert.ok(Buffer.byteLength(md, "utf8") <= 1024 * 1024);
      assert.equal(md.includes("Warnings ("), false);
      assert.equal(md.split("\n").filter((l) => l.includes("FAIL-")).length, 100);
      assert.match(md, /summary truncated to fit the 1 MiB limit/);
    });

    it("truncates Failures only as a last resort", function () {
      fs.writeFileSync(path.join(tmpDir, "a.png"), "x");
      const run = {
        runDir: tmpDir,
        summary: { tests: counts(0, 1, 0, 0) },
        specs: [{ specId: "s", tests: [{ testId: "f", contexts: [reportWith("FAIL", 100, { autoScreenshotPath: path.join(tmpDir, "a.png") })] }] }],
      };
      const md = buildMarkdown(run, path.join(tmpDir, "d/".repeat(5000), "doc-detective-summary.md"));
      assert.ok(Buffer.byteLength(md, "utf8") <= 1024 * 1024);
      assert.ok(md.includes("## Failures"));
      assert.match(md, /summary truncated to fit the 1 MiB limit/);
    });

    it("leaves an already-small summary untouched by the byte guard", function () {
      const md = buildMarkdown(results);
      assert.equal(/summary truncated/.test(md), false);
    });

    it("produces a valid summary for an empty run", function () {
      const md = buildMarkdown({ specs: [], summary: {} });
      assert.match(md, /No tests ran/);
      assert.equal(md.includes("## Failures"), false);
    });

    it("survives null results", function () {
      assert.ok(buildMarkdown(null).length > 0);
    });

    it("has no undefined in a run with no runId or environment", function () {
      const md = buildMarkdown(results);
      assert.equal(md.includes("undefined"), false);
      assert.equal(md.includes("Doc Detective 5"), false);
    });

    it("tolerates ragged specs", function () {
      const md = buildMarkdown({
        summary: { tests: { fail: 1 } },
        specs: [
          { result: "FAIL", specId: "no-tests" },
          { result: "FAIL", specId: "no-contexts", tests: [{ testId: "t" }] },
          { result: "FAIL", specId: "no-steps", tests: [{ testId: "t", contexts: [{ result: "FAIL" }] }] },
          { result: "FAIL", specId: "bare-step", tests: [{ testId: "t", contexts: [{ result: "FAIL", steps: [{ result: "FAIL" }] }] }] },
        ],
      });
      assert.match(md, /1 of 1 test failed/);
      for (const id of ["no-tests", "no-steps › t › context 1", "bare-step › t › context 1 › step 1"]) {
        assert.ok(md.includes(id), id);
      }
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
      // `--output results.json --reporters json junit markdown` must not have
      // either reporter create a directory where the json reporter writes a
      // file.
      const target = path.join(tmpDir, "results.json");
      assert.equal(await junitReporter({}, target, results, {}), path.join(tmpDir, "junit.xml"));
      assert.equal(
        await markdownReporter({}, target, results, {}),
        path.join(tmpDir, "doc-detective-summary.md")
      );
      assert.equal(fs.existsSync(target), false);
    });

    it("treats a dotted directory as a directory, not a file", async function () {
      // `path.extname` alone would call `reports.v1` a file and write to the
      // parent. reportOutputDir resolves by what's on disk.
      const dotted = path.join(tmpDir, "reports.v1");
      fs.mkdirSync(dotted);
      assert.equal(
        await junitReporter({}, dotted, results, {}),
        path.join(dotted, "junit.xml")
      );
      assert.equal(
        await markdownReporter({}, dotted, results, {}),
        path.join(dotted, "doc-detective-summary.md")
      );
    });

    it("treats a not-yet-created path without a report extension as a directory", async function () {
      const fresh = path.join(tmpDir, "nested", "out");
      assert.equal(
        await junitReporter({}, fresh, results, {}),
        path.join(fresh, "junit.xml")
      );
    });

    it("writes beside an existing file that has no report extension", async function () {
      // Resolution falls through to what's on disk: an existing plain file is
      // a file, so the report lands next to it.
      const plain = path.join(tmpDir, "notes");
      fs.writeFileSync(plain, "a file, not a directory");
      assert.equal(
        await junitReporter({}, plain, results, {}),
        path.join(tmpDir, "junit.xml")
      );
    });

    it("defaults a nullish or empty output to the working directory", async function () {
      const cwd = process.cwd();
      process.chdir(tmpDir);
      try {
        const expected = path.join(fs.realpathSync(tmpDir), "junit.xml");
        assert.equal(await junitReporter({}, undefined, results, {}), expected);
        assert.equal(await junitReporter({}, "", results, {}), expected);
      } finally {
        process.chdir(cwd);
      }
    });

    it("overwrites both fixed names, and announces each on stderr only", async function () {
      const log = sinon.stub(console, "log");
      const error = sinon.stub(console, "error");
      const junit = path.join(tmpDir, "junit.xml");
      const summary = path.join(tmpDir, "doc-detective-summary.md");
      fs.writeFileSync(junit, "old");
      fs.writeFileSync(summary, "old");
      assert.equal(await junitReporter({}, tmpDir, results, {}), junit);
      assert.equal(await markdownReporter({}, tmpDir, results, {}), summary);
      assert.notEqual(fs.readFileSync(junit, "utf8"), "old");
      assert.notEqual(fs.readFileSync(summary, "utf8"), "old");
      assert.deepEqual(
        error.getCalls().map((c) => c.args[0]),
        [`JUnit report: ${junit}`, `Markdown summary: ${summary}`]
      );
      assert.equal(log.called, false);
    });

    it("hides the announcements at -l warning", async function () {
      const error = sinon.stub(console, "error");
      await junitReporter({ logLevel: "warning" }, tmpDir, results, {});
      await markdownReporter({ logLevel: "warning" }, tmpDir, results, {});
      assert.equal(error.called, false);
    });

    it("links media from where the file lands", async function () {
      sinon.stub(console, "error");
      const { report, video } = mixedRun();
      const reports = path.join(tmpDir, "reports");
      await junitReporter({}, reports, report, {});
      await markdownReporter({}, reports, report, {});
      const rel = `../.doc-detective/runs/r1/${video}`;
      assert.ok(fs.readFileSync(path.join(reports, "junit.xml"), "utf8").includes(`[[ATTACHMENT|${rel}]]`));
      assert.ok(fs.readFileSync(path.join(reports, "doc-detective-summary.md"), "utf8").includes(`\`${rel}\``));
    });

    it("returns null instead of throwing when the path can't be written", async function () {
      // Reporters run under Promise.all; a rejection skips the CLI exit gate.
      const error = sinon.stub(console, "error");
      const blocked = path.join(tmpDir, "blocked");
      fs.writeFileSync(blocked, "not a directory");
      assert.equal(await junitReporter({}, path.join(blocked, "sub"), results, {}), null);
      assert.equal(await markdownReporter({}, path.join(blocked, "sub"), results, {}), null);
      assert.match(error.firstCall.args[0], /^Error: Couldn't write the JUnit report to .*junit\.xml: /);
      assert.match(error.lastCall.args[0], /^Error: Couldn't write the Markdown summary to .*doc-detective-summary\.md: /);
    });
  });

  describe("selection", function () {
    it("registers both reporters under their shorthand names", function () {
      assert.equal(typeof reporters.junitReporter, "function");
      assert.equal(typeof reporters.markdownReporter, "function");
    });
  });
});
