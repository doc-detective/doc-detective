import { applyVerifiedMarkers, verifiedDate } from "../dist/core/utils.js";
import { runTests, detectAndResolveTests } from "../dist/core/index.js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

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
// Synthetic report: one spec + one test, both pointing at `file`.
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
const page = (check) => `---\ntitle: Doc\nverified-by:\n  - tool: doc-detective\n    check: ${check}\n---\n\n# Doc\n`;

describe("Verification metadata — write-back", function () {
  beforeEach(function () {
    TODAY = verifiedDate();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-verified-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("files", function () {
    it("writes its version, the pass date and last-verified on PASS", function () {
      const f = write("a.md", page("test~1"));
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(
        `---\ntitle: Doc\nverified-by:\n  - tool: doc-detective\n    check: test~1\n    version: ${VERSION}\n    passed: ${TODAY}\nlast-verified: ${TODAY}\n---\n\n# Doc\n`
      );
    });
    it("resolves a spec id as well as a test id", function () {
      const f = write("a.md", page("spec~1"));
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.contain(`last-verified: ${TODAY}`);
    });
    it("FAIL leaves the file untouched", function () {
      const f = write("a.md", page("test~1"));
      applyVerifiedMarkers({ config: silent, results: report(f, { result: "FAIL" }) });
      expect(read(f)).to.equal(page("test~1"));
    });
    it("writes a meta statement in an AsciiDoc page", function () {
      const f = write("a.adoc", '= Doc\n\n// (meta {"verified-by":[{"tool":"doc-detective","check":"test~1"}]})\nText.\n');
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.match(/^\/\/ \(meta sha256-[0-9a-f]{64} \{.*"passed":"\d{4}-\d{2}-\d{2}"\}\],"last-verified":"\d{4}-\d{2}-\d{2}"\}\)$/m);
    });
    it("unknown check warns and leaves the file untouched", function () {
      const f = write("a.md", page("does-not-exist"));
      const logs = [];
      const realLog = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      try {
        applyVerifiedMarkers({ config: { logLevel: "warning" }, results: report(f) });
      } finally {
        console.log = realLog;
      }
      expect(read(f)).to.equal(page("does-not-exist"));
      expect(logs.join("\n")).to.match(/verified-by check 'does-not-exist'.*matches no test or spec/);
    });
  });

  describe("skip paths", function () {
    it("no-ops when results has no specs array", function () {
      applyVerifiedMarkers({ config: silent, results: {} });
      applyVerifiedMarkers({ config: silent, results: null });
    });
    it("skips a non-existent content path without throwing", function () {
      const missing = path.join(tmpDir, "nope.md");
      applyVerifiedMarkers({ config: silent, results: report(missing) });
      expect(fs.existsSync(missing)).to.equal(false);
    });
    it("skips a non-doc extension", function () {
      const f = write("a.txt", page("test~1"));
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal(page("test~1"));
    });
    it("skips a doc that names no doc-detective check", function () {
      const f = write("a.md", "# Just docs\n");
      applyVerifiedMarkers({ config: silent, results: report(f) });
      expect(read(f)).to.equal("# Just docs\n");
    });
  });

  describe("end-to-end via runTests", function () {
    it("fills the front matter after a passing inline wait test", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "---",
          "verified-by:",
          "  - tool: doc-detective",
          "    check: wait-demo",
          "---",
          "",
          "# Page",
          "",
          '<!-- test {"testId": "wait-demo"} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      // Assert the date shape, not a pre-captured value: the runner computes the
      // date itself, so an exact-TODAY compare could flake across a UTC rollover.
      expect(read(f)).to.match(/\n {4}version: \S+\n {4}passed: \d{4}-\d{2}-\d{2}\nlast-verified: \d{4}-\d{2}-\d{2}\n---/);
    });

    it("keeps the detected file list out of serialized resolved tests", async function () {
      this.timeout(120000);
      const f = write("page.md", ['<!-- test {"testId": "t"} -->', '<!-- step {"wait": 10} -->', "<!-- test end -->", ""].join("\n"));
      const resolved = await detectAndResolveTests({ config: { input: f, logLevel: "silent" } });
      // The write-back still reads it, but `--dry-run` output and an API
      // request never carry the local file paths.
      expect(resolved._qualifiedFiles).to.be.an("array").that.is.not.empty;
      expect(JSON.stringify(resolved)).to.not.contain("_qualifiedFiles");
    });

    it("writes through a symlink and leaves no temporary file behind", function () {
      const target = write("real.md", '<!-- meta {"verified-by":[{"tool":"doc-detective","check":"test~1"}]} -->\nText.\n');
      const link = path.join(tmpDir, "link.md");
      try {
        fs.symlinkSync(target, link);
      } catch {
        this.skip(); // symlinks need privileges on some Windows setups
      }
      applyVerifiedMarkers({ config: { logLevel: "silent" }, results: { specs: [{ specId: "s", tests: [{ testId: "test~1", contentPath: link, result: "PASS" }] }] } });
      expect(fs.lstatSync(link).isSymbolicLink()).to.equal(true);
      expect(read(target)).to.match(/meta sha256-[0-9a-f]{64} /);
      expect(fs.readdirSync(tmpDir).sort()).to.deep.equal(["link.md", "real.md"]);
    });

    it("pins the block as it stands after a badge-anchored test updates its badge", async function () {
      this.timeout(120000);
      const f = write(
        "page.md",
        [
          "# Page",
          "",
          '<!-- meta {"verified-by":[{"tool":"doc-detective","check":"badge-demo"}]} -->',
          '<!-- test {"testId": "badge-demo", "badge": true} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      await runTests({ input: f, logLevel: "silent" });
      const lines = read(f).split("\n");
      // The badge lands between the statement and the test, inside the block
      // the statement anchors, so the pin must cover the badge as written.
      expect(lines[3]).to.match(/img\.shields\.io\/badge/);
      const block = lines.slice(3, 7).join("\n");
      expect(lines[2]).to.contain(`sha256-${crypto.createHash("sha256").update(block).digest("hex")}`);
    });

    it("pins a meta statement on a prose-only page whose check runs elsewhere", async function () {
      this.timeout(120000);
      // The test lives in runner.md; prose.md has no test of its own, so it is
      // reached only by scanning the full detected input set, not the report.
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
      const prose = write(
        "prose.md",
        '# Prose\n\n<!-- meta {"verified-by":[{"tool":"doc-detective","check":"cross-file-demo"}]} -->\nA verified sentence.\n'
      );
      await runTests({ input: tmpDir, logLevel: "silent" });
      expect(read(prose)).to.match(
        /<!-- meta sha256-[0-9a-f]{64} \{"verified-by":\[\{"tool":"doc-detective","check":"cross-file-demo","version":"[^"]+","passed":"\d{4}-\d{2}-\d{2}"\}\],"last-verified":"\d{4}-\d{2}-\d{2}"\} -->/
      );
    });
  });
});
