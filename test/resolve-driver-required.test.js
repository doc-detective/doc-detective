import assert from "node:assert/strict";
import { isDriverRequired } from "../dist/core/resolveTests.js";

describe("resolveTests/isDriverRequired", function () {
  it("requires a driver for a test whose only step is runBrowserScript", function () {
    const test = { steps: [{ runBrowserScript: "return document.title;" }] };
    assert.equal(isDriverRequired({ test }), true);
  });

  it("does not require a driver for a pure host/HTTP test", function () {
    const test = {
      steps: [{ runShell: "echo hi" }, { httpRequest: { url: "https://x.test" } }],
    };
    assert.equal(isDriverRequired({ test }), false);
  });

  it("still requires a driver for classic browser steps (regression)", function () {
    const test = { steps: [{ goTo: "https://x.test" }, { runShell: "echo hi" }] };
    assert.equal(isDriverRequired({ test }), true);
  });
});
