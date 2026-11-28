const assert = require("node:assert");
const { Then } = require("@cucumber/cucumber");
const { runTests } = require("doc-detective");

// Doc tests can take minutes. Cucumber's default step timeout is 5 seconds.
Then("the docs in {string} pass", { timeout: 10 * 60 * 1000 }, async function (path) {
  const results = await runTests({ input: path });
  const { specs } = results.summary;
  assert.ok(specs.pass + specs.fail + specs.warning + specs.skipped > 0, `Couldn't find any doc tests in ${path}.`);
  assert.strictEqual(specs.fail, 0, `Couldn't pass ${specs.fail} doc specs in ${path}.`);
});
