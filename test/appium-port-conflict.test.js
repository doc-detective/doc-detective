import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";

const artifactPath = path.resolve("./test/core-artifacts");
const config_base = JSON.parse(fs.readFileSync(`${artifactPath}/config.json`, "utf8"));
const driverSpec = path.join(artifactPath, "navigation", "wait-with-driver.spec.json");

function makeConfig() {
  const config = JSON.parse(JSON.stringify(config_base));
  config.input = driverSpec;
  return config;
}

// Bind 127.0.0.1:4723 to satisfy the "port is held" precondition. If the
// port is already held externally (e.g. a developer's local Appium), the
// precondition is already satisfied and we return null so the after-hook
// knows there is nothing to close. Any other bind error propagates.
async function holdPort4723() {
  const blocker = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(4723, "127.0.0.1", resolve);
    });
    return blocker;
  } catch (err) {
    if (err && err.code === "EADDRINUSE") return null;
    throw err;
  }
}

async function releasePort(blocker) {
  if (blocker) await new Promise((r) => blocker.close(r));
}

describe("Dynamic Appium port", function () {
  // Appium boot ~10s + driver session ~5s; allow generous headroom.
  this.timeout(600000);

  describe("port 4723 is held by another process", function () {
    let blocker;
    before(async function () { blocker = await holdPort4723(); });
    after(async function () { await releasePort(blocker); });

    it("runTests still succeeds for a driver-required spec", async function () {
      const result = await runTests(makeConfig());
      assert.ok(result, "Expected non-null result");
      assert.equal(
        result.summary.specs.fail,
        0,
        `Expected 0 failed specs, got ${result.summary.specs.fail}`
      );
    });
  });

  describe("two parallel runTests with 4723 held by another process", function () {
    let blocker;
    before(async function () { blocker = await holdPort4723(); });
    after(async function () { await releasePort(blocker); });

    it("both succeed without port collision", async function () {
      const [a, b] = await Promise.all([
        runTests(makeConfig()),
        runTests(makeConfig()),
      ]);
      assert.ok(a && b, "Expected both results to be non-null");
      assert.equal(a.summary.specs.fail, 0, "First run had failed specs");
      assert.equal(b.summary.specs.fail, 0, "Second run had failed specs");
    });
  });
});
