const path = require("path");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(artifactPath, "results.json");
const { spawn } = require("child_process");

const version = process.env.VERSION || 'latest';

let os;
let internalPath;
if (process.platform === "win32") {
  os = "windows";
  internalPath = "C:\\app";
} else {
  os = "linux";
  internalPath = path.join("/","app");
}

// Run tests in Docker container
describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    // Remove any stale results files from a previous failed run.
    // Doc Detective writes `results.json`, falling back to `results-N.json`
    // when the target file already exists — so a leftover `results.json`
    // from an earlier failure makes the next run write to `results-1.json`
    // and this harness would then read outdated counts from `results.json`.
    for (const f of fs.readdirSync(artifactPath)) {
      if (/^results(-\d+)?\.json$/.test(f)) {
        fs.unlinkSync(path.join(artifactPath, f));
      }
    }

    return new Promise((resolve, reject) => {
      let hasCompleted = false;

      const handleCompletion = (callback) => {
        if (hasCompleted) return;
        hasCompleted = true;
        callback();
      };

      // Spec fixtures reference the local test server on the host
      // (test/server/, port 8092 — started by test/hooks.js as a Mocha
      // root hook, shared with the main test suite). Reach it from the
      // container via `host.docker.internal`. Docker Desktop on
      // Windows/Mac wires that DNS name automatically; Linux engines
      // need `--add-host host.docker.internal:host-gateway`.
      const hostNetworkArgs =
        os === "linux"
          ? ["--add-host", "host.docker.internal:host-gateway"]
          : [];

      // Resource limits are generous enough to cover many serial Chrome
      // sessions (each spec + each `contexts:` block starts a fresh
      // chromedriver); under tighter caps a late spec intermittently
      // loses a webdriver handshake (`UND_ERR_HEADERS_TIMEOUT`,
      // `ECONNREFUSED 127.0.0.1:9515`). These limits are what the test
      // harness needs locally and in CI; they don't model what the
      // published image needs to run customer tests.
      const runTests = spawn(
        "docker",
        [
          "run", "--rm", "--memory=4g", "--cpus=4",
          ...hostNetworkArgs,
          "-v", `${artifactPath}:${internalPath}`,
          `docdetective/docdetective:${version}-${os}`,
          "-c", "./config.json", "-i", ".", "-o", "./results.json",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
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
