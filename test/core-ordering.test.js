import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";

// Advanced ordering under concurrentRunners: beforeAny / setup(before) /
// cleanup(after) / afterAll. These exercise the local runner end-to-end with
// runShell-only steps so they're deterministic and driver-free.

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dd-ordering-"));
}

// A runShell step that synchronously sleeps `sleepMs` then appends `token` to
// `logPath`. We write a tiny helper .js (path + token baked in via
// JSON.stringify) and invoke `node "<script>"` as a plain string command —
// runShell runs with shell:true, so an inline `node -e` script gets mangled by
// the shell, whereas a quoted script path with no special chars is safe and
// cross-platform.
let appendCounter = 0;
function appendStep(dir, logPath, token, sleepMs = 0) {
  const scriptPath = path.join(dir, `append-${appendCounter++}.js`);
  const js =
    `const fs=require('fs');` +
    `const e=Date.now()+${sleepMs};while(Date.now()<e){}` +
    `fs.appendFileSync(${JSON.stringify(logPath)}, ${JSON.stringify(token + "\n")});`;
  fs.writeFileSync(scriptPath, js);
  return { runShell: `node "${scriptPath}"` };
}

function writeSpec(dir, name, spec) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(spec, null, 2));
  return p;
}

describe("Advanced ordering under concurrentRunners", function () {
  this.timeout(120000);

  it("report spec order matches input order (beforeAny → main → afterAll)", async () => {
    const dir = mkTempDir();
    try {
      const b = writeSpec(dir, "b.json", {
        tests: [{ steps: [{ runShell: "echo b" }] }],
      });
      const m = writeSpec(dir, "m.json", {
        tests: [{ steps: [{ runShell: "echo m" }] }],
      });
      const a = writeSpec(dir, "a.json", {
        tests: [{ steps: [{ runShell: "echo a" }] }],
      });
      const result = await runTests({
        beforeAny: [b],
        input: [m],
        afterAll: [a],
        logLevel: "error",
      });
      const order = result.specs.map((s) => path.basename(s.contentPath));
      assert.deepEqual(order, ["b.json", "m.json", "a.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("beforeAny completes before any main/afterAll starts under concurrentRunners>1", async () => {
    const dir = mkTempDir();
    try {
      const log = path.join(dir, "order.log");
      // beforeAny/afterAll steps are slow (300ms); main is instant. Without a
      // barrier, concurrent runners let the instant main tokens land before the
      // slow beforeAny tokens — which the assertions below catch.
      const b1 = writeSpec(dir, "b1.json", {
        tests: [{ steps: [appendStep(dir, log, "beforeAny", 300)] }],
      });
      const b2 = writeSpec(dir, "b2.json", {
        tests: [{ steps: [appendStep(dir, log, "beforeAny", 300)] }],
      });
      const m1 = writeSpec(dir, "m1.json", {
        tests: [{ steps: [appendStep(dir, log, "main", 0)] }],
      });
      const m2 = writeSpec(dir, "m2.json", {
        tests: [{ steps: [appendStep(dir, log, "main", 0)] }],
      });
      const a1 = writeSpec(dir, "a1.json", {
        tests: [{ steps: [appendStep(dir, log, "afterAll", 300)] }],
      });
      const a2 = writeSpec(dir, "a2.json", {
        tests: [{ steps: [appendStep(dir, log, "afterAll", 300)] }],
      });
      await runTests({
        beforeAny: [b1, b2],
        input: [m1, m2],
        afterAll: [a1, a2],
        concurrentRunners: 4,
        logLevel: "error",
      });
      const tokens = fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean);
      const lastBeforeAny = tokens.lastIndexOf("beforeAny");
      const firstMain = tokens.indexOf("main");
      const lastMain = tokens.lastIndexOf("main");
      const firstAfterAll = tokens.indexOf("afterAll");
      assert.equal(tokens.filter((t) => t === "beforeAny").length, 2);
      assert.equal(tokens.filter((t) => t === "main").length, 2);
      assert.equal(tokens.filter((t) => t === "afterAll").length, 2);
      assert.ok(
        lastBeforeAny < firstMain,
        `every beforeAny must precede every main; got ${tokens.join(",")}`
      );
      assert.ok(
        lastMain < firstAfterAll,
        `every main must precede every afterAll; got ${tokens.join(",")}`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("setup (before) steps prepend under the base test's identifiers", async () => {
    const dir = mkTempDir();
    try {
      const setup = writeSpec(dir, "setup.json", {
        tests: [{ steps: [{ runShell: "echo setup-step" }] }],
      });
      const core = writeSpec(dir, "core.json", {
        tests: [{ before: setup, steps: [{ runShell: "echo main-step" }] }],
      });
      const result = await runTests({ input: [core], logLevel: "error" });
      assert.equal(result.specs.length, 1);
      const spec = result.specs[0];
      assert.equal(path.basename(spec.contentPath), "core.json");
      const steps = spec.tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      // Report shows core.json starting with setup.json's steps.
      assert.equal(steps[0].runShell, "echo setup-step");
      assert.equal(steps[1].runShell, "echo main-step");
      assert.equal(spec.tests[0].result, "PASS");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleanup (after) steps run even when an earlier step fails", async () => {
    const dir = mkTempDir();
    try {
      const cleanup = writeSpec(dir, "cleanup.json", {
        tests: [{ steps: [{ runShell: "echo cleanup-ran" }] }],
      });
      const core = writeSpec(dir, "core.json", {
        tests: [
          {
            after: cleanup,
            steps: [
              { runShell: "exit 1" }, // fails
              { runShell: "echo middle" }, // should be skipped
            ],
          },
        ],
      });
      const result = await runTests({ input: [core], logLevel: "error" });
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 3);
      assert.equal(steps[0].result, "FAIL");
      assert.equal(steps[1].result, "SKIPPED");
      // The cleanup step is hard-routed: it runs despite the prior failure.
      assert.equal(steps[2].runShell, "echo cleanup-ran");
      assert.equal(steps[2].result, "PASS");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a failing cleanup step does not skip subsequent cleanup steps", async () => {
    const dir = mkTempDir();
    try {
      const cleanup = writeSpec(dir, "cleanup2.json", {
        tests: [
          {
            steps: [
              { runShell: "exit 1" }, // cleanup step that fails
              { runShell: "echo cleanup2-done" }, // must still run
            ],
          },
        ],
      });
      const core = writeSpec(dir, "core2.json", {
        tests: [{ after: cleanup, steps: [{ runShell: "echo ok" }] }],
      });
      const result = await runTests({ input: [core], logLevel: "error" });
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 3);
      assert.equal(steps[0].result, "PASS"); // main step
      assert.equal(steps[1].result, "FAIL"); // first cleanup step
      assert.equal(steps[2].runShell, "echo cleanup2-done");
      assert.equal(steps[2].result, "PASS"); // second cleanup step still ran
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("internal markers (_phase / _fromAfter) never leak into the report", async () => {
    const dir = mkTempDir();
    try {
      const cleanup = writeSpec(dir, "cleanup.json", {
        tests: [{ steps: [{ runShell: "echo cleanup-ran" }] }],
      });
      const b = writeSpec(dir, "b.json", {
        tests: [{ steps: [{ runShell: "echo b" }] }],
      });
      const core = writeSpec(dir, "core.json", {
        tests: [{ after: cleanup, steps: [{ runShell: "echo ok" }] }],
      });
      const result = await runTests({
        beforeAny: [b],
        input: [core],
        logLevel: "error",
      });
      const json = JSON.stringify(result);
      assert.ok(!json.includes("_fromAfter"), "_fromAfter leaked into report");
      assert.ok(!json.includes("_phase"), "_phase leaked into report");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
