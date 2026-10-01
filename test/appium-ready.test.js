// Unit tests for appiumIsReady (src/core/tests.ts, compiled dist/core/tests.js).
//
// Phase 1.2: the readiness loop must probe /status IMMEDIATELY and then poll on
// a short 250ms interval, instead of sleeping a fixed ~1s BEFORE its first
// probe. Hermetic: the network probe and the sleep are injected, so no real
// Appium server or timer delay is involved.
import assert from "node:assert/strict";
import { appiumIsReady } from "../dist/core/tests.js";

describe("appiumIsReady (immediate probe + 250ms poll)", function () {
  it("probes immediately and returns without ever sleeping when already up", async function () {
    const sleeps = [];
    let probes = 0;
    const ready = await appiumIsReady(4723, 120000, {
      probe: async () => {
        probes += 1;
        return true; // up on the very first probe
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(ready, true);
    assert.equal(probes, 1, "should probe exactly once when immediately ready");
    assert.deepEqual(sleeps, [], "must NOT sleep before the first successful probe");
  });

  it("polls on a 250ms interval until ready", async function () {
    const sleeps = [];
    let probes = 0;
    const ready = await appiumIsReady(4723, 120000, {
      probe: async () => {
        probes += 1;
        return probes >= 3; // fails twice, then succeeds
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(ready, true);
    assert.equal(probes, 3);
    // Two failed probes → two 250ms sleeps between them; none after success.
    assert.deepEqual(sleeps, [250, 250]);
  });

  it("throws after the overall timeout, having probed at least once", async function () {
    let probes = 0;
    await assert.rejects(
      appiumIsReady(4723, -1, {
        // timeoutMs = -1 → the elapsed check trips after the first failed probe,
        // proving the probe runs BEFORE the timeout is enforced.
        probe: async () => {
          probes += 1;
          return false;
        },
        sleep: async () => {},
      }),
      /failed to start within/
    );
    assert.equal(probes, 1, "must probe before giving up on timeout");
  });
});
