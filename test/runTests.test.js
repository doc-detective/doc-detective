const path = require("path");
const { spawnCommand } = require(path.resolve(__dirname, "../src/utils"));
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/testResults.json`);

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

      await spawnCommand(
        `node ./src/index.js runTests -c ${artifactPath}/config.json -i ${artifactPath} -o ${outputFile}`
      );
      const result = require(outputFile);
      fs.unlinkSync(outputFile);
      assert.equal(result.summary.specs.fail, 0);
    });
  });
});
