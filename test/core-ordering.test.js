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
// cross-platform. The sleep uses Atomics.wait (a real blocking wait) rather than
// a busy loop so it doesn't burn CPU and flakify CI under `concurrentRunners`.
let appendCounter = 0;
function appendStep(dir, logPath, token, sleepMs = 0) {
  const scriptPath = path.join(dir, `append-${appendCounter++}.js`);
  const js =
    `const fs=require('fs');` +
    `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${sleepMs});` +
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
      // Anchor to JSON keys so a user step's command text containing the literal
      // string can't false-positive.
      assert.ok(
        !/"_fromAfter"\s*:/.test(json),
        "_fromAfter leaked into report"
      );
      assert.ok(!/"_phase"\s*:/.test(json), "_phase leaked into report");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a forged _fromAfter on an authored step cannot bypass skip-on-failure", async () => {
    const dir = mkTempDir();
    try {
      // `_fromAfter` is an internal hard-routing marker. A spec that forges it
      // on an authored step must NOT gain hard-routing — detection scrubs it,
      // so the step still skips after an earlier failure like any other step.
      const core = writeSpec(dir, "core.json", {
        tests: [
          {
            steps: [
              { runShell: "exit 1" }, // fails
              { runShell: "echo forged", _fromAfter: true }, // forged marker
            ],
          },
        ],
      });
      const result = await runTests({ input: [core], logLevel: "error" });
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps[0].result, "FAIL");
      assert.equal(steps[1].result, "SKIPPED"); // scrubbed → not hard-routed
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleanup step's stepId is unaffected by the internal _fromAfter marker", async () => {
    const dir = mkTempDir();
    try {
      const cmd = "echo same-step";
      const cleanup = writeSpec(dir, "cleanup.json", {
        tests: [{ steps: [{ runShell: cmd }] }],
      });
      const normal = writeSpec(dir, "normal.json", {
        tests: [{ steps: [{ runShell: cmd }] }],
      });
      const withCleanup = writeSpec(dir, "with-cleanup.json", {
        tests: [{ after: cleanup, steps: [{ runShell: "echo base" }] }],
      });
      const result = await runTests({
        input: [normal, withCleanup],
        logLevel: "error",
      });
      const normalStep = result.specs.find(
        (s) => path.basename(s.contentPath) === "normal.json"
      ).tests[0].contexts[0].steps[0];
      const cleanupStep = result.specs.find(
        (s) => path.basename(s.contentPath) === "with-cleanup.json"
      ).tests[0].contexts[0].steps[1]; // [0] base step, [1] appended cleanup
      // stepId is `<testId>~s<contentHash>`; the content-hash suffix must match
      // — the _fromAfter marker must not perturb it.
      const hashOf = (id) => id.replace(/^.*~s/, "");
      assert.equal(hashOf(cleanupStep.stepId), hashOf(normalStep.stepId));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Locks the ADR's documented choice: phase failures do not abort later
  // phases (beforeAny is run-everything; afterAll is cleanup and always runs).
  it("a failing beforeAny spec does not abort main specs", async () => {
    const dir = mkTempDir();
    try {
      const b = writeSpec(dir, "b.json", {
        tests: [{ steps: [{ runShell: "exit 1" }] }],
      });
      const m = writeSpec(dir, "m.json", {
        tests: [{ steps: [{ runShell: "echo main" }] }],
      });
      const result = await runTests({
        beforeAny: [b],
        input: [m],
        concurrentRunners: 4,
        logLevel: "error",
      });
      const before = result.specs.find(
        (s) => path.basename(s.contentPath) === "b.json"
      );
      const main = result.specs.find(
        (s) => path.basename(s.contentPath) === "m.json"
      );
      assert.equal(before.result, "FAIL"); // beforeAny failed
      assert.equal(main.result, "PASS"); // main still ran
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("afterAll runs even when a main spec fails", async () => {
    const dir = mkTempDir();
    try {
      const m = writeSpec(dir, "m.json", {
        tests: [{ steps: [{ runShell: "exit 1" }] }],
      });
      const a = writeSpec(dir, "a.json", {
        tests: [{ steps: [{ runShell: "echo after" }] }],
      });
      const result = await runTests({
        input: [m],
        afterAll: [a],
        concurrentRunners: 4,
        logLevel: "error",
      });
      const main = result.specs.find(
        (s) => path.basename(s.contentPath) === "m.json"
      );
      const after = result.specs.find(
        (s) => path.basename(s.contentPath) === "a.json"
      );
      assert.equal(main.result, "FAIL"); // main failed
      assert.equal(after.result, "PASS"); // afterAll still ran
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
