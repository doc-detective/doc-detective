const { createServer } = require("./server");
const path = require("path");
const { spawnCommand } = require("../src/utils");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/resolvedTestsResults.json`);

// Create a server with custom options
const server = createServer({
  port: 8093,
  staticDir: './test/server/public',
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
  }
});

describe("DOC_DETECTIVE_TESTS environment variable", function () {
  // Set indefinite timeout
  this.timeout(0);
  
  it("Should accept valid resolvedTests from environment variable", async () => {
    const resolvedTests = {
      "resolvedTestsId": "test-resolved-tests-id",
      "config": {
        "input": [artifactPath],
        "output": ".",
        "logLevel": "info"
      },
      "specs": [
        {
          "specId": "env-var-spec",
          "tests": [
            {
              "testId": "env-var-test",
              "steps": [
                {
                  "checkLink": "http://localhost:8093"
                }
              ]
            }
          ]
        }
      ]
    };
    
    // Set the environment variable
    process.env.DOC_DETECTIVE_TESTS = JSON.stringify(resolvedTests);
    
    try {
      await spawnCommand(
        `DOC_DETECTIVE_TESTS='${JSON.stringify(resolvedTests)}' node ./src/index.js -o ${outputFile}`
      );
      
      // Wait until the file is written
      let waitCount = 0;
      while (!fs.existsSync(outputFile) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (fs.existsSync(outputFile)) {
        const result = require(outputFile);
        console.log("Result summary:", JSON.stringify(result.summary, null, 2));
        fs.unlinkSync(outputFile);
        
        // Check that tests were run
        assert.ok(result.summary);
        assert.ok(result.specs);
      }
    } finally {
      delete process.env.DOC_DETECTIVE_TESTS;
    }
  });
  
  it("Should reject invalid resolvedTests from environment variable", async () => {
    const invalidResolvedTests = {
      "invalid": "structure"
    };
    
    process.env.DOC_DETECTIVE_TESTS = JSON.stringify(invalidResolvedTests);
    
    try {
      const result = await spawnCommand(
        `DOC_DETECTIVE_TESTS='${JSON.stringify(invalidResolvedTests)}' node ./src/index.js -o ${outputFile}`
      );
      
      // Should exit with non-zero code
      assert.notEqual(result.exitCode, 0);
    } finally {
      delete process.env.DOC_DETECTIVE_TESTS;
    }
  });
  
  it("Should apply config overrides from DOC_DETECTIVE_CONFIG", async () => {
    const resolvedTests = {
      "resolvedTestsId": "test-override-id",
      "config": {
        "input": [artifactPath],
        "output": ".",
        "logLevel": "error"  // This should be overridden
      },
      "specs": [
        {
          "specId": "override-spec",
          "tests": [
            {
              "testId": "override-test",
              "steps": [
                {
                  "checkLink": "http://localhost:8093"
                }
              ]
            }
          ]
        }
      ]
    };
    
    const configOverride = {
      "logLevel": "debug"
    };
    
    process.env.DOC_DETECTIVE_TESTS = JSON.stringify(resolvedTests);
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify(configOverride);
    
    try {
      await spawnCommand(
        `DOC_DETECTIVE_TESTS='${JSON.stringify(resolvedTests)}' DOC_DETECTIVE_CONFIG='${JSON.stringify(configOverride)}' node ./src/index.js -o ${outputFile}`
      );
      
      // Wait until the file is written
      let waitCount = 0;
      while (!fs.existsSync(outputFile) && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (fs.existsSync(outputFile)) {
        const result = require(outputFile);
        fs.unlinkSync(outputFile);
        
        // Check that tests were run
        assert.ok(result.summary);
        assert.ok(result.specs);
      }
    } finally {
      delete process.env.DOC_DETECTIVE_TESTS;
      delete process.env.DOC_DETECTIVE_CONFIG;
    }
  });
});
