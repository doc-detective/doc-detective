const path = require("path");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(artifactPath, "results.json");
const { exec } = require("child_process");

// Parse command line arguments
const args = process.argv.slice(2);
const versionArg = args.find(arg => arg.startsWith('--version=') || arg.startsWith('-v='));
const version = versionArg ? versionArg.split('=')[1] : 'latest';

let os;
let internalPath;
if (process.platform === "win32") {
  os = "windows";
  internalPath = path.join("C:", "app");
} else {
  os = "linux";
  internalPath = path.join("/","app");
}

// Run tests in Docker container
describe("Run tests successfully", async function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    return new Promise((resolve, reject) => {
      let hasCompleted = false;
      
      const handleCompletion = (callback) => {
        if (hasCompleted) return;
        hasCompleted = true;
        callback();
      };
      
      const runTests = exec(
        `docker run --rm --memory=2g --cpus=2 -v "${artifactPath}:${internalPath}" docdetective/docdetective:${version}-${os} -c ./config.json -i . -o ./results.json`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for output
      );
      
      runTests.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });
      
      runTests.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });
      
      runTests.on("error", (error) => {
        console.error(`Error: ${error.message}`);
        handleCompletion(() => reject(error));
      });
      
      runTests.on("close", (code, signal) => {
        handleCompletion(() => {
          console.log(`Child process closed with code ${code} and signal ${signal}`);
          
          if (signal != null) {
            reject(new Error(`Docker process terminated by signal ${signal}`));
            return;
          }
          
          if (code !== null && code !== 0) {
            reject(new Error(`Docker process exited with code ${code}`));
            return;
          }
          
          try {
            const result = JSON.parse(
              fs.readFileSync(outputFile, { encoding: "utf8" })
            );
            console.log(JSON.stringify(result, null, 2));
            assert.equal(result.summary.specs.fail, 0);
            fs.unlinkSync(outputFile);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });
});
