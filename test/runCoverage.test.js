const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname, "../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/coverageResults.json`);

describe("Perform coverage analysis successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("Should have 6 covered and 0 uncovered", async () => {
    await spawnCommand(
      `node ./src/index.js runCoverage -c ${artifactPath}/config.json -i ${artifactPath}/doc-content.md -o ${outputFile}`
    );
    const result = require(outputFile);
    fs.unlinkSync(outputFile);
    assert.equal(result.summary.covered, 6);
    assert.equal(result.summary.uncovered, 0);
  });
});
