// ADR 01151: with exit codes as the contract, a check that can't run must not
// pass. Each case here used to report success.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAssertion, resolveExpression } from "../dist/core/expressions.js";
import { summarizeSpecErrors } from "../dist/core/utils.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");

describe("conditions that can't be evaluated are false", function () {
  const context = { body: { x: 1 }, greeting: "hello", empty: "" };

  for (const [condition, expected] of [
    // Evaluation errors.
    ['jq($$body, "@@@bad")', false],
    ['jq($$body, "@@@bad") == 1', false],
    // jq results compare as values, not as a pending Promise.
    ['jq($$body, ".x") == 1', true],
    ['jq($$body, ".x") != 1', false],
    ['jq($$body, ".x") != 2', true],
    // Nothing found.
    ['jq($$body, ".nope")', false],
    ['extract("abc", "z")', false],
    // Text that isn't a check.
    ["$UNSET_VARIABLE", false],
    ["hello", false],
    ["false ", false],
    ["0", false],
    ["", false],
    // Real checks still work.
    ["true", true],
    ["false", false],
    ["$$greeting", true],
    ["$$empty", false],
    ['$$greeting == "hello"', true],
    ["$$body.x == 1", true],
    ['$$greeting contains "ell"', true],
    ["$$missing", false],
  ]) {
    it(`'${condition}' is ${expected}`, async function () {
      assert.equal(await evaluateAssertion(condition, context), expected);
    });
  }

  it("doesn't leave an unhandled rejection behind", async function () {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      await evaluateAssertion('jq($$body, "@@@bad") == 1', context);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    assert.deepEqual(rejections, []);
  });
});

describe("expressions outside conditions stay literal", function () {
  for (const expression of ["$$absent", "literal $$ text", "$UNSET_VARIABLE"]) {
    it(`keeps '${expression}'`, async function () {
      assert.equal(await resolveExpression({ expression, context: {} }), expression);
    });
  }

  it("preserves a failing embedded expression", async function () {
    const expression = 'r={{jq($$d, "@@@bad")}}';
    assert.equal(await resolveExpression({ expression, context: { d: {} } }), expression);
  });
});

describe("summarizeSpecErrors with several actions", function () {
  it("says a step can only have one action", function () {
    const errors =
      '/tests/0/steps/0 must match exactly one schema in oneOf ({"passingSchemas":[0,3]})';
    assert.equal(
      summarizeSpecErrors(errors, { tests: [{ steps: [{}] }] }),
      "tests[0].steps[0]: a step can only have one action."
    );
  });
});

describe("false passes through the CLI", function () {
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
  const specWith = (step) => ({ tests: [{ steps: [step] }] });
  const echo = { runShell: "echo hi" };
  const firstStep = (r) => JSON.parse(r.stdout).specs[0].tests[0].contexts[0].steps[0];

  beforeEach(function () {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dd-false-passes-"));
  });

  afterEach(function () {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("fails an assertion that's only an unset variable", function () {
    write("a.spec.json", specWith({ ...echo, assertions: "$UNSET_VARIABLE_FOR_TEST" }));
    assert.equal(run(["-i", "a.spec.json"]).status, 1);
  });

  it("fails a step whose variable has a broken jq query", function () {
    write("a.spec.json", specWith({ ...echo, variables: { MY_VAR: 'jq($$stdio, "@@@bad")' } }));
    const r = run(["-i", "a.spec.json", "--json"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(firstStep(r).resultDescription, /MY_VAR/);
  });

  it("keeps the first error when a failed step also has a broken variable", function () {
    write("a.spec.json", specWith({ runShell: "exit 3", variables: { MY_VAR: 'jq($$stdio, "@@@bad")' } }));
    const r = run(["-i", "a.spec.json", "--json"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(firstStep(r).resultDescription, /exit code 3/);
  });

  it("keeps a variable that references a missing value", function () {
    write("a.spec.json", specWith({ ...echo, variables: { MY_VAR: "$$absent" } }));
    assert.equal(run(["-i", "a.spec.json"]).status, 0);
  });

  it("fails assertions written in the report's shape", function () {
    const assertions = [{ statement: "$$exitCode == 1", source: "custom", result: "PASS" }];
    write("a.spec.json", specWith({ ...echo, assertions }));
    const r = run(["-i", "a.spec.json", "--json"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(firstStep(r).resultDescription, /assertions/);
  });

  it("exits 2 on a step with two actions", function () {
    write("a.spec.json", specWith({ ...echo, runCode: { language: "python", code: "print(1)" } }));
    const r = run(["-i", "a.spec.json"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /only have one action/);
  });

  it("exits 2 on duplicate test IDs in a spec file", function () {
    write("a.spec.json", {
      tests: [
        { testId: "same", steps: [echo] },
        { testId: "same", steps: [echo] },
      ],
    });
    const r = run(["-i", "a.spec.json"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /duplicate test ID 'same'/);
  });

  it("exits 2 on duplicate inline test IDs, as in #216", function () {
    write(
      "a.md",
      [
        '<!-- test {"testId":"same"} -->',
        '<!-- step {"runShell":"echo hi"} -->',
        "<!-- test end -->",
        '<!-- test {"testId":"same"} -->',
        '<!-- step {"runShell":"echo hi"} -->',
        "<!-- test end -->",
        "",
      ].join("\n")
    );
    const r = run(["-i", "a.md"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /duplicate test ID 'same'/);
  });

  it("exits 2 when a before file is missing", function () {
    write("a.spec.json", { tests: [{ before: "missing.spec.json", steps: [echo] }] });
    const r = run(["-i", "a.spec.json"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /missing\.spec\.json/);
  });

  it("exits 2 when an after file is missing, alongside other specs", function () {
    write("a.spec.json", { tests: [{ after: "missing.spec.json", steps: [echo] }] });
    write("b.spec.json", specWith(echo));
    const r = run(["-i", "."]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /missing\.spec\.json/);
  });

  it("says a command couldn't start, instead of exit code -2 (#215)", function () {
    write("a.spec.json", specWith({ runShell: { command: "echo hi", workingDirectory: "no-such-folder" } }));
    const r = run(["-i", "a.spec.json", "--json"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(firstStep(r).resultDescription, /couldn't start/i);
  });

  it("still reports a real exit code", function () {
    write("a.spec.json", specWith({ runShell: "exit 3" }));
    const r = run(["-i", "a.spec.json", "--json"]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(firstStep(r).outputs.exitCode, 3);
  });
});
