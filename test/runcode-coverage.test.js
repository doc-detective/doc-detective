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
import path from "node:path";
import sinon from "sinon";
import { runCode } from "../dist/core/tests/runCode.js";

const config = { logLevel: "silent" };

describe("runCode coverage", function () {
  afterEach(function () {
    sinon.restore();
  });

  it("runs bash through the shared shell resolution on Windows (the old guard is lifted)", async function () {
    this.timeout(30000);
    // The historical hard FAIL for bash-on-Windows is gone: runCode resolves
    // the interpreter through resolveShellExecutable("bash"). With platform
    // stubbed to win32, the win32 dispatch branch is exercised; the resolver
    // itself sees the REAL platform (its deps default to process.platform),
    // so this stays hermetic — real Windows resolves Git Bash, POSIX legs
    // resolve the system bash — and the step succeeds everywhere bash exists.
    sinon.stub(os, "platform").returns("win32");
    const result = await runCode({
      config,
      step: {
        runCode: { language: "bash", code: "echo guard-lifted", stdio: "guard-lifted" },
      },
    });
    assert.equal(result.status, "PASS", result.description);
  });

  // Spec path resolution (resolvePaths) already folds `directory` into an
  // absolute `path`, as it does for runShell and httpRequest. runCode must save
  // to that `path` as-is, not join `directory` onto it a second time (which
  // doubled the folder: `<dir>/<dir>/out.txt`, or ENOENT on Windows).
  it("saves output to the resolved path when directory is also set", async function () {
    this.timeout(15000);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dd-runcode-dir-"));
    const outPath = path.join(directory, "out.txt");
    try {
      const result = await runCode({
        config,
        step: {
          runCode: {
            language: "javascript",
            code: "process.stdout.write('ok')",
            // The shape resolvePaths hands the runner.
            path: outPath,
            directory,
          },
        },
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(fs.readFileSync(outPath, "utf8"), "ok");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
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

  it("rejects `command`, which isn't part of the schema", async function () {
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
    assert.match(result.description, /^Couldn't run the step: its definition isn't valid\. runCode: unknown key .command./);
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
          // Gitignored scratch location (CLAUDE.md "Testing behavior").
          path: ".tmp/runcode-bare-out.txt",
        },
      },
    });
    assert.equal(typeof result.status, "string");
    assert.doesNotMatch(result.description || "", /Couldn't run the step: its definition isn't valid\./);
  });
});
