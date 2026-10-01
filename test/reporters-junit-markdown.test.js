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
      // Attribute values are double-quoted, so `esc()` deliberately leaves a
      // raw apostrophe alone — pin that rather than accepting either form.
      assert.match(xml, /<failure message="Couldn't find 'Sign in'">/);
      assert.match(xml, /s3/);
    });

    it("renders WARNING as a passing case that still carries its detail", function () {
      // JUnit has no warning state: the case must not count as a failure, but
      // dropping the detail entirely would lose the only record of it.
      const warned = structuredClone(results);
      warned.specs[0].tests[0].contexts[0].result = "WARNING";
      warned.specs[0].tests[0].contexts[0].steps = [
        { result: "WARNING", stepId: "s-warn", resultDescription: "Screenshot varied by 3%" },
      ];
      const xml = buildJunitXml(warned);
      const doc = parser.parse(xml);
      assert.equal(Number(doc.testsuites["@_failures"]), 1); // unchanged
      const suite = doc.testsuites.testsuite.find((s) => s["@_name"] === "Quickstart");
      assert.equal(Number(suite["@_failures"]), 0);
      assert.equal(Number(suite["@_skipped"]), 0);
      assert.match(xml, /<system-out>s-warn: Screenshot varied by 3%<\/system-out>/);

      // A warned step with neither an id nor a description still renders.
      warned.specs[0].tests[0].contexts[0].steps = [{ result: "WARNING" }];
      assert.match(buildJunitXml(warned), /<system-out>step: <\/system-out>/);
    });

    it("falls back to a generic note when a WARNING context has no warned steps", function () {
      const warned = structuredClone(results);
      warned.specs[0].tests[0].contexts[0].result = "WARNING";
      warned.specs[0].tests[0].contexts[0].steps = [];
      // Context-level reason first...
      warned.specs[0].tests[0].contexts[0].resultDescription = "context-level warning";
      assert.match(buildJunitXml(warned), /<system-out>context-level warning<\/system-out>/);
      // ...then a generic note when there is none.
      delete warned.specs[0].tests[0].contexts[0].resultDescription;
      assert.match(buildJunitXml(warned), /<system-out>Completed with warnings<\/system-out>/);
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

    it("strips noncharacters and unpaired surrogates that XML 1.0 forbids", function () {
      const dirty = structuredClone(results);
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        "a\uFFFEb\uFFFFc\uD800d\uDC00e";
      const xml = buildJunitXml(dirty);
      assert.doesNotThrow(() => parser.parse(xml));
      for (const bad of ["\uFFFE", "\uFFFF", "\uD800", "\uDC00"]) {
        assert.equal(xml.includes(bad), false, `expected ${escape(bad)} to be stripped`);
      }
      // A valid pair is not a lone surrogate and must survive.
      dirty.specs[1].tests[0].contexts[0].steps[1].resultDescription = "ok \u{1F600}";
      assert.match(buildJunitXml(dirty), /\u{1F600}/u);
    });

    it("falls back to ids, then to generic labels, when descriptions are absent", function () {
      const bare = {
        specs: [
          {
            result: "FAIL",
            specId: "spec-id-only",
            tests: [
              {
                result: "FAIL",
                testId: "test-id-only",
                contexts: [{ result: "FAIL", steps: [{ result: "FAIL" }] }],
              },
            ],
          },
          {
            result: "PASS",
            tests: [{ result: "PASS", contexts: [{ result: "PASS", steps: [] }] }],
          },
        ],
        summary: {},
      };
      const xml = buildJunitXml(bare);
      assert.doesNotThrow(() => parser.parse(xml));
      // ids stand in for descriptions...
      assert.match(xml, /name="test-id-only"/);
      assert.match(xml, /classname="spec-id-only"/);
      // ...and generic labels stand in when there is no id either.
      assert.match(xml, /name="test"/);
      assert.match(xml, /name="spec"/);
      // No browser and no platform means no bracketed suffix at all.
      assert.equal(xml.includes("[]"), false);
      // A failing step with no stepId and no description still renders.
      assert.match(xml, /step/);
    });

    it("falls back through step, context, then a generic failure message", function () {
      const noStepReason = structuredClone(results);
      const ctx = noStepReason.specs[1].tests[0].contexts[0];
      ctx.steps = [];
      ctx.resultDescription = "context-level reason";
      assert.match(buildJunitXml(noStepReason), /message="context-level reason"/);

      delete ctx.resultDescription;
      assert.match(buildJunitXml(noStepReason), /message="Test failed"/);
    });

    it("emits an empty suite for a spec with no tests", function () {
      const xml = buildJunitXml({ specs: [{ specId: "empty", result: "SKIPPED" }], summary: {} });
      assert.match(xml, /<testsuite name="empty" tests="0"[^>]*>\s*<\/testsuite>/);
      // A single child parses as an object, not an array.
      const suite = parser.parse(xml).testsuites.testsuite;
      assert.equal(Number(suite["@_failures"]), 0);
      assert.equal(Number(suite["@_skipped"]), 0);
    });

    it("emits a skipped element with an empty message when no reason is given", function () {
      const noReason = structuredClone(results);
      delete noReason.specs[1].tests[0].contexts[1].resultDescription;
      assert.match(buildJunitXml(noReason), /<skipped message=""\/>/);
    });

    it("treats a missing or negative duration as zero seconds", function () {
      const odd = structuredClone(results);
      odd.durationMs = -5;
      odd.specs[0].tests[0].contexts[0].durationMs = "not a number";
      const doc = parser.parse(buildJunitXml(odd));
      assert.equal(doc.testsuites["@_time"], "0.000");
    });

    it("emits a valid empty document for a run with no specs", function () {
      const doc = parser.parse(buildJunitXml({ specs: [], summary: {} }));
      assert.equal(Number(doc.testsuites["@_tests"]), 0);
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
      assert.equal(Number(parser.parse(xml).testsuites["@_failures"]), 2);
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

    it("bounds cell length after expanding line breaks, not before", function () {
      // Each break expands from one character to four. Clamping before the
      // expansion let a break-dense description grow past MAX_CELL, so the
      // overall size guarantee depended on how many newlines the input had.
      const dense = "a\n".repeat(400);
      const contexts = Array.from({ length: 150 }, () => ({
        result: "FAIL",
        platform: "linux",
        durationMs: 1,
        steps: Array.from({ length: 8 }, () => ({
          result: "FAIL",
          stepId: dense,
          resultDescription: dense,
        })),
      }));
      const md = buildMarkdown({
        summary: { specs: { fail: 1 } },
        specs: [{ result: "FAIL", specId: dense, tests: [{ testId: dense, contexts }] }],
      });
      assert.ok(
        Buffer.byteLength(md, "utf8") < 1024 * 1024,
        `summary was ${Buffer.byteLength(md, "utf8")} bytes`
      );
      // A cut that lands inside an inserted <br> must not leave `<b`.
      assert.equal(/<b?r?…/.test(md), false);

      // Pin the per-value bound directly: one failure, one step, every value
      // break-dense. Each of the four values clamps to MAX_CELL + the ellipsis
      // regardless of how many breaks it expanded into.
      const single = buildMarkdown({
        summary: { specs: { fail: 1 } },
        specs: [
          {
            result: "FAIL",
            specId: dense,
            tests: [
              {
                testId: dense,
                contexts: [
                  {
                    result: "FAIL",
                    steps: [{ result: "FAIL", stepId: dense, resultDescription: dense }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const row = single.split("\n").find((line) => line.startsWith("| a"));
      assert.ok(row.length <= 4 * 301 + 16, `row was ${row.length} characters`);
    });

    it("bounds the summary when one context fails an unbounded number of steps", function () {
      // MAX_FAILURES caps failing *contexts*; a single context can still fail
      // thousands of steps, and every one of them lands in the same cell.
      const many = structuredClone(results);
      many.specs[1].tests[0].contexts[0].steps = Array.from({ length: 5000 }, (_, i) => ({
        result: "FAIL",
        stepId: `step-${i}`,
        resultDescription: "y".repeat(200),
      }));
      const md = buildMarkdown(many);
      assert.ok(
        Buffer.byteLength(md, "utf8") < 1024 * 1024,
        `summary was ${Buffer.byteLength(md, "utf8")} bytes`
      );
      assert.match(md, /and 4995 more failed steps/);
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

    it("bounds the summary size when a description carries captured output", function () {
      // A failed runShell step embeds its stdout in resultDescription, so a
      // row-count cap alone can't keep the summary under GitHub's 1 MiB limit.
      const huge = structuredClone(results);
      huge.specs[1].tests[0].contexts[0].steps[1].resultDescription = "x".repeat(3_000_000);
      const md = buildMarkdown(huge);
      assert.ok(
        Buffer.byteLength(md, "utf8") < 1024 * 1024,
        `summary was ${Buffer.byteLength(md, "utf8")} bytes`
      );
      assert.match(md, /…/);
    });

    it("falls back to the context reason when no step is marked failed", function () {
      const noSteps = structuredClone(results);
      const ctx = noSteps.specs[1].tests[0].contexts[0];
      ctx.steps = [];
      ctx.resultDescription = "context-level reason";
      assert.match(buildMarkdown(noSteps), /context-level reason/);

      delete ctx.resultDescription;
      assert.match(buildMarkdown(noSteps), /Context failed/);
    });

    it("falls back to ids when specs and tests have no description", function () {
      const bare = structuredClone(results);
      delete bare.specs[1].description;
      delete bare.specs[1].tests[0].description;
      const md = buildMarkdown(bare);
      assert.match(md, /spec-fail/);
      assert.match(md, /t2/);
    });

    it("leaves a Windows path readable in the artifacts code span", function () {
      // Inside an inline-code span Markdown processes no escapes, so the table
      // cell's backslash doubling would render `C:\Users\…` as `C:\\Users\\…`.
      const win = structuredClone(results);
      win.runDir = "C:\\Users\\me\\out\\.doc-detective\\runs\\2026-08-05";
      const md = buildMarkdown(win);
      assert.match(md, /Run artifacts: `C:\\Users\\me\\out\\\.doc-detective\\runs\\2026-08-05`/);
      assert.equal(md.includes("\\\\Users"), false);
    });

    it("labels a failure whose spec and test have neither description nor id", function () {
      // Both fields are optional in the v3 schemas; without a fallback the row
      // renders as `|  |  | … |`, which reads as a malformed table row.
      const md = buildMarkdown({
        summary: { specs: { fail: 1 } },
        specs: [
          {
            result: "FAIL",
            tests: [
              {
                contexts: [
                  { result: "FAIL", steps: [{ result: "FAIL", stepId: "s", resultDescription: "boom" }] },
                ],
              },
            ],
          },
        ],
      });
      const row = md.split("\n").find((line) => line.includes("boom"));
      assert.equal(row, "| spec | test | s — boom |");
    });

    it("omits the artifacts line when the run has no runDir", function () {
      const noDir = structuredClone(results);
      delete noDir.runDir;
      assert.equal(buildMarkdown(noDir).includes("Run artifacts"), false);
    });

    it("caps the failure list and reports how many were dropped", function () {
      const many = structuredClone(results);
      many.specs[1].tests[0].contexts = Array.from({ length: 150 }, (_, i) => ({
        result: "FAIL",
        platform: "linux",
        durationMs: 1,
        steps: [{ result: "FAIL", stepId: `s-${i}`, resultDescription: "boom" }],
      }));
      const md = buildMarkdown(many);
      assert.match(md, /and 50 more failures/);
    });

    it("calls out an all-skipped run instead of reporting it as passed", function () {
      // Matches the terminal reporter: a green "Passed" should imply that
      // something actually passed.
      const md = buildMarkdown({
        summary: { specs: { pass: 0, fail: 0, warning: 0, skipped: 3 } },
        specs: [],
      });
      assert.match(md, /All items were skipped/);
      assert.equal(/\*\*Passed\*\*/.test(md), false);
    });

    it("stays under 1 MiB when every value is multi-byte", function () {
      // The row/cell/step clamps all count UTF-16 code units, but GitHub's
      // limit is UTF-8 bytes. A CJK character is one unit and three bytes, so
      // this shape clears every character clamp and still measured 1,092,178
      // bytes before the byte guard existed.
      const cjk = "一".repeat(400);
      const contexts = Array.from({ length: 150 }, () => ({
        result: "FAIL",
        platform: "linux",
        durationMs: 1,
        steps: Array.from({ length: 8 }, () => ({
          result: "FAIL",
          stepId: cjk,
          resultDescription: cjk,
        })),
      }));
      const md = buildMarkdown({
        summary: { specs: { fail: 1 } },
        specs: [{ result: "FAIL", specId: cjk, tests: [{ testId: cjk, contexts }] }],
      });

      const bytes = Buffer.byteLength(md, "utf8");
      assert.ok(bytes <= 1024 * 1024, `summary was ${bytes} bytes`);
      assert.match(md, /summary truncated to fit the 1 MiB limit/);
      // Truncating on a byte offset can split a character; the guard must not
      // leave a replacement character behind.
      assert.equal(md.includes("\uFFFD"), false);
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

    it("tolerates ragged specs and uses the singular for a one-spec run", function () {
      const md = buildMarkdown({
        summary: { specs: { fail: 1 } },
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
      });
      assert.match(md, /1 of 1 spec failed/);
      // Same singular treatment on the passing verdict, and the plural form.
      assert.match(
        buildMarkdown({ summary: { specs: { pass: 1 } }, specs: [] }),
        /\*\*Passed\*\* — 1 spec\./
      );
      assert.match(
        buildMarkdown({ summary: { specs: { pass: 2 } }, specs: [] }),
        /\*\*Passed\*\* — 2 specs\./
      );
      assert.match(md, /Context failed/);
      assert.match(md, /step/);
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
      // parent. Matches runFolderBaseDir, which resolves by what's on disk.
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
