// End-to-end proof that `--reporters junit markdown` is selectable from the
// CLI and lands real files on disk.
//
// The unit suites cover the builders hermetically; this covers the wiring
// nothing else does — yargs -> setConfig -> outputResults -> reporter -> disk.
// Spawning the real binary (rather than calling outputResults directly) is
// what makes that path a genuine regression test.

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function runCli(args) {
  return spawnSync(
    process.execPath,
    [path.resolve("bin/doc-detective.js"), ...args],
    {
      env: {
        ...process.env,
        // Deterministic and offline: never let a self-update check run here.
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
      },
      encoding: "utf8",
    }
  );
}

describe("reporters — CLI end to end", function () {
  this.timeout(120000);

  let tmpDir;
  let specPath;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-reporters-cli-"));
    specPath = path.join(tmpDir, "sample.spec.json");
    // A shell-only spec so the run needs no browser or driver.
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        specId: "reporters-cli",
        description: "Shell-only spec for reporter wiring",
        tests: [
          {
            testId: "reporters-cli-test",
            description: "Runs a trivial shell step",
            steps: [{ runShell: "node -e 0" }],
          },
        ],
      })
    );
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes junit.xml and doc-detective-summary.md when both reporters are selected", function () {
    const outputDir = path.join(tmpDir, "out");
    const result = runCli([
      "runTests",
      "--input",
      specPath,
      "--output",
      outputDir,
      "--reporters",
      "junit",
      "markdown",
    ]);

    assert.equal(
      result.status,
      0,
      `CLI exited ${result.status}\n${result.stdout}\n${result.stderr}`
    );

    const junitPath = path.join(outputDir, "junit.xml");
    const markdownPath = path.join(outputDir, "doc-detective-summary.md");
    assert.equal(fs.existsSync(junitPath), true, "expected junit.xml");
    assert.equal(
      fs.existsSync(markdownPath),
      true,
      "expected doc-detective-summary.md"
    );

    const doc = parser.parse(fs.readFileSync(junitPath, "utf8"));
    assert.ok(Number(doc.testsuites["@_tests"]) >= 1);
    assert.equal(Number(doc.testsuites["@_failures"]), 0);

    assert.match(
      fs.readFileSync(markdownPath, "utf8"),
      /^# Doc Detective results/
    );
  });

  it("never prints the stdout marker the GitHub Action parses", function () {
    // The Action splits stdout on "results at " and require()s the trailing
    // path; an .xml or .md path there is a syntax error.
    const outputDir = path.join(tmpDir, "out-marker");
    const result = runCli([
      "runTests",
      "--input",
      specPath,
      "--output",
      outputDir,
      "--reporters",
      "junit",
      "markdown",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("results at "), false);
    assert.match(result.stdout, /See JUnit report at/);
    assert.match(result.stdout, /See Markdown summary at/);
  });

  it("writes junit.xml beside a .json output path shared with the json reporter", function () {
    // The natural CI invocation. junit must not mkdir a directory over the
    // path jsonReporter is concurrently writing to.
    const outputDir = path.join(tmpDir, "out-shared");
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, "results.json");

    const result = runCli([
      "runTests",
      "--input",
      specPath,
      "--output",
      jsonPath,
      "--reporters",
      "json",
      "junit",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.statSync(jsonPath).isFile(), true);
    assert.equal(fs.existsSync(path.join(outputDir, "junit.xml")), true);
  });
});
