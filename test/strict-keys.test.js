// ADR 01150, asserted through the real bin: an unknown key stops the run with
// exit 2 and names the key, and --no-exit-on-fail warns and skips instead.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { summarizeSchemaErrors } from "../dist/core/utils.js";
import { validate } from "../dist/common/src/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");

describe("unknown keys through the CLI", function () {
  this.timeout(60000);
  let cwd;

  function run(args, envConfig = {}) {
    const env = { ...process.env };
    for (const key of ["CI", "DEBUG", "DOC_DETECTIVE_DEBUG"]) delete env[key];
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      input: "",
      env: {
        ...env,
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false, ...envConfig }),
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
    expect(r.stderr).to.include("unknown key `asertions`");
    expect(r.stderr).to.include("Did you mean `assertions`?");
  });

  it("exits 2 on an unknown spec key", function () {
    write("a.spec.json", { runon: [], tests: [{ steps: [echo] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("unknown key `runon`");
    expect(r.stderr).to.include("Did you mean `runOn`?");
  });

  it("suggests a key inside an action", function () {
    write("a.spec.json", { tests: [{ steps: [{ runShell: { comand: "echo hi" } }] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("tests[0].steps[0].runShell: unknown key `comand`. Did you mean `command`?");
  });

  it("lists the allowed values, without the other branches' type errors", function () {
    write("a.spec.json", { tests: [{ steps: [{ click: { selector: "#go", button: "middle-ish" } }] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include('must be one of left, right, middle (got "middle-ish").');
    expect(r.stderr).to.not.include("click: must be string");
  });

  it("skips that spec and runs the rest with --no-exit-on-fail", function () {
    write("bad.spec.json", { tests: [{ steps: [{ ...echo, asertions: [] }] }] });
    write("good.spec.json", { tests: [{ steps: [echo] }] });
    const r = run(["-i", ".", "--no-exit-on-fail", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stderr).to.include("unknown key `asertions`");
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

  it("upgrades v2 steps from a before file, instead of dropping the spec", function () {
    write("setup.spec.json", { tests: [{ steps: [{ action: "runShell", command: "echo hi" }] }] });
    write("a.spec.json", { tests: [{ before: "setup.spec.json", steps: [echo] }] });
    const r = run(["-i", "a.spec.json", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(JSON.parse(r.stdout).specs[0].tests[0].contexts[0].steps).to.have.lengthOf(2);
  });

  it("still runs a whole v2 spec", function () {
    write("a.spec.json", { id: "v2", tests: [{ steps: [{ action: "runShell", command: "echo hi" }] }] });
    const r = run(["-i", "a.spec.json", "--json"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(JSON.parse(r.stdout).summary.specs.pass).to.equal(1);
  });

  it("names a long invalid inline step by a short prefix, not the whole step", function () {
    const long = "x".repeat(200);
    write("a.md", `<!-- step {"runShell":"echo ${long}","asertions":[]} -->\n`);
    const r = run(["-i", "a.md"]);
    expect(r.status, r.stderr).to.equal(2);
    const note = r.stderr.split("\n").find((line) => line.endsWith("Did you mean `assertions`?"));
    expect(note).to.match(/^\{"runShell":"echo x+…: unknown key `asertions`\./);
    expect(note).to.not.include(long);
  });

  it("suggests a step key for an unknown key in an inline step", function () {
    write("a.md", '<!-- step {"runShell":"echo hi","asertions":[]} -->\n');
    const r = run(["-i", "a.md"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("Did you mean `assertions`?");
  });

  it("exits 2 when a before step has an unknown key", function () {
    write("setup.spec.json", { tests: [{ steps: [{ ...echo, asertions: [] }] }] });
    write("a.spec.json", { tests: [{ before: "setup.spec.json", steps: [echo] }] });
    const r = run(["-i", "a.spec.json"]);
    expect(r.status, r.stderr).to.equal(2);
  });

  // ADR 01169: beforeAll replaces beforeAny, which still works and warns once.
  for (const key of ["beforeAll", "beforeAny"]) {
    it(`keeps ${key} and afterAll ordering`, function () {
      write("first.spec.json", { specId: "first", tests: [{ steps: [echo] }] });
      write("last.spec.json", { specId: "last", tests: [{ steps: [echo] }] });
      write("main.spec.json", { specId: "main", tests: [{ steps: [echo] }] });
      write(
        ".doc-detective.json",
        { input: "main.spec.json", [key]: "last.spec.json", afterAll: "first.spec.json", telemetry: { send: false } }
      );
      const r = run(["-c", ".doc-detective.json", "--json"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout).specs.map((spec) => spec.specId)).to.deep.equal(["last", "main", "first"]);
      const warnings = r.stderr.split("\n").filter((line) => line.includes("`beforeAny` is deprecated"));
      expect(warnings).to.have.lengthOf(key === "beforeAny" ? 1 : 0);
    });
  }

  for (const [fileKey, envKey] of [["beforeAny", "beforeAll"], ["beforeAll", "beforeAny"]]) {
    it(`lets DOC_DETECTIVE_CONFIG ${envKey} override a config file ${fileKey}`, function () {
      write("file.spec.json", { specId: "file", tests: [{ steps: [echo] }] });
      write("env.spec.json", { specId: "env", tests: [{ steps: [echo] }] });
      write("main.spec.json", { specId: "main", tests: [{ steps: [echo] }] });
      write(".doc-detective.json", { input: "main.spec.json", [fileKey]: "file.spec.json" });
      const r = run(["-c", ".doc-detective.json", "--json"], { [envKey]: "env.spec.json" });
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout).specs.map((spec) => spec.specId)).to.deep.equal(["env", "main"]);
      expect(r.stderr.split("\n").filter((line) => line.includes("`beforeAny` is deprecated"))).to.have.lengthOf(1);
    });
  }

  it("exits 2 when beforeAll and beforeAny are both set", function () {
    write("setup.spec.json", { tests: [{ steps: [echo] }] });
    write(".doc-detective.json", { beforeAll: "setup.spec.json", beforeAny: "setup.spec.json", telemetry: { send: false } });
    const r = run(["-c", ".doc-detective.json"]);
    expect(r.status, r.stderr).to.equal(2);
    expect(r.stderr).to.include("beforeAll: set `beforeAll` or `beforeAny`, not both.");
  });
});

describe("summarizeSchemaErrors with unknown keys", function () {
  const summarize = (object, schemaKey = "spec_v3") =>
    summarizeSchemaErrors(
      validate({ schemaKey, object, addDefaults: false, structuredErrors: true }).errorObjects,
      object,
      schemaKey
    );
  const spec = (step) => ({ tests: [{ steps: [step] }] });

  it("names an unknown step key and the nearest real one", function () {
    expect(summarize(spec({ goTo: "https://example.com", asertions: [] }))).to.equal(
      "tests[0].steps[0]: unknown key `asertions`. Did you mean `assertions`?"
    );
  });

  it("calls it an unknown action when the step has no action", function () {
    expect(summarize(spec({ goto: "x" }))).to.equal("tests[0].steps[0]: unknown action `goto`. Did you mean `goTo`?");
  });

  it("doesn't mistake assertions for an action", function () {
    expect(summarize(spec({ stepId: "s", assertions: [] }))).to.equal(
      "tests[0].steps[0]: no action, such as checkLink, click, find."
    );
  });

  it("suggests step keys for a step validated on its own", function () {
    expect(summarize({ goTo: "https://example.com", asertions: [] }, "step_v3")).to.equal(
      "unknown key `asertions`. Did you mean `assertions`?"
    );
  });

  it("doesn't call a real action unknown when only its value is wrong", function () {
    const summary = summarize(spec({ goTo: [] }));
    expect(summary).to.not.include("unknown action");
    expect(summary).to.include("tests[0].steps[0].goTo: must be");
  });

  it("names an unknown spec key", function () {
    expect(summarize({ runon: [], tests: [{ steps: [{ runShell: "echo hi" }] }] })).to.equal(
      "unknown key `runon`. Did you mean `runOn`?"
    );
  });

  it("names an unknown key in an action, and suggests only a close one", function () {
    expect(summarize(spec({ click: { selector: "#go", nope: 1 } }))).to.equal(
      "tests[0].steps[0].click: unknown key `nope`."
    );
    expect(summarize(spec({ click: { selector: "#go", buton: "left" } }))).to.equal(
      "tests[0].steps[0].click: unknown key `buton`. Did you mean `button`?"
    );
  });
});
