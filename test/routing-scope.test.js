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

  function run(spec, args = []) {
    fs.writeFileSync(path.join(cwd, "a.spec.json"), JSON.stringify(spec));
    const env = { ...process.env };
    for (const key of ["CI", "DEBUG", "DOC_DETECTIVE_DEBUG"]) delete env[key];
    return spawnSync(process.execPath, [CLI, "-i", "a.spec.json", ...args], {
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
    ["goToTest on a step", onStep({ goToTest: "t" }), "tests[0].steps[0].onFail[0]: unknown key `goToTest`."],
    ["stop: run on a test", onTest({ stop: "run" }), "tests[0].onFail[0].stop:"],
    ["retry on a test", onTest({ retry: { limit: 1 } }), "tests[0].onFail[0]: unknown key `retry`."],
    ["goToStep on a test", onTest({ goToStep: "s" }), "tests[0].onFail[0]: unknown key `goToStep`."],
    // The other handlers share the schema; a case per handler pins that through the CLI.
    ...["onPass", "onWarning", "onSkip"].map((handler) => [
      `stop: run on a step's ${handler}`,
      { tests: [{ steps: [{ ...echo, [handler]: [{ stop: "run" }] }] }] },
      `tests[0].steps[0].${handler}[0].stop:`,
    ]),
    ...["onPass", "onWarning", "onSkip"].map((handler) => [
      `retry on a test's ${handler}`,
      { tests: [{ steps: [echo], [handler]: [{ retry: { limit: 1 } }] }] },
      `tests[0].${handler}[0]: unknown key \`retry\`.`,
    ]),
  ]) {
    it(`exits 2 on ${name}`, function () {
      const r = run(spec);
      expect(r.status, r.stderr).to.equal(2);
      expect(r.stderr).to.include(expected);
    });
  }

  it("runs a test whose onPass stops the spec, and skips the rest", function () {
    const r = run({ tests: [{ steps: [echo], onPass: [{ stop: "spec" }] }, { steps: [echo] }] }, ["--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(JSON.parse(r.stdout).specs[0].tests.map((test) => test.result)).to.deep.equal(["PASS", "SKIPPED"]);
  });

  it("accepts retry in a step's onSkip", function () {
    const r = run({ tests: [{ steps: [echo, { wait: false, onSkip: [{ retry: { limit: 1 } }] }] }] });
    expect(r.status, r.stderr).to.equal(0);
  });
});
