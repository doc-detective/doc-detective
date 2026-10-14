// ADR 01135: the browser Appium pool prefetches sharp while Appium boots, but
// only for runs that will take a screenshot. jobTakesScreenshot is that gate.
import assert from "node:assert/strict";
import { jobTakesScreenshot } from "../dist/core/tests.js";

describe("jobTakesScreenshot (sharp prefetch gate)", function () {
  it("is true when the job's context has a screenshot step", function () {
    assert.equal(
      jobTakesScreenshot({ context: { steps: [{ goTo: "x" }, { screenshot: true }] } }),
      true
    );
    assert.equal(
      jobTakesScreenshot({ context: { steps: [{ screenshot: { path: "a.png" } }] } }),
      true
    );
  });

  it("is false for jobs without a screenshot step or with malformed steps", function () {
    assert.equal(jobTakesScreenshot({ context: { steps: [{ goTo: "x" }, { find: "y" }] } }), false);
    assert.equal(jobTakesScreenshot({ context: { steps: [null, "x"] } }), false);
    assert.equal(jobTakesScreenshot({ context: {} }), false);
    assert.equal(jobTakesScreenshot(undefined), false);
  });
});
