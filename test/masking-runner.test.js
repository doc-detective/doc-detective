// Where values get registered for masking, and what the runner masks
// (ADR 01178). Shell-only specs, so no browser is needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { maskString, maskedHitNames, resetMasking } from "../dist/core/masking.js";
import { replaceEnvs, loadEnvs, log as coreLog, runExitCode } from "../dist/core/utils.js";
import { loadProjectEnv, setConfig } from "../dist/utils.js";
import { diag } from "../dist/cliOutput.js";
import { runTests } from "../dist/core/index.js";

function captureStderr(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then(() => lines.join("\n"));
}

describe("masking registration", function () {
  let dir;
  const vars = [];
  const setEnv = (name, value) => {
    vars.push(name);
    process.env[name] = value;
  };
  beforeEach(function () {
    resetMasking();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-masking-"));
  });
  afterEach(function () {
    for (const name of vars.splice(0)) delete process.env[name];
    fs.rmSync(dir, { recursive: true, force: true });
    resetMasking();
  });

  it("replaceEnvs registers each value it substitutes", function () {
    setEnv("DD_MASK_REF", "ref-value-123");
    replaceEnvs({ a: "x $DD_MASK_REF y" });
    assert.equal(maskString("ref-value-123"), "***DD_MASK_REF***");
  });

  it("loadEnvs registers every loaded value, referenced or not", async function () {
    const file = path.join(dir, "vars.env");
    fs.writeFileSync(file, "DD_MASK_LOADED=loaded-value-1\n");
    vars.push("DD_MASK_LOADED");
    await loadEnvs(file);
    assert.equal(maskString("loaded-value-1"), "***DD_MASK_LOADED***");
  });

  it("loadProjectEnv registers every .env value", async function () {
    fs.writeFileSync(path.join(dir, ".env"), "DD_MASK_DOTENV=dotenv-value-1\n");
    vars.push("DD_MASK_DOTENV");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await loadProjectEnv({});
    } finally {
      process.chdir(cwd);
    }
    assert.equal(maskString("dotenv-value-1"), "***DD_MASK_DOTENV***");
  });

  it("registers the value the run uses when the shell beats .env, and the file's value too", async function () {
    fs.writeFileSync(path.join(dir, ".env"), "DD_MASK_SHADOWED=placeholder-value\n");
    setEnv("DD_MASK_SHADOWED", "real-ci-value-1");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await loadProjectEnv({});
    } finally {
      process.chdir(cwd);
    }
    assert.equal(process.env.DD_MASK_SHADOWED, "real-ci-value-1");
    assert.equal(maskString("real-ci-value-1 placeholder-value"), "***DD_MASK_SHADOWED*** ***DD_MASK_SHADOWED***");
  });

  it("registers the value the run uses when a config loadVariables file doesn't override", async function () {
    const file = path.join(dir, "vars.env");
    fs.writeFileSync(file, "DD_MASK_KEPT=file-value-22\n");
    setEnv("DD_MASK_KEPT", "shell-value-22");
    await loadEnvs(file, { override: false });
    assert.equal(maskString("shell-value-22 file-value-22"), "***DD_MASK_KEPT*** ***DD_MASK_KEPT***");
  });

  it("registers a value read from a credential file", async function () {
    const key = path.join(dir, "key");
    fs.writeFileSync(key, "file-api-key-1\n");
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ integrations: { docDetectiveApi: { apiKeyFile: key } } }));
    await setConfig({ configPath: file, args: {} });
    assert.equal(maskString("file-api-key-1"), "***apiKey***");
  });

  it("diag masks each line", async function () {
    setEnv("DD_MASK_REF", "ref-value-123");
    replaceEnvs("$DD_MASK_REF");
    const out = await captureStderr(() => diag("value: ref-value-123"));
    assert.equal(out, "value: ***DD_MASK_REF***");
  });

  it("the core log masks object messages", async function () {
    setEnv("DD_MASK_REF", "ref-value-123");
    replaceEnvs("$DD_MASK_REF");
    const out = await captureStderr(() => coreLog({ logLevel: "info" }, "info", { "ref-value-123": 'a"ref-value-123' }));
    assert.equal(out.includes("ref-value-123"), false, out);
    assert.match(out, /\*\*\*DD_MASK_REF\*\*\*/);
  });
});

describe("masking in a run", function () {
  this.timeout(120000);
  const vars = [];
  const setEnv = (name, value) => {
    vars.push(name);
    process.env[name] = value;
  };
  beforeEach(() => resetMasking());
  afterEach(function () {
    for (const name of vars.splice(0)) delete process.env[name];
    resetMasking();
  });

  async function run(specs, config = {}) {
    fs.mkdirSync(path.resolve("./.tmp"), { recursive: true });
    const files = specs.map((spec, i) => {
      const file = path.resolve(`./.tmp/masking-${process.pid}-${i}.spec.json`);
      fs.writeFileSync(file, JSON.stringify(spec));
      return file;
    });
    try {
      return await runTests({ input: files, logLevel: "silent", telemetry: { send: false }, ...config });
    } finally {
      for (const file of files) fs.rmSync(file, { force: true });
    }
  }

  it("masks the step report but routes on, compares, and exports the real value", async function () {
    setEnv("DD_MASK_TOKEN", "tok-real-98765");
    vars.push("DD_MASK_EXPORTED");
    const results = await run([
      {
        specId: "mask-report",
        tests: [
          {
            testId: "t",
            steps: [
              {
                stepId: "echo",
                runShell: { command: "echo $DD_MASK_TOKEN", stdio: "$DD_MASK_TOKEN" },
                variables: { DD_MASK_EXPORTED: "$$stdio.stdout" },
              },
              {
                runShell: "echo routed",
                if: "$$steps.echo.outputs.stdio.stdout == 'tok-real-98765'",
              },
            ],
          },
        ],
      },
    ]);
    const steps = results.specs[0].tests[0].contexts[0].steps;
    assert.equal(steps[0].result, "PASS");
    assert.equal(steps[0].runShell.command, "echo ***DD_MASK_TOKEN***");
    assert.equal(steps[0].outputs.stdio.stdout, "***DD_MASK_TOKEN***");
    assert.equal(steps[1].result, "PASS", "the guard saw the real value");
    assert.equal(process.env.DD_MASK_EXPORTED, "tok-real-98765");
    assert.equal(JSON.stringify(results).includes("tok-real-98765"), false);
  });

  it("keeps report keys when a value matches one, such as `pass` or `test`", async function () {
    setEnv("DD_KEY_PASSWORD", "pass");
    setEnv("DD_KEY_TOKEN", "test");
    const results = await run([
      { specId: "mask-keys", tests: [{ testId: "keys", steps: [{ runShell: "echo pass test" }] }] },
    ]);
    assert.deepEqual(results.summary.specs, { pass: 1, fail: 0, warning: 0, skipped: 0 });
    assert.equal(results.specs[0].tests[0].testId, "keys");
    assert.equal(runExitCode(results), 0);
    assert.equal(
      results.specs[0].tests[0].contexts[0].steps[0].outputs.stdio.stdout,
      "***DD_KEY_PASSWORD*** ***DD_KEY_TOKEN***"
    );
  });

  it("masks httpRequest response headers", async function () {
    setEnv("DD_PROBE_TOKEN", "probe-token-4711");
    const server = http.createServer((req, res) => {
      res.setHeader("x-echo-authorization", req.headers.authorization ?? "");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ seen: req.headers.authorization }));
    });
    await new Promise((resolve) => server.listen(0, resolve));
    try {
      const results = await run([
        {
          specId: "mask-headers",
          tests: [
            {
              testId: "t",
              steps: [
                {
                  httpRequest: {
                    url: `http://localhost:${server.address().port}/`,
                    request: { headers: { Authorization: "Bearer $DD_PROBE_TOKEN" } },
                  },
                },
              ],
            },
          ],
        },
      ]);
      const step = results.specs[0].tests[0].contexts[0].steps[0];
      assert.equal(step.result, "PASS", step.resultDescription);
      assert.equal(JSON.stringify(results).includes("probe-token-4711"), false);
      assert.equal(step.outputs.response.headers["x-echo-authorization"], "Bearer ***DD_PROBE_TOKEN***");
    } finally {
      server.close();
    }
  });

  it("starts each run with its own public list and hint names", async function () {
    setEnv("DD_MASK_FIRST", "first-value-1");
    setEnv("DD_MASK_SECOND", "second-value-2");
    const first = await run(
      [{ specId: "first", tests: [{ testId: "t", steps: [{ runShell: "echo $DD_MASK_FIRST" }] }] }],
      { publicVariables: ["*"] }
    );
    assert.equal(first.specs[0].tests[0].contexts[0].steps[0].outputs.stdio.stdout, "first-value-1");
    const second = await run([
      { specId: "second", tests: [{ testId: "t", steps: [{ runShell: "echo $DD_MASK_SECOND $DD_MASK_FIRST" }] }] },
    ]);
    assert.equal(
      second.specs[0].tests[0].contexts[0].steps[0].outputs.stdio.stdout,
      "***DD_MASK_SECOND*** ***DD_MASK_FIRST***"
    );
    const third = await run([{ specId: "third", tests: [{ testId: "t", steps: [{ runShell: "echo $DD_MASK_SECOND" }] }] }]);
    assert.ok(third);
    assert.deepEqual(maskedHitNames(), ["DD_MASK_SECOND"]);
  });

  it("masks secret-named variables a run never references", async function () {
    setEnv("DD_UNREFERENCED_TOKEN", "never-referenced-1");
    const results = await run([
      {
        specId: "mask-unreferenced",
        tests: [{ testId: "t", steps: [{ runShell: "node -e \"console.log(process.env.DD_UNREFERENCED_TOKEN)\"" }] }],
      },
    ]);
    const step = results.specs[0].tests[0].contexts[0].steps[0];
    assert.equal(step.outputs.stdio.stdout, "***DD_UNREFERENCED_TOKEN***");
  });

  it("unmasks a name listed by a test in one spec for every spec in the run", async function () {
    setEnv("DD_MASK_SHARED", "shared-value-1");
    const results = await run([
      { specId: "a", tests: [{ testId: "a", publicVariables: ["DD_MASK_SHARED"], steps: [{ runShell: "echo one" }] }] },
      { specId: "b", tests: [{ testId: "b", steps: [{ runShell: "echo $DD_MASK_SHARED" }] }] },
    ]);
    const spec = results.specs.find((s) => s.specId === "b");
    assert.equal(spec.tests[0].contexts[0].steps[0].outputs.stdio.stdout, "shared-value-1");
  });

  it("leaves no fragment of a long secret in failure descriptions", async function () {
    const secret = Array.from({ length: 300 }, (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789"[(i * 7) % 36]).join("");
    setEnv("DD_MASK_LONG", secret);
    const results = await run([
      {
        specId: "mask-long",
        tests: [
          {
            testId: "t",
            steps: [
              { runShell: { command: "echo $DD_MASK_LONG", stdio: "no-such-output", exitCodes: [7] }, onFail: [{ continue: true }] },
              {
                httpRequest: {
                  url: "http://localhost:8092/api/echo",
                  method: "post",
                  request: { body: { value: "$DD_MASK_LONG" } },
                  response: { body: { value: "different" } },
                },
              },
            ],
          },
        ],
      },
    ]);
    const text = JSON.stringify(results);
    for (let i = 0; i + 12 <= secret.length; i += 6) {
      assert.equal(text.includes(secret.slice(i, i + 12)), false, `fragment at ${i}`);
    }
    const [shell, http] = results.specs[0].tests[0].contexts[0].steps;
    assert.equal(shell.result, "FAIL");
    assert.equal(http.result, "FAIL");
  });

  it("masks the dry-run plan", async function () {
    setEnv("DD_MASK_PLAN_TOKEN", "plan-value-1");
    const plan = await run(
      [{ specId: "plan", tests: [{ testId: "t", steps: [{ runShell: "echo plan-value-1" }] }] }],
      { dryRun: true }
    );
    assert.equal(JSON.stringify(plan).includes("plan-value-1"), false);
    assert.match(JSON.stringify(plan), /\*\*\*DD_MASK_PLAN_TOKEN\*\*\*/);
  });

  it("logs the masked names at debug, never the values", async function () {
    setEnv("DD_MASK_TOKEN", "tok-real-98765");
    const out = await captureStderr(() =>
      run([{ specId: "mask-log", tests: [{ testId: "t", steps: [{ runShell: "echo $DD_MASK_TOKEN" }] }] }], {
        logLevel: "debug",
      })
    );
    assert.match(out, /Masking the values? of \d+ variables?: [^\n]*DD_MASK_TOKEN/);
    assert.equal(out.includes("tok-real-98765"), false);
  });
});
