const path = require("path");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(artifactPath, "results.json");
const publicDir = path.resolve(__dirname, "../../../test/server/public");
const { spawn, execFileSync } = require("child_process");

const version = process.env.VERSION || "latest";

let os;
let internalPath;
let internalPublicDir;
if (process.platform === "win32") {
  os = "windows";
  internalPath = "C:\\app";
  internalPublicDir = "C:\\srv";
} else {
  os = "linux";
  internalPath = path.join("/", "app");
  internalPublicDir = path.join("/", "srv");
}

// Unique per-run names so parallel runs don't collide.
const runId = `${process.pid}-${Date.now()}`;
const networkName = `dd-test-net-${runId}`;
const serverContainerName = `dd-test-server-${runId}`;
// Stable name for containers on this network; fixtures reference it via $URL.
const serverDnsName = "dd-test-server";

function runDocker(args, opts = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
  });
}

function tryDocker(args) {
  try {
    return runDocker(args);
  } catch (e) {
    return null;
  }
}

// Spec fixtures reference a local test server (see test/server/public/).
// Rather than relying on host↔container networking — which is a moving
// target across Docker Desktop, Linux Docker Engine, and native Windows
// Engine on GH's windows-2022 runner — run the server as a sidecar
// container on a dedicated docker network. The test container joins the
// same network and reaches the sidecar by DNS name. Works identically on
// every docker engine and sidesteps NAT routing and Windows Firewall.
function startTestServerSidecar() {
  try {
    // Linux containers: default `bridge` driver. Windows containers: `nat`
    // (the `bridge` driver is Linux-only and `docker network create` fails
    // on a Windows engine without this flag).
    const driver = os === "windows" ? "nat" : "bridge";
    console.log(`Creating docker network ${networkName} (driver=${driver})…`);
    runDocker(["network", "create", "--driver", driver, networkName]);

    // Reuse the doc-detective image so we don't pay an extra image pull.
    // It has python3 installed; the built-in http.server is enough.
    const pythonCmd = os === "windows" ? "python" : "python3";
    console.log(
      `Starting test-server sidecar ${serverContainerName} on ${networkName}…`
    );
    runDocker([
      "run",
      "--rm",
      "--detach",
      "--name",
      serverContainerName,
      "--network",
      networkName,
      "--network-alias",
      serverDnsName,
      "-v",
      `${publicDir}:${internalPublicDir}`,
      "--entrypoint",
      pythonCmd,
      `docdetective/docdetective:${version}-${os}`,
      "-m",
      "http.server",
      "8092",
      "--directory",
      internalPublicDir,
    ]);
  } catch (e) {
    // If the container-run failed after the network was created, or
    // `docker network create` left a half-created entry behind, roll back
    // before rethrowing so Mocha's after hook isn't the only thing
    // standing between us and a leaked network/container.
    try { stopTestServerSidecar(); } catch (_) {}
    throw e;
  }
}

function stopTestServerSidecar() {
  tryDocker(["rm", "-f", serverContainerName]);
  tryDocker(["network", "rm", networkName]);
}

// Probe the sidecar from the sidecar itself — uses the Python interpreter
// already installed in the image, so no extra image pull or cross-container
// cold start per attempt.
function probeTestServerReady() {
  const pythonCmd = os === "windows" ? "python" : "python3";
  try {
    execFileSync(
      "docker",
      [
        "exec",
        serverContainerName,
        pythonCmd,
        "-c",
        "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8092/', timeout=1).status == 200 else 1)",
      ],
      { stdio: ["ignore", "ignore", "ignore"] }
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForTestServer(timeoutMs = 30_000, pollMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    if (probeTestServerReady()) {
      console.log(`Test server ready after ${attempts} probe(s).`);
      return;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `Test server did not become ready within ${timeoutMs}ms after ${attempts} probes.`
  );
}

// Run tests in Docker container
describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);

  before(async function () {
    startTestServerSidecar();
    await waitForTestServer();
  });
  after(stopTestServerSidecar);

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
          "run",
          "--rm",
          "--memory=4g",
          "--cpus=4",
          "--network",
          networkName,
          "-v",
          `${artifactPath}:${internalPath}`,
          `docdetective/docdetective:${version}-${os}`,
          "-c",
          "./config.json",
          "-i",
          ".",
          "-o",
          "./results.json",
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
