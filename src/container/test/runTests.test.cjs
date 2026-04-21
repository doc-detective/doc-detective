const path = require("path");
const assert = require("assert").strict;
const fs = require("fs");
const { networkInterfaces } = require("os");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(artifactPath, "results.json");
const { spawn, execFileSync } = require("child_process");

// Figure out which Docker engine we're talking to so we can give the
// container a working `host.docker.internal`:
//   - Docker Desktop (Win/Mac): auto-wires the name, don't override.
//   - Linux Docker Engine:      use `host-gateway` (the blessed path).
//   - Native Windows Engine:    `host-gateway` isn't reliable (not how
//                               GH's windows-2022 runner's engine
//                               handles it), so fall back to an
//                               explicit host IP.
function detectDockerEngine() {
  // Docker Desktop (Win/Mac) uses context names prefixed `desktop-`
  // (e.g. `desktop-windows`, `desktop-linux`). Both native Windows
  // Engine and Linux Docker Engine use different context names
  // (typically `default`).
  let context = "";
  try {
    context = execFileSync("docker", ["context", "show"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    context = "";
  }
  if (/^desktop-/i.test(context)) return "docker-desktop";

  // Not Docker Desktop. Ask the engine which container OS it's running;
  // the same Linux runner could conceivably run Windows containers, but
  // in practice each runner is one or the other.
  let osType = "";
  try {
    osType = execFileSync("docker", ["info", "--format", "{{.OSType}}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    osType = "";
  }
  if (/windows/i.test(osType)) return "windows-native";
  return "linux-native";
}

function resolveNatGatewayIP() {
  // Windows containers use the `nat` network by default; the Gateway in
  // that network's IPAM config is the IP of the host's NAT virtual
  // adapter — the only IP the container can route to reach the host.
  // The host's LAN IP won't work here because the NAT subnet has no
  // route to it.
  try {
    const out = execFileSync(
      "docker",
      ["network", "inspect", "nat", "--format", "{{range .IPAM.Config}}{{.Gateway}} {{end}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    const gw = out.split(/\s+/).filter(Boolean)[0];
    return gw || null;
  } catch {
    return null;
  }
}

function resolveHostIPv4() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses || []) {
      if (a && a.family === "IPv4" && !a.internal) {
        return a.address;
      }
    }
  }
  return null;
}

function buildHostNetworkArgs() {
  const engine = detectDockerEngine();
  if (engine === "docker-desktop") {
    // Docker Desktop already wires host.docker.internal for both Linux
    // and Windows container modes. Overriding with --add-host here can
    // steer the container at the wrong interface IP.
    return [];
  }
  if (engine === "linux-native") {
    // Docker Engine 20.10+ resolves `host-gateway` to the bridge's
    // host-side IP. This is the Docker-blessed way.
    return ["--add-host", "host.docker.internal:host-gateway"];
  }
  // Native Windows engine (e.g. GitHub Actions windows-2022 runner). The
  // container is on the `nat` network; use that network's gateway IP,
  // which is how the container routes to the host. `resolveHostIPv4()`
  // would pick the runner's LAN IP, which the NAT subnet can't reach.
  const gw = resolveNatGatewayIP();
  if (gw) return ["--add-host", `host.docker.internal:${gw}`];
  const ip = resolveHostIPv4();
  return ip ? ["--add-host", `host.docker.internal:${ip}`] : [];
}

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
      // container via `host.docker.internal`; see `buildHostNetworkArgs`
      // for per-engine handling.
      const hostNetworkArgs = buildHostNetworkArgs();
      if (hostNetworkArgs.length) {
        console.log(`Using docker args for host networking: ${hostNetworkArgs.join(" ")}`);
      }

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
