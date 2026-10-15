import assert from "node:assert/strict";
import { driverStart } from "../dist/core/tests.js";

// A session start that aborts at its startup ceiling is retried silently,
// which for an iOS WebDriverAgent launch that hangs looks like an
// unexplained 15-minute stall. The retry must say so.
describe("driverStart: retried session starts are reported", function () {
  const iosCaps = {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:wdaLaunchTimeout": 900000,
  };

  it("reports each failed attempt it retries, with the reason", async function () {
    const messages = [];
    let calls = 0;
    const driver = await driverStart(iosCaps, 4723, 2, {
      log: (m) => messages.push(m),
      remote: async () => {
        calls++;
        if (calls === 1) throw new Error("Request aborted due to timeout\nstack...");
        return {};
      },
    });
    assert.ok(driver);
    assert.equal(calls, 2);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /attempt 1 of 2/);
    assert.match(messages[0], /aborted due to timeout/);
    assert.doesNotMatch(messages[0], /stack/);
  });

  it("stays quiet when the first attempt succeeds", async function () {
    const messages = [];
    await driverStart(iosCaps, 4723, 2, {
      log: (m) => messages.push(m),
      remote: async () => ({}),
    });
    assert.deepEqual(messages, []);
  });
});
