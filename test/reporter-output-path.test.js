// Shared report output-path resolution for the file-writing reporters that
// own a fixed filename (`junit`, `markdown`).
//
// The load-bearing rule: a *known report extension* on `output` always means
// "this is a file", so a reporter that doesn't own that extension writes
// BESIDE it rather than treating it as a directory. Without that,
// `--output results.json --reporters json junit` has junit mkdir a directory
// named `results.json` underneath the path jsonReporter is trying to write —
// a race, since reporters run concurrently under Promise.all.

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import {
  REPORT_FILE_EXTENSIONS,
  hasReportFileExtension,
} from "../dist/reportExtensions.js";
import {
  resolveReportOutput,
  writeFileAtomic,
} from "../dist/reporters/outputPath.js";
import { getRunOutputDir } from "../dist/core/utils.js";
import { OWN_EXTENSIONS as JUNIT_OWN_EXTENSIONS } from "../dist/reporters/junitReporter.js";
import { OWN_EXTENSIONS as MARKDOWN_OWN_EXTENSIONS } from "../dist/reporters/markdownReporter.js";

describe("reporters/outputPath", function () {
  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-report-path-"));
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("REPORT_FILE_EXTENSIONS", function () {
    it("covers every extension a built-in reporter can write", function () {
      assert.deepEqual(
        [...REPORT_FILE_EXTENSIONS].sort(),
        [".htm", ".html", ".json", ".md", ".xml"]
      );
    });

    it("matches case-insensitively", function () {
      assert.equal(hasReportFileExtension("/tmp/Report.XML"), true);
      assert.equal(hasReportFileExtension("/tmp/report.JSON"), true);
      assert.equal(hasReportFileExtension("/tmp/report.v1"), false);
      assert.equal(hasReportFileExtension("/tmp/reports"), false);
    });

    it("contains every extension the fixed-filename reporters claim as their own", function () {
      // If a reporter claimed an extension the shared list doesn't know about,
      // it would write its file at `--output report.markdown` while the run
      // folder resolver treated that same path as a directory.
      for (const own of [JUNIT_OWN_EXTENSIONS, MARKDOWN_OWN_EXTENSIONS]) {
        for (const ext of own) {
          assert.equal(
            REPORT_FILE_EXTENSIONS.includes(ext),
            true,
            `${ext} is claimed by a reporter but missing from REPORT_FILE_EXTENSIONS`
          );
        }
      }
    });

    it("is the same list getRunOutputDir uses to place the run folder", function () {
      // Behavioral proof that the run-folder resolver and the reporter
      // resolver agree: a divergence would put the archive root inside a
      // directory named after the report file, breaking runId/runDir
      // correlation with autoScreenshot.
      for (const ext of REPORT_FILE_EXTENSIONS) {
        const runDir = getRunOutputDir(
          { output: path.join(tmpDir, `report${ext}`) },
          { create: false }
        );
        assert.equal(
          runDir.startsWith(path.join(tmpDir, ".doc-detective")),
          true,
          `${ext} should resolve the run folder beside the file, got ${runDir}`
        );
      }
    });
  });

  describe("resolveReportOutput()", function () {
    it("honors an output path that already carries the reporter's own extension", function () {
      const target = path.join(tmpDir, "custom.xml");
      const { outputDir, outputFile } = resolveReportOutput({
        outputPath: target,
        ownExtensions: [".xml"],
        fixedName: "junit.xml",
      });
      assert.equal(outputFile, target);
      assert.equal(outputDir, tmpDir);
    });

    it("matches its own extension case-insensitively", function () {
      const target = path.join(tmpDir, "custom.XML");
      const { outputFile } = resolveReportOutput({
        outputPath: target,
        ownExtensions: [".xml"],
        fixedName: "junit.xml",
      });
      assert.equal(outputFile, target);
    });

    it("writes the fixed name BESIDE an output path owned by another reporter", function () {
      const { outputDir, outputFile } = resolveReportOutput({
        outputPath: path.join(tmpDir, "results.json"),
        ownExtensions: [".xml"],
        fixedName: "junit.xml",
      });
      assert.equal(outputDir, tmpDir);
      assert.equal(outputFile, path.join(tmpDir, "junit.xml"));
    });

    it("writes the fixed name INSIDE a directory output path", function () {
      const dir = path.join(tmpDir, "reports");
      const { outputDir, outputFile } = resolveReportOutput({
        outputPath: dir,
        ownExtensions: [".xml"],
        fixedName: "junit.xml",
      });
      assert.equal(outputDir, dir);
      assert.equal(outputFile, path.join(dir, "junit.xml"));
    });

    it("treats a dotted directory name that isn't a report extension as a directory", function () {
      const dir = path.join(tmpDir, "reports.v1");
      const { outputDir, outputFile } = resolveReportOutput({
        outputPath: dir,
        ownExtensions: [".md"],
        fixedName: "doc-detective-summary.md",
      });
      assert.equal(outputDir, dir);
      assert.equal(outputFile, path.join(dir, "doc-detective-summary.md"));
    });

    it("defaults a nullish output path to the current directory", function () {
      const { outputDir, outputFile } = resolveReportOutput({
        outputPath: undefined,
        ownExtensions: [".xml"],
        fixedName: "junit.xml",
      });
      assert.equal(outputDir, path.resolve("."));
      assert.equal(outputFile, path.resolve(".", "junit.xml"));
    });
  });

  describe("writeFileAtomic()", function () {
    it("writes the file and leaves no temp file behind", function () {
      const target = path.join(tmpDir, "junit.xml");
      writeFileAtomic(target, "<testsuites/>");
      assert.equal(fs.readFileSync(target, "utf8"), "<testsuites/>");
      assert.deepEqual(fs.readdirSync(tmpDir), ["junit.xml"]);
    });

    it("replaces an existing file rather than suffixing it", function () {
      // The whole point of the fixed filename: `artifacts:reports:junit`
      // globs a stable path, so run N+1 must replace run N's file.
      const target = path.join(tmpDir, "junit.xml");
      fs.writeFileSync(target, "<old/>");
      writeFileAtomic(target, "<new/>");
      assert.equal(fs.readFileSync(target, "utf8"), "<new/>");
      assert.deepEqual(fs.readdirSync(tmpDir), ["junit.xml"]);
    });
  });
});
