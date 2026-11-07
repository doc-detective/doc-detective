// doc-detective's own package root and version, from each build. Modules run
// from dist/<dir>/ in the ESM build and from the dist/index.cjs bundle, one
// level shallower, so a fixed `../..` from a module's folder leaves the
// package in the CommonJS build.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as heavyDeps from "../dist/runtime/heavyDeps.js";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = require("../package.json");

describe("doc-detective's own package", function () {
  it("packageRoot() is the package root (ESM build)", function () {
    assert.equal(heavyDeps.packageRoot?.(), repoRoot);
  });

  it("ownVersion() is package.json's version (ESM build)", function () {
    assert.equal(heavyDeps.ownVersion?.(), version);
  });

  describe("CommonJS build", function () {
    this.timeout(120000);

    let tmpDir;
    beforeEach(function () {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-own-cjs-"));
    });
    afterEach(function () {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // A page that declares a verified-by entry around one passing test.
    function runPage() {
      const page = path.join(tmpDir, "page.md");
      fs.writeFileSync(
        page,
        [
          "---",
          "verified-by:",
          "  - tool: doc-detective",
          "    check: own-version",
          "---",
          "",
          '<!-- test {"testId": "own-version"} -->',
          '<!-- step {"wait": 10} -->',
          "<!-- test end -->",
          "",
        ].join("\n")
      );
      // The package's own `require` export, as a CommonJS consumer gets it.
      const { runTests } = require("doc-detective");
      return runTests({
        input: [page],
        output: tmpDir,
        logLevel: "silent",
        telemetry: { send: false },
      }).then((report) => ({ report, page }));
    }

    it("records package.json's version in the report environment", async function () {
      const { report } = await runPage();
      assert.equal(report.environment.docDetectiveVersion, version);
    });

    it("writes package.json's version into a verified-by entry", async function () {
      const { page } = await runPage();
      assert.match(fs.readFileSync(page, "utf8"), new RegExp(`\\n {4}version: ${version.replace(/\./g, "\\.")}\\n`));
    });
  });
});
