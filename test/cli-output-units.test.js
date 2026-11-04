// Pure helpers behind the CLI's messages.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { nearestCommand, rewriteRootError } from "../dist/cliHelp.js";
import { reportCrash, verdictLine } from "../dist/cliOutput.js";
import { summarizeSpecErrors } from "../dist/core/utils.js";

describe("nearestCommand", function () {
  const names = ["run", "install", "debug", "lsp", "help"];
  it("finds a close match", function () {
    expect(nearestCommand("instal", names)).to.equal("install");
    expect(nearestCommand("RUN", names)).to.equal("run");
  });
  it("leaves distant words alone", function () {
    expect(nearestCommand("docs/guide.md", names)).to.equal(undefined);
  });
});

describe("rewriteRootError", function () {
  it("rewrites extra arguments as an unknown command", function () {
    const out = rewriteRootError(
      "error: too many arguments. Expected 0 arguments but got 1: instal.\n",
      ["install"]
    );
    expect(out).to.include("unknown command 'instal'");
    expect(out).to.include("Did you mean install?");
  });
  it("passes other errors through", function () {
    expect(rewriteRootError("error: unknown option '--x'\n", [])).to.equal(
      "error: unknown option '--x'\n"
    );
  });
});

describe("verdictLine", function () {
  const verdict = (tests) => verdictLine({ summary: { tests } });
  it("reports failures", function () {
    expect(verdict({ pass: 1, fail: 1, warning: 0, skipped: 0 })).to.include("1 of 2 tests failed");
  });
  it("reports passes, with warnings and skips", function () {
    expect(verdict({ pass: 1, fail: 0, warning: 1, skipped: 1 })).to.include(
      "2 of 3 tests passed (1 with warnings, 1 skipped)"
    );
  });
  it("reports all skipped", function () {
    expect(verdict({ pass: 0, fail: 0, warning: 0, skipped: 2 })).to.include("All 2 tests skipped");
  });
  it("reports nothing run", function () {
    expect(verdictLine(null)).to.include("No tests ran");
  });
});

describe("summarizeSpecErrors", function () {
  const required = (key) => `/tests/0/steps/0 must have required property '${key}' ({"missingProperty":"${key}"})`;

  it("names an unknown action and the nearest real one", function () {
    const errors = [required("goTo"), required("find"), "/tests/0/steps/0 must match a schema in anyOf ({})"].join(", ");
    const object = { tests: [{ steps: [{ goToo: "x" }] }] };
    expect(summarizeSpecErrors(errors, object)).to.equal(
      "tests[0].steps[0]: unknown action 'goToo'. Did you mean goTo?"
    );
  });

  it("collapses anyOf noise and drops parameter dumps", function () {
    const errors = `/tests/0/steps/0/goTo must be string ({"type":"string"}), /tests/0 must match a schema in anyOf ({})`;
    const object = { tests: [{ steps: [{ goTo: 1 }] }] };
    expect(summarizeSpecErrors(errors, object)).to.equal("tests[0].steps[0].goTo: must be string");
  });

  it("handles a step with no recognizable key", function () {
    const errors = required("goTo");
    expect(summarizeSpecErrors(errors, { tests: [{ steps: [{}] }] })).to.include("tests[0].steps[0]: no action");
  });

  it("falls back to the message for a root error", function () {
    expect(summarizeSpecErrors(` must have required property 'tests' ({"missingProperty":"tests"})`, {})).to.equal(
      "must have required property 'tests'"
    );
  });
});

describe("reportCrash", function () {
  let dir;
  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-crash-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the stack to a log file, and prints a prefilled issue link", function () {
    const lines = [];
    const error = new Error("boom");
    reportCrash(error, { dir, print: (l) => lines.push(l), version: "5.0.0" });
    const output = lines.join("\n");
    expect(output).to.include("boom");
    expect(output).to.include("github.com/doc-detective/doc-detective/issues/new");
    expect(output).to.include("doc-detective%20debug".replace("%20", "%20"));
    const logs = fs.readdirSync(path.join(dir, ".doc-detective"));
    expect(logs).to.have.lengthOf(1);
    expect(fs.readFileSync(path.join(dir, ".doc-detective", logs[0]), "utf8")).to.include("Error: boom");
  });

  it("redacts secrets in the log file", function () {
    const error = new Error("failed for https://user:hunter2@example.com/");
    reportCrash(error, { dir, print: () => {}, version: "5.0.0" });
    const logs = fs.readdirSync(path.join(dir, ".doc-detective"));
    expect(fs.readFileSync(path.join(dir, ".doc-detective", logs[0]), "utf8")).to.not.include("hunter2");
  });

  it("still reports when the log can't be written", function () {
    const lines = [];
    reportCrash(new Error("boom"), { dir: path.join(dir, "nope\0"), print: (l) => lines.push(l), version: "5.0.0" });
    expect(lines.join("\n")).to.include("boom");
  });
});
