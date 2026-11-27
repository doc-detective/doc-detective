import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkFile } from "../dist/core/tests/checkFile.js";
import { resolvePaths } from "../dist/core/files.js";

// ADR 01231: hermetic coverage for the checkFile action, on temp folders. No
// browser: the download folder is a plain folder and the driver is a stub.

const config = { logLevel: "silent" };
const chrome = { state: { engine: "chrome" } };

describe("checkFile", function () {
  this.timeout(10000);
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-checkfile-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name, text = "x", mtime) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, text);
    if (mtime) fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const run = (checkFileValue, extra = {}) =>
    checkFile({
      config,
      step: { checkFile: checkFileValue },
      driver: chrome,
      context: {},
      downloadsDir: () => dir,
      ...extra,
    });

  describe("path", function () {
    it("passes for the shorthand and outputs path, name, and size", async function () {
      const file = write("report.txt", "hello");
      const result = await run(file);
      assert.equal(result.status, "PASS", result.description);
      assert.deepEqual(result.outputs, { filePath: file, fileName: "report.txt", fileSize: 5 });
    });

    it("returns the newest match, every time", async function () {
      write("a.log", "old", new Date(2020, 0, 1));
      const newest = write("b.log", "new", new Date(2021, 0, 1));
      const glob = path.join(dir, "*.log");
      assert.equal((await run({ path: glob })).outputs.filePath, newest);
      assert.equal((await run({ path: glob })).outputs.filePath, newest);
    });

    it("ignores .crdownload and .part files, and a file whose .part sibling exists", async function () {
      write("a.csv.crdownload");
      write("b.csv.part");
      write("c.csv", "");
      write("c.csv.part");
      const glob = path.join(dir, "*");
      const result = await run({ path: glob, timeout: 600 });
      assert.equal(result.status, "FAIL");
      assert.equal(
        result.description,
        `Couldn't find a finished file matching \`${glob}\` within 600 ms.`
      );
    });

    it("waits until the size stops changing", async function () {
      const file = write("grow.txt", "a");
      const timer = setInterval(() => fs.appendFileSync(file, "a"), 50);
      setTimeout(() => clearInterval(timer), 700);
      const start = Date.now();
      const result = await run({ path: file, timeout: 5000 });
      assert.equal(result.status, "PASS", result.description);
      assert.ok(Date.now() - start >= 700, "returned before the file settled");
    });

    it("waits for a file that appears later", async function () {
      const file = path.join(dir, "late.txt");
      setTimeout(() => fs.writeFileSync(file, "late"), 400);
      const result = await run({ path: file, timeout: 5000 });
      assert.equal(result.status, "PASS", result.description);
    });

    it("checks content as a string and as a regex", async function () {
      const file = write("out.log", "build 42 passed");
      assert.equal((await run({ path: file, content: "42 passed" })).status, "PASS");
      assert.equal((await run({ path: file, content: "/build \\d+ passed/" })).status, "PASS");
      const miss = await run({ path: file, content: "Invoice" });
      assert.equal(miss.status, "FAIL");
      assert.equal(miss.description, `Couldn't find \`Invoice\` in \`${file}\`.`);
    });

    it("works with no browser", async function () {
      const file = write("x.txt");
      const result = await run(file, { driver: undefined });
      assert.equal(result.status, "PASS", result.description);
    });
  });

  describe("download", function () {
    it("returns each download once, oldest first", async function () {
      const context = {};
      write("first.csv", "id,name", new Date(2020, 0, 1));
      write("second.csv", "id,name", new Date(2021, 0, 1));
      const one = await run({ download: "*.csv" }, { context });
      const two = await run({ download: "*.csv" }, { context });
      assert.equal(one.outputs.fileName, "first.csv");
      assert.equal(two.outputs.fileName, "second.csv");
      const three = await run({ download: "*.csv", timeout: 300 }, { context });
      assert.equal(three.status, "FAIL");
      assert.equal(
        three.description,
        "Couldn't find a finished download matching `*.csv` within 300 ms."
      );
    });

    it("matches file names, ignoring in-progress downloads", async function () {
      write("report.csv.crdownload");
      write("other.txt");
      const result = await run({ download: "*.csv", timeout: 300 });
      assert.equal(result.status, "FAIL");
    });

    it("checks content", async function () {
      const file = write("invoice-1.pdf", "Invoice 1");
      const result = await run({ download: "invoice-*.pdf", content: "/^Invoice \\d$/" });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.filePath, file);
    });

    it("works in firefox", async function () {
      write("a.csv");
      const result = await run({ download: "*.csv" }, { driver: { state: { engine: "firefox" } } });
      assert.equal(result.status, "PASS", result.description);
    });

    it("skips in safari", async function () {
      for (const engine of ["safari", "webkit"]) {
        const result = await run({ download: "*.csv" }, { driver: { state: { engine } } });
        assert.equal(result.status, "SKIPPED");
        assert.equal(result.description, "Skipped: `safari` can't save downloads to a known folder.");
      }
    });

    it("skips with no browser, on mobile, and in app contexts", async function () {
      const message = "Skipped: `download` needs a desktop Chrome or Firefox context.";
      const cases = [
        { driver: undefined },
        { context: { platform: "android", browser: { name: "chrome" } } },
        { context: { platform: "ios" } },
      ];
      for (const extra of cases) {
        const result = await run({ download: "*.csv" }, extra);
        assert.equal(result.status, "SKIPPED");
        assert.equal(result.description, message);
      }
    });
  });

  describe("path resolution", function () {
    const specFile = path.resolve("/specs/sub/test.spec.json");
    const resolveStep = (value) =>
      resolvePaths({
        config: { relativePathBase: "file" },
        object: { tests: [{ steps: [{ checkFile: value }] }] },
        filePath: specFile,
        objectType: "spec",
      }).then((spec) => spec.tests[0].steps[0].checkFile);

    it("resolves the shorthand and path against the spec, never download", async function () {
      assert.equal(await resolveStep("out/*.txt"), path.resolve("/specs/sub/out/*.txt"));
      assert.equal((await resolveStep({ path: "out/a.txt" })).path, path.resolve("/specs/sub/out/a.txt"));
      assert.equal((await resolveStep({ download: "*.csv" })).download, "*.csv");
    });
  });
});
