// ADR 01146: a run where every spec skipped tested nothing, so it exits 2.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExitCode } from "../dist/core/utils.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");
const results = (specs) => ({
  summary: { specs: { pass: 0, fail: 0, warning: 0, skipped: 0, ...specs } },
});

describe("runExitCode", function () {
  for (const [name, specs, config, expected] of [
    ["all passed", { pass: 1 }, {}, 0],
    ["all warned", { warning: 1 }, {}, 0],
    ["passed and skipped", { pass: 1, skipped: 2 }, {}, 0],
    ["warned and skipped", { warning: 1, skipped: 2 }, {}, 0],
    ["failed and skipped", { fail: 1, skipped: 2 }, {}, 1],
    ["all skipped", { skipped: 2 }, {}, 2],
    ["nothing ran", {}, {}, 2],
    ["all skipped, relaxed", { skipped: 2 }, { exitOnFail: false }, 0],
    ["nothing ran, relaxed", {}, { exitOnFail: false }, 0],
    ["failed, relaxed", { fail: 1 }, { exitOnFail: false }, 0],
  ]) {
    it(`${name} exits ${expected}`, function () {
      assert.equal(runExitCode(results(specs), config), expected);
    });
  }

  it("exits 2 with no results at all", function () {
    assert.equal(runExitCode(null, {}), 2);
  });
});

describe("all-skipped runs through the CLI", function () {
  this.timeout(60000);
  let cwd;

  function run(args) {
    const env = { ...process.env };
    for (const key of ["CI", "DEBUG", "DOC_DETECTIVE_DEBUG"]) delete env[key];
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      input: "",
      env: {
        ...env,
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
      },
    });
  }

  const write = (name, content) =>
    fs.writeFileSync(path.join(cwd, name), typeof content === "string" ? content : JSON.stringify(content));
  const skipped = { if: "false", tests: [{ steps: [{ runShell: "echo hi" }] }] };

  beforeEach(function () {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dd-all-skipped-"));
  });

  afterEach(function () {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("exits 2, and says why, when every spec skips", function () {
    write("a.spec.json", skipped);
    const r = run(["-i", "a.spec.json"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Nothing was tested: every test was skipped/);
    assert.match(r.stderr, /--no-exit-on-fail/);
  });

  it("still says why with -q", function () {
    write("a.spec.json", skipped);
    const r = run(["-i", "a.spec.json", "-q"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Nothing was tested/);
  });

  it("exits 0 with --no-exit-on-fail, without the message", function () {
    write("a.spec.json", skipped);
    const r = run(["-i", "a.spec.json", "--no-exit-on-fail"]);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /Nothing was tested/);
  });

  it("exits 0 when one spec skips and another passes", function () {
    write("a.spec.json", skipped);
    write("b.spec.json", { tests: [{ steps: [{ runShell: "echo hi" }] }] });
    const r = run(["-i", "."]);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /Nothing was tested/);
  });

  it("points at --allow-unsafe when only unsafe steps skipped", function () {
    write("a.spec.json", { tests: [{ steps: [{ runShell: "echo hi", unsafe: true }] }] });
    const r = run(["-i", "a.spec.json", "--no-allow-unsafe"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /--allow-unsafe/);
  });

  it("names the reason when a whole spec skips", function () {
    write("a.spec.json", { tests: [{ runOn: [{ platforms: ["no-such-platform"] }], steps: [{ runShell: "echo hi" }] }] });
    const r = run(["-i", "a.spec.json"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Nothing was tested/);
    assert.match(r.stderr, /First reason:/);
  });
});
