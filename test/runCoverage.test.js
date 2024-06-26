const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname,"../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname,"./artifacts");

describe("Perform coverage analysis successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("Should have 6 covered and 0 uncovered", async () => {
    const coverateResults = await spawnCommand(`node ./src/index.js runCoverage -c ${artifactPath}/config.json -i ${artifactPath}/doc-content.md -o ${artifactPath}`);
    // Find output file
    // console.log(coverateResults.stdout)
    const outputFiles = coverateResults.stdout.split("See results at ");
    const outputFile = outputFiles[outputFiles.length - 1].trim();
    // If output file is not found, throw an error 
    if (!outputFile) {
      throw new Error(`Output file not found.\nOutput file: ${outputFile}\nCWD: ${process.cwd()}\nstdout: ${coverateResults.stdout}`);
    }
    const result = require(outputFile);
    assert.equal(result.summary.covered, 6);
    assert.equal(result.summary.uncovered, 0);
  });
});
