import assert from "node:assert/strict";
import { rollUpAssertions } from "../dist/core/utils.js";

// rollUpAssertions: unlike rollUpResults, an empty/falsy assertion set rolls up
// to PASS (zero applicable assertions + successful execution = PASS). Used by
// actions whose `assertions` array may legitimately be empty. The element
// interaction-assertion tests (click/type/dragAndDrop) return here once those
// actions are converted to the unified model.

describe("rollUpAssertions", function () {
  it("empty array -> PASS", () => {
    assert.equal(rollUpAssertions([]), "PASS");
  });
  it("falsy -> PASS", () => {
    assert.equal(rollUpAssertions(undefined), "PASS");
    assert.equal(rollUpAssertions(null), "PASS");
  });
  it("[PASS] -> PASS", () => {
    assert.equal(rollUpAssertions([{ result: "PASS" }]), "PASS");
  });
  it("[FAIL] -> FAIL", () => {
    assert.equal(rollUpAssertions([{ result: "FAIL" }]), "FAIL");
  });
  it("[PASS, SKIPPED] -> PASS", () => {
    assert.equal(
      rollUpAssertions([{ result: "PASS" }, { result: "SKIPPED" }]),
      "PASS"
    );
  });
  it("[WARNING] -> WARNING", () => {
    assert.equal(rollUpAssertions([{ result: "WARNING" }]), "WARNING");
  });
});
