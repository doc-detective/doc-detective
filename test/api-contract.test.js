// ADR 01152, amended by ADR 01166: what `runTests` returns, prints, and reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTests } from "../dist/index.js";
import { validate } from "../dist/common/src/index.js";

describe("JS API contract", function () {
  this.timeout(60000);
  let dir;
  let saved;
  const ENV_KEYS = ["DOC_DETECTIVE", "DOC_DETECTIVE_CONFIG"];

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-api-contract-"));
    fs.writeFileSync(path.join(dir, "empty.md"), "# Nothing to test\n");
    fs.writeFileSync(
      path.join(dir, "pass.spec.json"),
      JSON.stringify({ specId: "pass", tests: [{ testId: "t", steps: [{ runShell: "echo hi" }] }] })
    );
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  });

  afterEach(function () {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const base = () => ({ telemetry: { send: false }, logLevel: "silent", outputDir: dir });

  it("returns an empty report, not null, when it finds no tests", async function () {
    const report = await runTests({ ...base(), input: [path.join(dir, "empty.md")] });
    assert.deepEqual(report.specs, []);
    assert.deepEqual(report.summary.specs, { pass: 0, fail: 0, warning: 0, skipped: 0 });
    assert.equal(validate({ schemaKey: "report_v3", object: report }).valid, true);
  });

  it("returns the plan from a dry run, and prints nothing", async function () {
    const original = process.stdout.write;
    let printed = "";
    process.stdout.write = (chunk, ...rest) => {
      printed += String(chunk);
      return typeof rest.at(-1) === "function" ? (rest.at(-1)(), true) : true;
    };
    let plan;
    try {
      plan = await runTests({ ...base(), input: [path.join(dir, "pass.spec.json")], dryRun: true });
    } finally {
      process.stdout.write = original;
    }
    assert.equal(printed, "");
    assert.equal(plan.specs.length, 1);
  });

  it("reads no config from the environment", async function () {
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ concurrentRunners: 3 });
    process.env.DOC_DETECTIVE = JSON.stringify({ config: { concurrentRunners: 3 } });
    const plan = await runTests({ ...base(), input: [path.join(dir, "pass.spec.json")], dryRun: true });
    assert.equal(plan.config.concurrentRunners, 1);
  });

  // ADR 01150: the JS API throws the CLI's format, with no source to name.
  it("rejects an invalid config in the shared format", async function () {
    await assert.rejects(runTests({ ...base(), invalidKey: true }), {
      message:
        "Invalid config:\nunknown key 'invalidKey'.\nSee https://docs.doc-detective.com/reference/schemas/config",
    });
  });
});
