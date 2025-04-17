const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname, "../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/testResults.json`);

describe("Run tests sucessfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    await spawnCommand(
      `node ./src/index.js -c ${artifactPath}/config.json -i ${artifactPath} -o ${outputFile}`
    );
    // Wait until the file is written
    while (!fs.existsSync(outputFile)) {}
    const result = require(outputFile);
    console.log(JSON.stringify(result, null, 2));
    fs.unlinkSync(outputFile);
    assert.equal(result.summary.specs.fail, 0);
  });
});
