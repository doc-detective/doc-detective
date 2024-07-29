const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname,"../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname,"./artifacts");

describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);

  const configFiles = [
    { name: "JSON", file: "config.json" },
    { name: "YAML", file: "config.yaml" }
  ];

  configFiles.forEach(({ name, file }) => {
    it(`All specs pass with ${name} config`, async () => {
      const configPath = path.join(artifactPath, file);
      
      // Ensure the config file exists
      if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
      }

      const runTests = await spawnCommand(
        `node ./src/index.js runTests -c ${configPath} -i ${artifactPath} -o ${artifactPath}`
      );

      console.log(runTests.stdout);
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
});
