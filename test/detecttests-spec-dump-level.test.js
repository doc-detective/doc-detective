// ADR 01136: detectTests' full detected-spec dump is debug output, like its
// "SPECS:" header and the resolved/results dumps. At the default info level it
// flooded stdout (~750 KB for this repo's docs).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { detectTests } from "../dist/core/detectTests.js";
import { setConfig } from "../dist/core/config.js";

describe("detectTests detected-spec dump log level", function () {
  this.timeout(30000);
  const MARKER = "https://spec-dump-marker.example/";
  let tmpDir;
  let captured;
  let originalLog;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-dump-"));
    fs.writeFileSync(
      path.join(tmpDir, "s.spec.json"),
      JSON.stringify({ tests: [{ steps: [{ goTo: MARKER }] }] })
    );
    captured = [];
    originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
  });
  afterEach(function () {
    console.log = originalLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const detectAt = async (logLevel) => {
    const config = await setConfig({ config: { input: [tmpDir], logLevel } });
    captured.length = 0;
    const specs = await detectTests({ config });
    assert.equal(specs.length, 1);
    return captured.join("\n");
  };

  it("does not print the detected specs at info level", async function () {
    const out = await detectAt("info");
    assert.ok(!out.includes(MARKER), "the detected-spec dump must be absent at info");
  });

  it("still prints them, under the SPECS: header, at debug level", async function () {
    const out = await detectAt("debug");
    assert.ok(out.includes("(DEBUG) SPECS:"));
    assert.ok(out.includes(MARKER), "the detected-spec dump must remain at debug");
  });
});
