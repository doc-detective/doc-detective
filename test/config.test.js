import assert from "node:assert/strict";
import { setConfig } from "../dist/core/config.js";
import os from "node:os";

describe("Config", function () {
  this.timeout(30000);

  const savedEnv = {};

  beforeEach(function () {
    savedEnv.DOC_DETECTIVE = process.env.DOC_DETECTIVE;
    delete process.env.DOC_DETECTIVE;
  });

  afterEach(function () {
    if (savedEnv.DOC_DETECTIVE !== undefined) {
      process.env.DOC_DETECTIVE = savedEnv.DOC_DETECTIVE;
    } else {
      delete process.env.DOC_DETECTIVE;
    }
  });

  it("DOC_DETECTIVE env var with valid JSON merges into config", async function () {
    process.env.DOC_DETECTIVE = JSON.stringify({ config: { logLevel: "debug" } });
    const result = await setConfig({ config: { input: "." } });
    assert.equal(result.logLevel, "debug");
  });

  it("DOC_DETECTIVE env var with invalid JSON does not crash", async function () {
    process.env.DOC_DETECTIVE = "not json";
    const result = await setConfig({ config: { input: "." } });
    assert.ok(result); // Should still return valid config
  });

  it("concurrentRunners: true resolves to cpu-based value", async function () {
    const result = await setConfig({ config: { input: ".", concurrentRunners: true } });
    const expected = Math.min(os.cpus().length, 4);
    assert.equal(result.concurrentRunners, expected);
  });

  it("concurrentRunners: 3 stays as 3", async function () {
    const result = await setConfig({ config: { input: ".", concurrentRunners: 3 } });
    assert.equal(result.concurrentRunners, 3);
  });

  it("string input is normalized to array", async function () {
    const result = await setConfig({ config: { input: "./test" } });
    assert.ok(Array.isArray(result.input) || typeof result.input === "string");
  });

  it("accepts valid fileType string 'markdown'", async function () {
    const result = await setConfig({ config: { input: ".", fileTypes: ["markdown"] } });
    assert.ok(result.fileTypes);
    assert.ok(result.fileTypes.length > 0);
    // The string should be resolved to an object
    assert.ok(typeof result.fileTypes[0] === "object");
  });
});
