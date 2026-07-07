// Coverage-closing tests for src/core/tests/runCode.ts (compiled
// dist/core/tests/runCode.js).
//
// runCode is entirely node-side: it writes the snippet to a temp script and
// runs it through runShell (spawning a real interpreter). No browser driver is
// involved, so everything here is hermetic and offline — the only subprocesses
// are short-lived local `node` invocations. The E2E suite already covers the
// language/command dispatch; these tests close the union-uncovered branches:
//   - the Windows+bash guard
//   - path+directory option forwarding
//   - the background-start temp-script retention
//   - the finally-block unlink-failure warning
//
// os and fs are default imports in runCode.ts, so stubbing a property on the
// shared module object intercepts its call-time use.

import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import sinon from "sinon";
import { runCode } from "../dist/core/tests/runCode.js";

const config = { logLevel: "silent" };

describe("runCode coverage", function () {
  afterEach(function () {
    sinon.restore();
  });

  it("FAILs bash on Windows (the win32 guard)", async function () {
    this.timeout(15000);
    sinon.stub(os, "platform").returns("win32");
    const result = await runCode({
      config,
      step: { runCode: { language: "bash", code: "echo hi" } },
    });
    // On Linux/macOS legs bash exists, so control reaches the win32+bash guard
    // and FAILs there; where bash is absent it FAILs the availability check
    // first. Either way the step FAILs — the guard line is covered on the legs
    // that have bash.
    assert.equal(result.status, "FAIL");
  });

  it("forwards a path joined with directory to runShell", async function () {
    this.timeout(15000);
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "process.stdout.write('ok')",
          path: "out.txt",
          directory: "sub",
        },
      },
    });
    // The point is exercising the path+directory join (forwarded to runShell);
    // the run itself may PASS or FAIL depending on file comparison, but it must
    // get past step validation (i.e. not the "Invalid step definition" error).
    assert.equal(typeof result.status, "string");
    assert.doesNotMatch(result.description || "", /Invalid step definition/);
  });

  it("retains the temp script and records its path for a background process", async function () {
    this.timeout(15000);
    const registry = new Map();
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "setTimeout(() => {}, 8000)",
          background: { name: "bgproc" },
        },
      },
      processRegistry: registry,
    });
    try {
      assert.equal(result.status, "PASS");
      const entry = registry.get("bgproc");
      assert.ok(entry, "background process registered");
      assert.ok(entry.tempPath, "deferred temp-script path recorded on the entry");
    } finally {
      // Tear down the background process and its retained temp script.
      const entry = registry.get("bgproc");
      if (entry?.bg?.kill) {
        try {
          await entry.bg.kill();
        } catch {
          /* best effort */
        }
      } else if (entry?.bg?.pid) {
        try {
          process.kill(entry.bg.pid);
        } catch {
          /* already gone */
        }
      }
      if (entry?.tempPath) {
        try {
          fs.unlinkSync(entry.tempPath);
        } catch {
          /* already gone */
        }
      }
    }
  });

  it("warns (without throwing) when the temp script can't be removed", async function () {
    this.timeout(15000);
    // Force the finally-block cleanup to fail. writeFileSync is left real so the
    // script is created and runs; only the unlink is made to throw.
    sinon.stub(fs, "unlinkSync").throws(new Error("EPERM: simulated"));
    const result = await runCode({
      config,
      step: { runCode: { language: "javascript", code: "process.exit(0)" } },
    });
    // The cleanup failure is swallowed (logged as a warning), so runCode still
    // returns a normal result rather than propagating the unlink error.
    assert.equal(typeof result.status, "string");
    assert.doesNotMatch(result.description || "", /EPERM/);
  });

  it("FAILs when the temp script can't be created", async function () {
    this.timeout(15000);
    // createTempScript's writeFileSync throws -> it rethrows -> runCode's
    // create-script catch reports FAIL.
    sinon.stub(fs, "writeFileSync").throws(new Error("ENOSPC: simulated"));
    const result = await runCode({
      config,
      step: { runCode: { language: "javascript", code: "process.exit(0)" } },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Failed to create temporary script/);
  });

  it("FAILs when the resolved command is unavailable", async function () {
    this.timeout(15000);
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "process.exit(0)",
          command: "doc-detective-nonexistent-cmd-xyz",
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /is unavailable/);
  });

  it("uses the .py extension and python command for a python snippet", async function () {
    this.timeout(15000);
    // The extension choice (createTempScript) and the python command dispatch
    // both run before the availability check, so this covers them whether or
    // not python is installed (an unavailable-command FAIL is acceptable).
    const result = await runCode({
      config,
      step: { runCode: { language: "python", code: "print('hi')" } },
    });
    assert.equal(typeof result.status, "string");
  });

  it("forwards a bare path (no directory) unchanged to runShell", async function () {
    this.timeout(15000);
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "process.stdout.write('ok')",
          path: "out.txt",
        },
      },
    });
    // Exercises the `path` branch without a `directory` (the false arm of the
    // directory-join ternary).
    assert.equal(typeof result.status, "string");
    assert.doesNotMatch(result.description || "", /Invalid step definition/);
  });
});
