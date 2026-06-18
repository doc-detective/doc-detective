import assert from "node:assert/strict";
import { runCode } from "../dist/core/tests/runCode.js";

const config = { logLevel: "silent" };

function findAssertion(assertions, prefix) {
  return (assertions || []).find((a) => a.statement.startsWith(prefix));
}

describe("runCode articulated assertions + bug #1 (Phase 4a.2a)", function () {
  this.timeout(30000);

  it("propagates runShell's exitCode PASS assertion and PASS status on success", async () => {
    const result = await runCode({
      config,
      step: {
        runCode: { language: "javascript", code: "console.log('hi');" },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    assert.ok(Array.isArray(result.assertions), "expected assertions to propagate");
    const exit = findAssertion(result.assertions, "exitCode");
    assert.ok(exit, "expected an exitCode assertion");
    assert.equal(exit.source, "implicit");
    assert.equal(exit.result, "PASS");
  });

  // BUG #1: previously runCode set exitCodes default but built the runShell step
  // with only {command,args}, so the option was silently DROPPED — a code that
  // exits 1 with exitCodes:[1] FAILed. Now it must PASS.
  it("honors a forwarded exitCodes:[1] (bug #1 fix) -> PASS", async () => {
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "process.exit(1);",
          exitCodes: [1],
        },
      },
    });
    assert.equal(result.status, "PASS", `Expected PASS but got: ${result.description}`);
    const exit = findAssertion(result.assertions, "exitCode");
    assert.ok(exit);
    assert.equal(exit.result, "PASS");
    assert.deepEqual(exit.expected, [1]);
    assert.equal(exit.actual, 1);
  });

  it("FAILs when exit code is not in exitCodes, propagating the FAIL assertion", async () => {
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "process.exit(2);",
          exitCodes: [0],
        },
      },
    });
    assert.equal(result.status, "FAIL");
    const exit = findAssertion(result.assertions, "exitCode");
    assert.ok(exit);
    assert.equal(exit.result, "FAIL");
    assert.equal(exit.actual, 2);
  });

  it("forwards stdio: emits a propagated stdio assertion", async () => {
    const result = await runCode({
      config,
      step: {
        runCode: {
          language: "javascript",
          code: "console.log('needle-xyz');",
          stdio: "needle-xyz",
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    const stdio = findAssertion(result.assertions, "stdio");
    assert.ok(stdio, "expected a forwarded stdio assertion");
    assert.equal(stdio.result, "PASS");
  });

  it("returns FAIL with no assertions on an invalid step (input guard)", async () => {
    const result = await runCode({
      config,
      step: { runCode: { language: "javascript" } }, // missing required `code`
    });
    assert.equal(result.status, "FAIL");
    assert.ok(
      result.assertions === undefined || result.assertions.length === 0,
      "input-guard failures must not produce assertion records"
    );
  });
});
