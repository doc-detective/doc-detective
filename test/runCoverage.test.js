const { spawnCommand } = require("../src/utils");
const assert = require("assert").strict;
const path = require("path");
const artifactPath = path.resolve("./test/artifacts");

describe("Perform coverage analysis successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("Should have 6 covered and 0 uncovered", async () => {
    const coverateResults = await spawnCommand(`npx doc-detective runCoverage -c ${artifactPath}/config.json -i ${artifactPath}/doc-content.md -o ${artifactPath}`);
    // Find output file
    const outputFiles = coverateResults.stdout.split("See results at ");
    const outputFile = outputFiles[outputFiles.length - 1].trim();
    const result = require(outputFile);
    assert.equal(result.summary.covered, 6);
    assert.equal(result.summary.uncovered, 0);
  });
});
