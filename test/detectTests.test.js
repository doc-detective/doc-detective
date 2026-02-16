import assert from "node:assert/strict";
import { setConfig } from "../dist/core/config.js";
import { detectTests } from "../dist/core/detectTests.js";
import path from "node:path";

describe("detectTests", function () {
  this.timeout(60000);

  it("detects spec files in a directory", async function () {
    const config = await setConfig({
      config: {
        input: path.resolve("./test/core-artifacts"),
        recursive: false,
        logLevel: "silent",
        telemetry: { send: false }
      }
    });
    const specs = await detectTests({ config });
    assert.ok(Array.isArray(specs));
    assert.ok(specs.length > 0, "Should find at least one spec file");
  });

  it("returns empty array for directory with no spec files", async function () {
    const config = await setConfig({
      config: {
        input: path.resolve("./test/core-artifacts/fixtures"),
        recursive: false,
        logLevel: "silent",
        telemetry: { send: false }
      }
    });
    const specs = await detectTests({ config });
    assert.ok(Array.isArray(specs));
    assert.equal(specs.length, 0, "Fixtures directory should have no valid specs");
  });

  it("detects a specific spec file by path", async function () {
    const config = await setConfig({
      config: {
        input: path.resolve("./test/core-artifacts/checkLink.spec.json"),
        logLevel: "silent",
        telemetry: { send: false }
      }
    });
    const specs = await detectTests({ config });
    assert.ok(Array.isArray(specs));
    assert.ok(specs.length > 0, "Should detect the checkLink spec");
  });
});
