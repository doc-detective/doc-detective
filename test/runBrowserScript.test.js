import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBrowserScript } from "../dist/core/tests/runBrowserScript.js";

const config = { logLevel: "silent" };

// Helper: find the implicit assertion whose statement CONTAINS `needle`.
function findAssertion(assertions, needle) {
  return (assertions || []).find((a) => a.statement.includes(needle));
}

// Mock driver whose execute() returns the given value.
function makeDriver(returnValue) {
  return { execute: async () => returnValue };
}

describe("runBrowserScript unified assertion model", function () {
  this.timeout(15000);

  it("output match → outputMatches==true, assertion PASS, status PASS", async () => {
    const result = await runBrowserScript({
      config,
      driver: makeDriver("hello world"),
      step: { runBrowserScript: { script: "return 'hello world'", output: "hello" } },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.outputMatches, true);
    const om = findAssertion(result.assertions, "outputMatches");
    assert.ok(om, "expected an outputMatches assertion");
    assert.equal(om.source, "implicit");
    assert.equal(om.result, "PASS");
    assert.equal(om.statement, "$$outputs.outputMatches == true");
    assert.equal(result.outputs.result, "hello world");
  });

  it("output mismatch → outputMatches==false, assertion FAIL, status FAIL", async () => {
    const result = await runBrowserScript({
      config,
      driver: makeDriver("hello world"),
      step: { runBrowserScript: { script: "return 'hello world'", output: "goodbye" } },
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.outputs.outputMatches, false);
    const om = findAssertion(result.assertions, "outputMatches");
    assert.ok(om);
    assert.equal(om.result, "FAIL");
  });

  it("no driver → execution error FAIL with NO assertion records", async () => {
    const result = await runBrowserScript({
      config,
      driver: undefined,
      step: { runBrowserScript: { script: "return 1", output: "1" } },
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.assertions, undefined);
  });

  it("output + path over-variation → variation assertion WARNING, status WARNING", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rbs-test-"));
    const filePath = path.join(dir, "snapshot.txt");
    // Seed an existing file very different from the new output so the
    // fractional difference exceeds maxVariation (0).
    fs.writeFileSync(filePath, "completely different prior content");
    try {
      const result = await runBrowserScript({
        config,
        driver: makeDriver("brand new output value"),
        step: {
          runBrowserScript: {
            script: "return 'brand new output value'",
            output: "brand new",
            path: filePath,
            maxVariation: 0,
            overwrite: "false",
          },
        },
      });
      // output match PASSes; variation exceeds → WARNING; roll-up WARNING.
      assert.equal(result.status, "WARNING");
      assert.ok(typeof result.outputs.variation === "number");
      assert.ok(result.outputs.variation > 0);
      const variation = findAssertion(result.assertions, "variation");
      assert.ok(variation, "expected a variation assertion");
      assert.equal(variation.result, "WARNING");
      assert.ok(
        variation.statement.startsWith("$$outputs.variation <="),
        "variation statement shape"
      );
      // output match still recorded as PASS
      assert.equal(findAssertion(result.assertions, "outputMatches").result, "PASS");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("neither output nor path → status PASS with empty assertions", async () => {
    const result = await runBrowserScript({
      config,
      driver: makeDriver(42),
      step: { runBrowserScript: { script: "return 42" } },
    });
    assert.equal(result.status, "PASS");
    assert.ok(Array.isArray(result.assertions));
    assert.equal(result.assertions.length, 0);
    assert.equal(result.outputs.result, 42);
  });
});
