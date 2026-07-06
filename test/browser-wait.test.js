// Page-readiness probes (network idle / DOM stable) must survive the monitor
// global vanishing between injection and poll — on Safari (incl. the phase A5
// XCUITest web context) a navigation or redirect completing mid-wait replaces
// the window, wiping the injected monitor; the poll callback then used to
// throw ("undefined is not an object (evaluating 'monitor.lastRequestTime')")
// and fail the whole goTo. The probes now treat a missing monitor as "page
// changed under us": re-inject and keep polling. Hermetic — the mock driver
// scripts each execute() result instead of running the browser closures.

import assert from "node:assert/strict";
import {
  waitForNetworkIdle,
  waitForDOMStable,
} from "../dist/core/tests/browserWait.js";

// driver.execute mock returning scripted values in call order.
function makeDriver(results) {
  let calls = 0;
  return {
    execute: async () => {
      const value = results[Math.min(calls, results.length - 1)];
      calls++;
      return value;
    },
    get calls() {
      return calls;
    },
  };
}

describe("browserWait self-healing monitors", function () {
  this.timeout(10000);

  it("waitForNetworkIdle re-injects when the monitor global vanished and still resolves", async () => {
    const driver = makeDriver([
      undefined, // initial inject
      null, // fast-path check: monitor gone (navigation replaced the window)
      undefined, // re-inject
      { idleFor: 600, requestCount: 0 }, // poll: idle
      undefined, // cleanup
    ]);
    await waitForNetworkIdle(driver, 500, 5000);
    assert.ok(driver.calls >= 4, "expected re-injection + poll after the miss");
  });

  it("waitForNetworkIdle still times out when the monitor never reports idle", async () => {
    const driver = makeDriver([
      undefined, // inject
      { idleFor: 0, requestCount: 1 }, // fast-path: busy
      { idleFor: 0, requestCount: 2 }, // polls: busy forever
    ]);
    await assert.rejects(
      () => waitForNetworkIdle(driver, 500, 700),
      /Network idle timeout/
    );
  });

  it("waitForDOMStable re-injects when the monitor global vanished and still resolves", async () => {
    const driver = makeDriver([
      undefined, // initial inject
      null, // fast-path check: monitor gone
      undefined, // re-inject
      { idleFor: 1200, elapsedTotal: 1300, mutationCount: 0 }, // poll: stable
      undefined, // cleanup
    ]);
    await waitForDOMStable(driver, 1000, 5000);
    assert.ok(driver.calls >= 4, "expected re-injection + poll after the miss");
  });
});
