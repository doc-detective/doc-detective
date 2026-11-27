const assert = require("node:assert");
const { BeforeAll, Then } = require("@cucumber/cucumber");
const { runTests } = require("doc-detective");

let sweep;

// Test every doc once per Cucumber run, before the first scenario.
BeforeAll({ timeout: 10 * 60 * 1000 }, async function () {
  sweep = await runTests({ input: "docs" });
});

Then("every doc passed", function () {
  const failed = sweep.specs.filter((spec) => spec.result === "FAIL").map((spec) => spec.specId);
  assert.deepStrictEqual(failed, [], "Couldn't pass every doc spec.");
});
