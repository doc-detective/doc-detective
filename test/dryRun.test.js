import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runTests } from "../dist/core/index.js";

describe("--dry-run short-circuits before execution", function () {
  this.timeout(30000);

  before(async function () {
    const { expect } = await import("chai");
    global.expect = expect;
  });

  let tmpDir;
  let specPath;
  let originalLog;
  let captured;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-dry-run-"));
    specPath = path.join(tmpDir, "test.spec.json");
    fs.writeFileSync(
      specPath,
      JSON.stringify(
        {
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
        null,
        2
      )
    );

    captured = [];
    originalLog = console.log;
    console.log = (...args) => {
      captured.push(args.join(" "));
    };
  });

  afterEach(function () {
    console.log = originalLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the resolved-tests shape and prints it as JSON", async function () {
    const result = await runTests({
      input: [specPath],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: false },
    });

    // Resolved-tests shape (NOT a results shape):
    // - has `resolvedTestsId` and `specs`
    // - has `tests[].contexts[].steps[]` (resolution expands a step into contexts)
    // - has NO `summary` or `reportId` (those exist only on executed results)
    expect(result).to.be.an("object");
    expect(result).to.have.property("resolvedTestsId");
    expect(result).to.have.property("specs").that.is.an("array").with.lengthOf(1);
    expect(result).to.not.have.property("summary");
    expect(result).to.not.have.property("reportId");

    const step = result.specs[0].tests[0].contexts[0].steps[0];
    expect(step).to.have.property("goTo");

    // JSON was emitted to stdout and round-trips with the same shape.
    const stdoutDump = captured.join("\n");
    const parsed = JSON.parse(stdoutDump);
    expect(parsed).to.have.property("resolvedTestsId", result.resolvedTestsId);
    expect(parsed).to.not.have.property("summary");
    expect(parsed.specs).to.have.lengthOf(1);
  });

  it("without dryRun, runTests returns an executed-results shape", async function () {
    // Sanity control: the same spec, run normally, returns an object with
    // `summary` and `specs[].tests[].contexts[].steps[]` carrying step
    // results (a `result` field). This proves the dry-run case above is
    // returning a *different* shape, not just an empty execution.
    const result = await runTests({
      input: [specPath],
      output: tmpDir,
      logLevel: "silent",
      telemetry: { send: false },
      reporters: [],
    });

    expect(result).to.be.an("object");
    expect(result).to.have.property("summary");
    expect(result).to.not.have.property("resolvedTestsId");
  });

  it("honors caller dryRun even when options.resolvedTests carries a non-dry-run config", async function () {
    // Regression for #292: when DOC_DETECTIVE_API supplies a pre-resolved
    // tests payload, the embedded resolvedTests.config must NOT clobber
    // CLI-level overrides like dryRun. Caller config wins.
    const seed = await runTests({
      input: [specPath],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: false },
    });
    captured.length = 0; // discard the seed run's stdout dump

    // Mutate the seed's embedded config so dryRun is FALSE there. If the
    // merge regresses, runTests would proceed to execute tests.
    const tampered = JSON.parse(JSON.stringify(seed));
    tampered.config.dryRun = false;
    tampered.config.logLevel = "silent";

    const result = await runTests(
      { dryRun: true, telemetry: { send: false }, logLevel: "silent" },
      { resolvedTests: tampered }
    );

    expect(result).to.have.property("resolvedTestsId");
    expect(result).to.not.have.property("summary");

    // stdout received the JSON dump (one entry from this re-run).
    const parsed = JSON.parse(captured.join("\n"));
    expect(parsed).to.have.property("resolvedTestsId");
  });

  it("emits clean JSON to stdout at default logLevel (no telemetry/support pollution)", async function () {
    // Regression for #292: telemetryNotice and the support-message log
    // both wrote to stdout at the default info logLevel and broke
    // `JSON.parse` of the output. Confirm nothing extra leaks.
    await runTests({
      input: [specPath],
      output: tmpDir,
      // logLevel intentionally omitted to exercise the default ("info")
      dryRun: true,
      telemetry: { send: false },
    });

    const stdoutDump = captured.join("\n").trim();
    // The whole stdout must round-trip as a single JSON document.
    const parsed = JSON.parse(stdoutDump);
    expect(parsed).to.have.property("resolvedTestsId");
  });
});
