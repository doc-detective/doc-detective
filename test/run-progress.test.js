// The per-context progress line on stderr names the platform and browser.
import assert from "node:assert/strict";
import { noteContextDone, runProgress } from "../dist/core/progress.js";

describe("run progress events", function () {
  it("names the browser, not the browser object", function () {
    let seen;
    const listener = (event) => (seen = event);
    runProgress.on("context", listener);
    try {
      noteContextDone("a.spec.json", "t1", {
        result: "PASS",
        platform: "linux",
        browser: { name: "chrome", headless: true },
      });
    } finally {
      runProgress.off("context", listener);
    }
    assert.equal(seen.browser, "chrome");
    assert.equal(seen.platform, "linux");
  });

  it("leaves the browser out of a context without one", function () {
    let seen;
    const listener = (event) => (seen = event);
    runProgress.on("context", listener);
    try {
      noteContextDone("a.spec.json", "t1", { result: "PASS", platform: "linux" });
    } finally {
      runProgress.off("context", listener);
    }
    assert.equal(seen.browser, undefined);
  });
});
