// ADR 01150, asserted through the real bin: an unknown key stops the run with
// exit 2 and names the key, and --no-exit-on-fail warns and skips instead.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { summarizeSpecErrors } from "../dist/core/utils.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");

describe("unknown keys through the CLI", function () {
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
  const echo = { runShell: "echo hi" };

  beforeEach(function () {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dd-strict-keys-"));
  });

  afterEach(function () {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("exits 2 on an unknown step key, and suggests the real one", function () {
    write("a.spec.json", { tests: [{ steps: [{ ...echo, asertions: [] }] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("unknown key 'asertions'");
    expect(r.stderr).to.include("Did you mean assertions?");
  });

  it("exits 2 on an unknown spec key", function () {
    write("a.spec.json", { runon: [], tests: [{ steps: [echo] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("unknown key 'runon'");
    expect(r.stderr).to.include("Did you mean runOn?");
  });

  it("skips that spec and runs the rest with --no-exit-on-fail", function () {
    write("bad.spec.json", { tests: [{ steps: [{ ...echo, asertions: [] }] }] });
    write("good.spec.json", { tests: [{ steps: [echo] }] });
    const r = run(["-i", ".", "--no-exit-on-fail", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.include("unknown key 'asertions'");
    expect(JSON.parse(r.stdout).summary.specs.pass).to.equal(1);
  });

  it("exits 2 on an unknown key in an inline step", function () {
    write("a.md", '<!-- step {"runShell":"echo hi","asertions":[]} -->\n<!-- step {"runShell":"echo hi"} -->\n');
    const r = run(["-i", "a.md"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("asertions");
  });

  it("still runs before and after steps", function () {
    write("setup.spec.json", { tests: [{ steps: [echo] }] });
    write("a.spec.json", { tests: [{ before: "setup.spec.json", after: "setup.spec.json", steps: [echo] }] });
    const r = run(["-i", "a.spec.json", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    const steps = JSON.parse(r.stdout).specs[0].tests[0].contexts[0].steps;
    expect(steps).to.have.lengthOf(3);
    for (const step of steps) expect(step).to.not.have.any.keys("_fromBefore", "_fromAfter");
  });

  it("exits 2 when a before step has an unknown key", function () {
    write("setup.spec.json", { tests: [{ steps: [{ ...echo, asertions: [] }] }] });
    write("a.spec.json", { tests: [{ before: "setup.spec.json", steps: [echo] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
  });

  it("keeps beforeAny and afterAll ordering", function () {
    write("first.spec.json", { specId: "first", tests: [{ steps: [echo] }] });
    write("last.spec.json", { specId: "last", tests: [{ steps: [echo] }] });
    write("main.spec.json", { specId: "main", tests: [{ steps: [echo] }] });
    write(
      ".doc-detective.json",
      { input: "main.spec.json", beforeAny: "last.spec.json", afterAll: "first.spec.json", telemetry: { send: false } }
    );
    const r = run(["-c", ".doc-detective.json", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(JSON.parse(r.stdout).specs.map((spec) => spec.specId)).to.deep.equal(["last", "main", "first"]);
  });
});

describe("summarizeSpecErrors with unknown keys", function () {
  const additional = (place, key) =>
    `${place} must NOT have additional properties ({"additionalProperty":"${key}"})`;

  it("names an unknown step key and the nearest real one", function () {
    const object = { tests: [{ steps: [{ goTo: "x", asertions: [] }] }] };
    expect(summarizeSpecErrors(additional("/tests/0/steps/0", "asertions"), object)).to.equal(
      "tests[0].steps[0]: unknown key 'asertions'. Did you mean assertions?"
    );
  });

  it("calls it an unknown action when the step has no action", function () {
    const errors = [
      additional("/tests/0/steps/0", "goto"),
      "/tests/0/steps/0 must have required property 'goTo' ({\"missingProperty\":\"goTo\"})",
      "/tests/0/steps/0 must have required property 'find' ({\"missingProperty\":\"find\"})",
    ].join(", ");
    expect(summarizeSpecErrors(errors, { tests: [{ steps: [{ goto: "x" }] }] })).to.equal(
      "tests[0].steps[0]: unknown action 'goto'. Did you mean goTo?"
    );
  });

  it("doesn't mistake assertions for an action", function () {
    const errors =
      "/tests/0/steps/0 must have required property 'goTo' ({\"missingProperty\":\"goTo\"})";
    const object = { tests: [{ steps: [{ stepId: "s", assertions: [] }] }] };
    expect(summarizeSpecErrors(errors, object)).to.equal(
      "tests[0].steps[0]: no action, such as goTo."
    );
  });

  it("names an unknown spec key", function () {
    expect(summarizeSpecErrors(additional("", "runon"), { runon: [] })).to.equal(
      "unknown key 'runon'. Did you mean runOn?"
    );
  });

  it("names an unknown key in an action without a suggestion", function () {
    const object = { tests: [{ steps: [{ click: { typo: 1 } }] }] };
    expect(summarizeSpecErrors(additional("/tests/0/steps/0/click", "typo"), object)).to.equal(
      "tests[0].steps[0].click: unknown key 'typo'."
    );
  });
});
