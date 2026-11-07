// ADR 01168, asserted through the real bin: a routing action the runner can't
// perform at its scope exits 2 and names the key path.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");

describe("routing scopes through the CLI", function () {
  this.timeout(60000);
  let cwd;

  function run(spec) {
    fs.writeFileSync(path.join(cwd, "a.spec.json"), JSON.stringify(spec));
    const env = { ...process.env };
    for (const key of ["CI", "DEBUG", "DOC_DETECTIVE_DEBUG"]) delete env[key];
    return spawnSync(process.execPath, [CLI, "-i", "a.spec.json"], {
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

  const echo = { runShell: "echo hi" };
  const onStep = (handler) => ({ tests: [{ steps: [{ ...echo, onFail: [handler] }] }] });
  const onTest = (handler) => ({ tests: [{ steps: [echo], onFail: [handler] }] });

  beforeEach(function () {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dd-routing-scope-"));
  });

  afterEach(function () {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  for (const [name, spec, expected] of [
    ["stop: spec on a step", onStep({ stop: "spec" }), "tests[0].steps[0].onFail[0].stop:"],
    ["stop: run on a step", onStep({ stop: "run" }), "tests[0].steps[0].onFail[0].stop:"],
    ["goToTest on a step", onStep({ goToTest: "t" }), "tests[0].steps[0].onFail[0]: unknown key 'goToTest'."],
    [
      "retry in a step's onSkip",
      { tests: [{ steps: [{ ...echo, onSkip: [{ retry: { limit: 1 } }] }] }] },
      "tests[0].steps[0].onSkip[0]: unknown key 'retry'.",
    ],
    ["stop: run on a test", onTest({ stop: "run" }), "tests[0].onFail[0].stop:"],
    ["retry on a test", onTest({ retry: { limit: 1 } }), "tests[0].onFail[0]: unknown key 'retry'."],
    ["goToStep on a test", onTest({ goToStep: "s" }), "tests[0].onFail[0]: unknown key 'goToStep'."],
  ]) {
    it(`exits 2 on ${name}`, function () {
      const r = run(spec);
      expect(r.status, r.stderr).to.equal(2);
      expect(r.stderr).to.include(expected);
    });
  }

  it("runs a test whose onPass stops the spec", function () {
    const r = run({ tests: [{ steps: [echo], onPass: [{ stop: "spec" }] }, { steps: [echo] }] });
    expect(r.status, r.stderr).to.equal(0);
  });
});
