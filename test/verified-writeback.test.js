import { applyVerifiedMarkers, verifiedDate } from "../dist/core/utils.js";
import { runTests } from "../dist/core/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// Recomputed before each test (see beforeEach) rather than captured once at
// module load, so a suite that spans a UTC midnight boundary can't drift from
// the date the writer actually stamps.
let TODAY;
let tmpDir;

function write(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}
function read(p) {
  return fs.readFileSync(p, "utf8");
}
// Synthetic report: one spec + one passing/failing test, both pointing at `file`.
function report(file, { specId = "spec~1", testId = "test~1", result = "PASS" } = {}) {
  return {
    specs: [
      {
        specId,
        contentPath: file,
        result,
        tests: [{ testId, contentPath: file, result }],
      },
    ],
  };
}
const silent = { logLevel: "silent" };

describe("Last Verified On — write-back integration", function () {
  beforeEach(function () {
    TODAY = verifiedDate();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-verified-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("PASS writes the date, per format", function () {
    it("markdown data-only (HTML comment)", function () {
      const f = write("a.md", "# Doc\n\n<!-- verified id=test~1 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`<!-- verified id=test~1 date=${TODAY} -->`);
    });
    it("mdx preserves the JSX comment form (never emits <!-- -->)", function () {
      const f = write("a.mdx", "# Doc\n\n{/* verified id=test~1 */}\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const out = read(f);
      expect(out).to.contain(`{/* verified id=test~1 date=${TODAY} */}`);
      expect(out).to.not.contain("<!--");
    });
    it("asciidoc line comment", function () {
      const f = write("a.adoc", "= Doc\n\n// (verified id=test~1)\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`// (verified id=test~1 date=${TODAY})`);
    });
    it("html comment", function () {
      const f = write("a.html", "<h1>Doc</h1>\n<!-- verified id=test~1 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`<!-- verified id=test~1 date=${TODAY} -->`);
    });
    it("dita comment", function () {
      const f = write("a.dita", "<topic><title>Doc</title></topic>\n<!-- verified id=test~1 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`<!-- verified id=test~1 date=${TODAY} -->`);
    });
  });

  describe("granularity — id may target a spec or a test", function () {
    it("resolves a spec id", function () {
      const f = write("a.md", "<!-- verified id=spec~1 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`<!-- verified id=spec~1 date=${TODAY} -->`);
    });
  });

  describe("badge", function () {
    it("inserts the shields.io image on PASS and is byte-idempotent", function () {
      const f = write("a.md", "# Doc\n\n<!-- verified id=test~1 badge -->\n\nMore.\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const once = read(f);
      expect(once).to.contain(`<!-- verified id=test~1 badge date=${TODAY} -->`);
      expect(once).to.contain(
        `![Last verified ${TODAY}](https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen)`
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(once); // no duplicate image, no drift
    });
    it("asciidoc badge inserts the image macro and is byte-idempotent", function () {
      const f = write("a.adoc", "= Doc\n\n// (verified id=test~1 badge)\n\nMore.\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const once = read(f);
      expect(once).to.contain(
        `image:https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen[Last verified ${TODAY}]`
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(once);
    });
    it("dita badge inserts the image element and is byte-idempotent", function () {
      const f = write(
        "a.dita",
        "<topic><title>Doc</title></topic>\n<!-- verified id=test~1 badge -->\n\nMore.\n"
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const once = read(f);
      expect(once).to.contain(
        `<image href="https://img.shields.io/badge/Last_verified-${TODAY.replace(/-/g, "--")}-brightgreen">`
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(once);
    });
  });

  describe("front matter (doc-detective.verified)", function () {
    it("writes the date into the front-matter object on PASS", function () {
      const f = write(
        "a.md",
        "---\ntitle: Doc\ndoc-detective:\n  verified:\n    id: test~1\n---\n\n# Doc\n"
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const once = read(f);
      expect(once).to.match(/date:\s*['"]?2\d{3}-\d{2}-\d{2}['"]?/);
      expect(once).to.contain(TODAY);
      // body untouched
      expect(once).to.contain("# Doc");
      // re-run is byte-identical (date replaced in place, not appended)
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(once);
    });
    it("preserves sibling front-matter fields (inline array stays inline)", function () {
      const f = write(
        "a.md",
        "---\ntitle: My Guide\ntags: [api, rest]\ndoc-detective:\n  verified:\n    id: test~1\n---\n\n# Doc\n"
      );
      applyVerifiedMarkers({ config: silent, results: report(f) });
      const out = read(f);
      expect(out).to.contain("tags: [api, rest]"); // not reflowed to block style
      expect(out).to.contain("title: My Guide");
      expect(out).to.contain(TODAY);
    });
  });

  describe("gating", function () {
    it("FAIL leaves the prior date untouched (ages)", function () {
      const f = write("a.md", "<!-- verified id=test~1 date=2025-01-01 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f, { result: "FAIL" }) });
      expect(read(f)).to.contain("date=2025-01-01");
      expect(read(f)).to.not.contain(TODAY);
    });
    it("SKIPPED does not write", function () {
      const f = write("a.md", "<!-- verified id=test~1 -->\n");
      applyVerifiedMarkers({ config: silent, results: report(f, { result: "SKIPPED" }) });
      expect(read(f)).to.equal("<!-- verified id=test~1 -->\n");
    });
    it("unknown id warns and leaves the file untouched", function () {
      const f = write("a.md", "<!-- verified id=does-not-exist -->\n");
      const original = read(f);
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        applyVerifiedMarkers({ config: { logLevel: "warning" }, results: report(f) });
      } finally {
        console.log = realLog;
      }
      expect(read(f)).to.equal(original);
      expect(logs.join("\n")).to.match(/unknown id 'does-not-exist'/);
    });
  });

  describe("end-to-end via runTests", function () {
    it("updates a data-only marker after a passing inline wait test", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "# Page",
          "",
          '<!-- test {"testId": "wait-demo"} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
          "<!-- verified id=wait-demo -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      expect(read(f)).to.contain(`<!-- verified id=wait-demo date=${TODAY} -->`);
    });

    it("updates a prose-only file whose marker references a test defined elsewhere", async function () {
      this.timeout(120000);
      // The test lives in runner.md; badge-page.md has no test of its own — it
      // is reached only by scanning the full detected input set, not the report.
      write(
        "runner.md",
        [
          "# Runner",
          "",
          '<!-- test {"testId": "cross-file-demo"} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      const prose = write("badge-page.md", "# Badge page\n\n<!-- verified id=cross-file-demo -->\n");
      await runTests({ input: tmpDir, logLevel: "silent" });
      expect(read(prose)).to.contain(`<!-- verified id=cross-file-demo date=${TODAY} -->`);
    });
  });
});
