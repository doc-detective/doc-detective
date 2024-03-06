const { spawnCommand } = require("../src/utils");
const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const artifactPath = path.resolve("./test/artifacts");

describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    const runTests = await spawnCommand(
      `npm run runTests -- -c ${artifactPath}/config.json -i ${artifactPath}/test.spec.json -o ${artifactPath}`
    );
    // Find output file
    const outputFiles = runTests.stdout.split("See results at ");
    const outputFile = outputFiles[outputFiles.length - 1].trim();
    const result = JSON.parse(
      fs.readFileSync(outputFile, { encoding: "utf8" })
    );
    assert.equal(result.summary.specs.pass, 2);
  });
});
