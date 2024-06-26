const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname,"../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname,"./artifacts");

describe("Run tests sucessfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    const runTests = await spawnCommand(
      `npx doc-detective runTests -c ${artifactPath}/config.json -i ${artifactPath} -o ${artifactPath}`
    );
    // Find output file
    console.log(runTests.stdout)
    const outputFiles = runTests.stdout.split("See results at ");
    const outputFile = outputFiles[outputFiles.length - 1].trim();
    console.log(outputFile);
    console.log(fs.existsSync(outputFile));
    // If output file is not found, throw an error
    if (!outputFile) {
      throw new Error(`Output file not found.\nOutput file: ${outputFile}\nCWD: ${process.cwd()}\nstdout: ${runTests.stdout}`);
    }
    const result = JSON.parse(
      fs.readFileSync(outputFile, { encoding: "utf8" })
    );
    assert.equal(result.summary.specs.fail, 0);
  });
});
