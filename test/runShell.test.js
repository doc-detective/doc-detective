import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runShell } from "../dist/core/tests/runShell.js";

const config = { logLevel: "silent" };

// Helper: find the implicit assertion whose statement starts with `prefix`.
function findAssertion(assertions, prefix) {
  return (assertions || []).find((a) => a.statement.startsWith(prefix));
}

describe("runShell articulated assertions (Phase 4a.1)", function () {
  this.timeout(30000);

  it("emits a PASS exitCode assertion and PASS status when the command exits 0", async () => {
    const result = await runShell({
      config,
      step: { runShell: { command: "echo", args: ["hello-world"] } },
    });
    assert.equal(result.status, "PASS");
    assert.ok(Array.isArray(result.assertions));
    const exit = findAssertion(result.assertions, "exitCode");
    assert.ok(exit, "expected an exitCode assertion");
    assert.equal(exit.source, "implicit");
    assert.equal(exit.result, "PASS");
    assert.deepEqual(exit.expected, [0]);
    assert.equal(exit.actual, 0);
    // outputs preserved
    assert.equal(result.outputs.exitCode, 0);
    assert.ok(result.outputs.stdio.stdout.includes("hello-world"));
  });

  it("emits a FAIL exitCode assertion and FAIL status when the exit code is unexpected", async () => {
    const result = await runShell({
      config,
      step: { runShell: { command: "exit 3", exitCodes: [0] } },
    });
    assert.equal(result.status, "FAIL");
    const exit = findAssertion(result.assertions, "exitCode");
    assert.ok(exit);
    assert.equal(exit.result, "FAIL");
    assert.deepEqual(exit.expected, [0]);
    assert.equal(exit.actual, 3);
  });

  it("passes when a non-zero exit code is allowed via exitCodes", async () => {
    const result = await runShell({
      config,
      step: { runShell: { command: "exit 3", exitCodes: [3] } },
    });
    assert.equal(result.status, "PASS");
    const exit = findAssertion(result.assertions, "exitCode");
    assert.equal(exit.result, "PASS");
    assert.equal(exit.actual, 3);
  });

  it("emits a PASS stdio assertion when stdio substring matches", async () => {
    const result = await runShell({
      config,
      step: {
        runShell: { command: "echo", args: ["needle"], stdio: "needle" },
      },
    });
    assert.equal(result.status, "PASS");
    const stdio = findAssertion(result.assertions, "stdio");
    assert.ok(stdio, "expected a stdio assertion");
    assert.equal(stdio.source, "implicit");
    assert.equal(stdio.result, "PASS");
  });

  it("emits a FAIL stdio assertion when stdio substring does not match", async () => {
    const result = await runShell({
      config,
      step: {
        runShell: { command: "echo", args: ["haystack"], stdio: "needle" },
      },
    });
    assert.equal(result.status, "FAIL");
    const stdio = findAssertion(result.assertions, "stdio");
    assert.ok(stdio);
    assert.equal(stdio.result, "FAIL");
  });

  it("short-circuits: a failing exitCode assertion emits a SKIPPED stdio record (applicable but not reached)", async () => {
    const result = await runShell({
      config,
      step: {
        runShell: {
          command: "exit 1",
          exitCodes: [0],
          stdio: "anything",
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const exit = findAssertion(result.assertions, "exitCode");
    assert.equal(exit.result, "FAIL");
    // stdio is APPLICABLE (stdio is set) but not reached due to short-circuit:
    // it must appear as a SKIPPED record, carrying its statement/source/expected.
    const stdio = findAssertion(result.assertions, "stdio");
    assert.ok(stdio, "applicable-but-not-reached stdio assertion must be present");
    assert.equal(stdio.result, "SKIPPED");
    assert.equal(stdio.source, "implicit");
    assert.equal(stdio.expected, "anything");
    // No saved-file variation check is applicable here (path unset) -> omitted.
    const variation = findAssertion(result.assertions, "saved-file variation");
    assert.equal(
      variation,
      undefined,
      "not-applicable variation check must be omitted, not SKIPPED"
    );
    // Exactly the two applicable assertions: exitCode FAIL, stdio SKIPPED.
    assert.equal(result.assertions.length, 2);
  });

  it("short-circuits: exit-FAIL with neither stdio nor path emits only the exitCode FAIL record", async () => {
    const result = await runShell({
      config,
      step: {
        runShell: {
          command: "exit 1",
          exitCodes: [0],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.assertions.length, 1, "only the exitCode assertion is applicable");
    assert.equal(result.assertions[0].result, "FAIL");
    assert.ok(result.assertions[0].statement.startsWith("exitCode"));
  });

  describe("saved-file variation", function () {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runshell-"));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("PASS when saved-file variation is within tolerance", async () => {
      const filePath = path.join(tmpDir, "out.txt");
      fs.writeFileSync(filePath, "hello");
      const result = await runShell({
        config,
        step: {
          runShell: {
            command: "echo",
            args: ["hello"],
            path: filePath,
            maxVariation: 0.1,
            overwrite: "aboveVariation",
          },
        },
      });
      assert.equal(result.status, "PASS");
      const variation = findAssertion(result.assertions, "saved-file variation");
      assert.ok(variation, "expected a variation assertion");
      assert.equal(variation.result, "PASS");
    });

    it("WARNING when saved-file variation exceeds tolerance", async () => {
      const filePath = path.join(tmpDir, "out.txt");
      fs.writeFileSync(filePath, "initial content");
      const result = await runShell({
        config,
        step: {
          runShell: {
            command: "echo",
            args: ["completely different content"],
            path: filePath,
            maxVariation: 0.1,
            overwrite: "aboveVariation",
          },
        },
      });
      assert.equal(result.status, "WARNING");
      const variation = findAssertion(result.assertions, "saved-file variation");
      assert.ok(variation);
      assert.equal(variation.result, "WARNING");
    });

    // SANCTIONED BUG FIX: a FAIL (exitCode) followed by an applicable-but-not-
    // reached variation check must roll up to FAIL. Previously the late
    // maxVariation WARNING `return`ed and clobbered the earlier exitCode FAIL.
    it("exit-FAIL with path set: variation emits SKIPPED, rolls up to FAIL", async () => {
      const filePath = path.join(tmpDir, "out.txt");
      fs.writeFileSync(filePath, "initial content");
      const result = await runShell({
        config,
        step: {
          runShell: {
            // Non-zero exit, but still writes to stdout so the file is compared.
            command: "echo completely different content && exit 1",
            exitCodes: [0],
            path: filePath,
            maxVariation: 0.1,
            overwrite: "aboveVariation",
          },
        },
      });
      assert.equal(result.status, "FAIL", "FAIL + trailing SKIPPED must roll up to FAIL");
      const exit = findAssertion(result.assertions, "exitCode");
      assert.ok(exit);
      assert.equal(exit.result, "FAIL");
      // The fix: previously the late maxVariation WARNING did `status="WARNING";
      // return`, clobbering the exitCode FAIL. Now the FAIL stands and the
      // applicable-but-not-reached variation assertion is reported as SKIPPED —
      // no WARNING leaks into the rolled-up result.
      assert.ok(
        !result.assertions.some((a) => a.result === "WARNING"),
        "no WARNING should leak when a prior assertion FAILed"
      );
      // The variation check is APPLICABLE (path set) but not reached -> SKIPPED.
      const variation = findAssertion(result.assertions, "saved-file variation");
      assert.ok(variation, "applicable variation assertion must be present");
      assert.equal(variation.result, "SKIPPED");
      assert.equal(variation.source, "implicit");
      assert.equal(variation.expected, 0.1);
      // stdio is NOT applicable here (unset) -> omitted entirely.
      assert.equal(
        findAssertion(result.assertions, "stdio"),
        undefined,
        "not-applicable stdio check must be omitted, not SKIPPED"
      );
      // Records: [exitCode FAIL, saved-file variation SKIPPED].
      assert.equal(result.assertions.length, 2);
      // The file side effect still ran (overwrite=aboveVariation): the file now
      // holds the new content, preserving prior behavior.
      assert.ok(fs.readFileSync(filePath, "utf8").includes("completely different content"));
    });
  });

  it("returns FAIL with no assertions on a command timeout (execution error)", async () => {
    // Portable ~5s sleep: Windows `ping` (no `sleep` on Windows), POSIX `sleep`.
    const sleepCommand =
      os.platform() === "win32"
        ? "ping -n 6 127.0.0.1"
        : "sleep 5";
    const result = await runShell({
      config,
      step: {
        runShell: {
          command: sleepCommand,
          timeout: 200,
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "execution errors must not produce assertion records"
    );
  });

  it("returns FAIL with no assertions on an invalid step (input guard)", async () => {
    const result = await runShell({
      config,
      step: { runShell: { args: ["no-command"] } },
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "input-guard failures must not produce assertion records"
    );
  });
});
