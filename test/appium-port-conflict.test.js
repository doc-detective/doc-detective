import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";

const artifactPath = path.resolve("./test/core-artifacts");
const config_base = JSON.parse(fs.readFileSync(`${artifactPath}/config.json`, "utf8"));
const driverSpec = path.join(artifactPath, "wait-with-driver.spec.json");

function makeConfig() {
  const config = JSON.parse(JSON.stringify(config_base));
  config.runTests.input = driverSpec;
  return config;
}

describe("Dynamic Appium port", function () {
  // Appium boot ~10s + driver session ~5s; allow generous headroom.
  this.timeout(600000);

  describe("port 4723 is held by another process", function () {
    let blocker;

    before(async function () {
      // If 4723 is already held (e.g. by a developer's Appium), the port-held
      // condition is satisfied externally — proceed without our own blocker.
      // Any error other than EADDRINUSE is a real bind failure and surfaces.
      blocker = net.createServer();
      try {
        await new Promise((resolve, reject) => {
          blocker.once("error", reject);
          blocker.listen(4723, "127.0.0.1", resolve);
        });
      } catch (err) {
        if (err && err.code === "EADDRINUSE") {
          blocker = null;
        } else {
          throw err;
        }
      }
    });

    after(async function () {
      if (blocker) await new Promise((r) => blocker.close(r));
    });

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

    before(async function () {
      // If 4723 is already held (e.g. by a developer's Appium), the port-held
      // condition is satisfied externally — proceed without our own blocker.
      // Any error other than EADDRINUSE is a real bind failure and surfaces.
      blocker = net.createServer();
      try {
        await new Promise((resolve, reject) => {
          blocker.once("error", reject);
          blocker.listen(4723, "127.0.0.1", resolve);
        });
      } catch (err) {
        if (err && err.code === "EADDRINUSE") {
          blocker = null;
        } else {
          throw err;
        }
      }
    });

    after(async function () {
      if (blocker) await new Promise((r) => blocker.close(r));
    });

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
