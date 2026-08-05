// Markdown reporter — the human-readable half of CI reporting.
//
// Target surfaces are GitHub's $GITHUB_STEP_SUMMARY (hard 1 MiB cap, upload
// fails past it) and GitLab MR notes. Both render raw <details> inside
// Markdown, so failures collapse instead of burying the summary.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sinon from "sinon";

import {
  markdownReporter,
  buildMarkdown,
  MAX_SUMMARY_BYTES,
} from "../dist/reporters/markdownReporter.js";

function makeResults(overrides = {}) {
  return {
    runId: "2026-07-26T13-24-05-334Z",
    runDir: "/out/.doc-detective/runs/2026-07-26T13-24-05-334Z",
    durationMs: 4500,
    summary: {
      specs: { pass: 2, fail: 1, warning: 0, skipped: 1 },
      tests: { pass: 3, fail: 1, warning: 1, skipped: 1 },
      contexts: { pass: 4, fail: 1, warning: 1, skipped: 2 },
      steps: { pass: 17, fail: 2, warning: 1, skipped: 5 },
    },
    specs: [
      {
        result: "PASS",
        specId: "spec-pass",
        description: "Quickstart guide",
        contentPath: "docs/quickstart.md",
        durationMs: 1000,
        tests: [
          {
            result: "PASS",
            testId: "test-pass",
            description: "Happy path",
            durationMs: 1000,
            contexts: [
              {
                result: "PASS",
                contextId: "ctx-pass",
                platform: "linux",
                browser: { name: "firefox" },
                durationMs: 1000,
                steps: [{ result: "PASS", stepId: "s-ok" }],
              },
            ],
          },
        ],
      },
      {
        result: "FAIL",
        specId: "spec-fail",
        description: "Sign-in walkthrough",
        contentPath: "docs/sign-in.md",
        durationMs: 3000,
        tests: [
          {
            result: "FAIL",
            testId: "test-fail",
            description: "Sign in with email",
            durationMs: 3000,
            contexts: [
              {
                result: "FAIL",
                contextId: "ctx-fail",
                platform: "windows",
                browser: { name: "chrome" },
                durationMs: 3000,
                steps: [
                  { result: "PASS", stepId: "s-goto" },
                  {
                    result: "FAIL",
                    stepId: "s-find",
                    resultDescription: "Couldn't find 'Sign in'",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("reporters/markdownReporter", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-markdown-"));
  });

  afterEach(function () {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildMarkdown() — summary", function () {
    it("leads with a title and a failing verdict", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /^# Doc Detective results/);
      assert.match(md, /Failed/i);
    });

    it("reports a passing verdict when nothing failed", function () {
      const results = makeResults();
      results.summary = {
        specs: { pass: 2, fail: 0, warning: 0, skipped: 0 },
        tests: { pass: 2, fail: 0, warning: 0, skipped: 0 },
        contexts: { pass: 2, fail: 0, warning: 0, skipped: 0 },
        steps: { pass: 9, fail: 0, warning: 0, skipped: 0 },
      };
      results.specs = [results.specs[0]];
      const md = buildMarkdown(results);
      assert.match(md, /Passed/i);
      assert.equal(/Failed/i.test(md), false);
    });

    it("renders a summary table whose numbers match results.summary exactly", function () {
      const results = makeResults();
      const md = buildMarkdown(results);
      for (const [level, counts] of Object.entries(results.summary)) {
        const total = counts.pass + counts.fail + counts.warning + counts.skipped;
        const row = md
          .split("\n")
          .find((line) => line.toLowerCase().startsWith(`| ${level}`));
        assert.ok(row, `expected a table row for ${level}`);
        assert.deepEqual(
          row
            .split("|")
            .slice(2, -1)
            .map((cell) => Number(cell.trim())),
          [counts.pass, counts.fail, counts.warning, counts.skipped, total]
        );
      }
    });

    it("links to the run artifacts folder", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /\.doc-detective[\\/]runs[\\/]2026-07-26T13-24-05-334Z/);
    });
  });

  describe("buildMarkdown() — failures", function () {
    it("enumerates the failing step and its resultDescription", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /Sign-in walkthrough/);
      assert.match(md, /Sign in with email/);
      assert.match(md, /s-find/);
      assert.match(md, /Couldn't find 'Sign in'/);
    });

    it("collapses failures in <details> so the summary stays readable", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /<details>/);
      assert.match(md, /<\/details>/);
    });

    it("does not enumerate passing specs, only counts them", function () {
      const md = buildMarkdown(makeResults());
      assert.equal(md.includes("Quickstart guide"), false);
      assert.equal(md.includes("s-goto"), false);
      assert.match(md, /4 passed/i);
    });

    it("rolls skipped contexts up to a count", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /2 skipped/i);
    });

    it("omits the failures section entirely for a clean run", function () {
      const results = makeResults();
      results.specs = [results.specs[0]];
      results.summary.specs.fail = 0;
      results.summary.tests.fail = 0;
      results.summary.contexts.fail = 0;
      results.summary.steps.fail = 0;
      const md = buildMarkdown(results);
      assert.equal(md.includes("## Failures"), false);
    });
  });

  describe("buildMarkdown() — slowest contexts", function () {
    it("lists the slowest contexts using durationMs", function () {
      const md = buildMarkdown(makeResults());
      assert.match(md, /Slowest/i);
      // 3000ms is the slower of the two contexts, so it leads the list.
      assert.match(md, /3\.0s/);
    });

    it("omits the section when nothing has a measured duration", function () {
      const results = makeResults();
      results.specs.forEach((spec) =>
        spec.tests.forEach((test) =>
          test.contexts.forEach((context) => {
            context.durationMs = 0;
          })
        )
      );
      assert.equal(/Slowest/i.test(buildMarkdown(results)), false);
    });
  });

  describe("buildMarkdown() — escaping", function () {
    it("escapes pipes and newlines so a resultDescription can't break a table", function () {
      const results = makeResults();
      results.specs[1].tests[0].contexts[0].steps[1].resultDescription =
        "expected a | b\ngot c | d";
      const md = buildMarkdown(results);
      assert.match(md, /a \\\| b/);
      assert.equal(md.includes("a | b\ngot"), false);
    });

    it("escapes a pipe in a spec description", function () {
      const results = makeResults();
      results.specs[1].description = "Sign-in | walkthrough";
      const md = buildMarkdown(results);
      assert.match(md, /Sign-in \\\| walkthrough/);
    });
  });

  describe("buildMarkdown() — size cap", function () {
    it("stays under the cap and ends with a truncation footer on a huge run", function () {
      // GitHub rejects the whole step-summary upload past 1 MiB, so a 5,000
      // step run must still produce something uploadable.
      const results = makeResults();
      const contexts = [];
      for (let i = 0; i < 5000; i++) {
        contexts.push({
          result: "FAIL",
          contextId: `ctx-${i}`,
          platform: "linux",
          browser: { name: "chrome" },
          durationMs: 10,
          steps: [
            {
              result: "FAIL",
              stepId: `step-${i}`,
              resultDescription: `failure number ${i} `.repeat(20),
            },
          ],
        });
      }
      results.specs[1].tests[0].contexts = contexts;

      const md = buildMarkdown(results);
      assert.ok(
        Buffer.byteLength(md, "utf8") <= MAX_SUMMARY_BYTES,
        `expected <= ${MAX_SUMMARY_BYTES} bytes, got ${Buffer.byteLength(md, "utf8")}`
      );
      assert.match(md, /and \d+ more failures/);
      // The summary table must survive truncation — it's the part a reviewer
      // reads first.
      assert.match(md, /\| Steps \|/);
    });

    it("never splits a multi-byte character", function () {
      const results = makeResults();
      const contexts = [];
      for (let i = 0; i < 4000; i++) {
        contexts.push({
          result: "FAIL",
          contextId: `ctx-${i}`,
          platform: "linux",
          durationMs: 1,
          steps: [
            {
              result: "FAIL",
              stepId: `step-${i}`,
              resultDescription: "🌱".repeat(60),
            },
          ],
        });
      }
      results.specs[1].tests[0].contexts = contexts;
      const md = buildMarkdown(results);
      assert.equal(md.includes("�"), false);
      assert.equal(Buffer.from(md, "utf8").toString("utf8"), md);
    });
  });

  describe("buildMarkdown() — degenerate input", function () {
    it("produces a valid summary for an empty run rather than an empty file", function () {
      const md = buildMarkdown({ specs: [], summary: {} });
      assert.ok(md.trim().length > 0);
      assert.match(md, /^# Doc Detective results/);
      assert.match(md, /No tests ran/i);
    });

    it("survives null results", function () {
      const md = buildMarkdown(null);
      assert.ok(md.trim().length > 0);
    });

    it("skips holes in the contexts array", function () {
      const results = makeResults();
      results.specs[1].tests[0].contexts = [
        undefined,
        results.specs[1].tests[0].contexts[0],
      ];
      assert.doesNotThrow(() => buildMarkdown(results));
    });

    it("tolerates missing tests, contexts and steps", function () {
      assert.doesNotThrow(() =>
        buildMarkdown({ specs: [{ specId: "bare", result: "FAIL" }], summary: {} })
      );
    });
  });

  describe("markdownReporter() — writing", function () {
    it("writes doc-detective-summary.md into a directory output", async function () {
      const outputFile = await markdownReporter({}, tmpDir, makeResults(), {});
      assert.equal(outputFile, path.join(tmpDir, "doc-detective-summary.md"));
      assert.match(fs.readFileSync(outputFile, "utf8"), /^# Doc Detective results/);
    });

    it("honors an explicit .md output path", async function () {
      const target = path.join(tmpDir, "custom.md");
      assert.equal(await markdownReporter({}, target, makeResults(), {}), target);
    });

    it("writes beside a .json output path instead of treating it as a directory", async function () {
      const target = path.join(tmpDir, "results.json");
      const outputFile = await markdownReporter({}, target, makeResults(), {});
      assert.equal(outputFile, path.join(tmpDir, "doc-detective-summary.md"));
      assert.equal(fs.existsSync(target), false);
    });

    it("overwrites a previous run rather than suffixing", async function () {
      await markdownReporter({}, tmpDir, makeResults(), {});
      await markdownReporter({}, tmpDir, makeResults(), {});
      assert.deepEqual(fs.readdirSync(tmpDir), ["doc-detective-summary.md"]);
    });

    it("creates a missing output directory", async function () {
      const nested = path.join(tmpDir, "a", "b");
      const outputFile = await markdownReporter({}, nested, makeResults(), {});
      assert.equal(fs.existsSync(outputFile), true);
    });

    it("logs a path without the substring the GitHub Action parses", async function () {
      const log = sinon.stub(console, "log");
      await markdownReporter({}, tmpDir, makeResults(), {});
      const output = log.args.map((a) => a.join(" ")).join("\n");
      assert.match(output, /See Markdown summary at/);
      assert.equal(output.includes("results at "), false);
    });

    it("returns null and logs instead of throwing when the write fails", async function () {
      sinon.stub(console, "log");
      const error = sinon.stub(console, "error");
      sinon.stub(fs, "writeFileSync").throws(new Error("EACCES"));
      assert.equal(await markdownReporter({}, tmpDir, makeResults(), {}), null);
      assert.match(error.args.map((a) => a.join(" ")).join("\n"), /EACCES/);
    });

    it("returns null when the output directory can't be created", async function () {
      sinon.stub(console, "log");
      sinon.stub(console, "error");
      sinon.stub(fs, "mkdirSync").throws(new Error("EPERM"));
      assert.equal(
        await markdownReporter({}, path.join(tmpDir, "nope"), makeResults(), {}),
        null
      );
    });
  });
});
