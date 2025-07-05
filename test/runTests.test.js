const { createServer } = require("./server");
const path = require("path");
const { spawnCommand } = require("../src/utils");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/testResults.json`);

// Create a server with custom options
const server = createServer({
  port: 8092,
  staticDir: './test/server/public',
  modifyResponse: (req, body) => {
    // Optional modification of responses
    return { ...body, extraField: 'added by server' };
  }
});

// Start the server before tests
before(async () => {
  try {
    await server.start();
  } catch (error) {
    console.error(`Failed to start test server: ${error.message}`);
    throw error;
  }
});

// Stop the server after tests
after(async () => {
  try {
    await server.stop();
  } catch (error) {
    console.error(`Failed to stop test server: ${error.message}`);
    // Don't rethrow here to avoid masking test failures
  }
});

describe("Run tests successfully", function () {
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
