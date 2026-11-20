#!/usr/bin/env node
// Run on a Mac by the first-use fixture leg (ADR 01214): prove that an
// interrupt stops a WebDriverAgent build. Starts a doc-detective command that
// builds WebDriverAgent, signals it once `xcodebuild` is running, and fails
// unless the CLI exits with the signal's code, every process in xcodebuild's
// group is gone, the build lock is released, and no `products.json` marks the
// half-built directory as complete.
//
//   node scripts/check-wda-build-interrupt.cjs SIGINT install ios --yes

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [signal, ...cliArgs] = process.argv.slice(2);
const EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };
if (!(signal in EXIT_CODES) || cliArgs.length === 0) {
  console.error("Usage: check-wda-build-interrupt.cjs <SIGINT|SIGTERM> <doc-detective arguments...>");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (command, args) =>
  (spawnSync(command, args, { encoding: "utf8" }).stdout || "").split("\n").filter(Boolean);
// xcodebuild leads its own process group, so its pid is the group's id.
const inGroup = (pgid) => lines("pgrep", ["-g", pgid]);

(async () => {
  const cli = spawn(process.execPath, [path.join(__dirname, "..", "bin", "doc-detective.js"), ...cliArgs], {
    stdio: "inherit",
  });
  const exited = new Promise((resolve) => cli.on("exit", (code, killedBy) => resolve(code ?? killedBy)));

  let build;
  for (let waited = 0; !build && waited < 600 && cli.exitCode === null && cli.signalCode === null; waited++) {
    await sleep(1000);
    [build] = lines("pgrep", ["-f", "xcodebuild build-for-testing .*WebDriverAgent"]);
  }
  if (!build) {
    cli.kill("SIGKILL");
    throw new Error("no WebDriverAgent build started, so there was nothing to interrupt");
  }
  const command = lines("ps", ["-o", "command=", "-p", build]).join(" ");
  const derivedData = /-derivedDataPath (\S+)/.exec(command)?.[1];
  if (!derivedData) throw new Error(`couldn't read the build directory from: ${command}`);
  const keyDir = path.dirname(derivedData);

  // Let the build start its own children, so the group has more than a leader.
  await sleep(5000);
  console.log(`[interrupt check] sending ${signal}; xcodebuild's group holds pids ${inGroup(build).join(", ")}`);
  cli.kill(signal);
  const status = await exited;

  const failures = [];
  if (status !== EXIT_CODES[signal]) {
    failures.push(`the CLI ended with ${status}, not exit code ${EXIT_CODES[signal]}`);
  }
  // Killed processes can take a moment to be reaped. A build that was left
  // running stays for minutes.
  let left = inGroup(build);
  for (let waited = 0; left.length > 0 && waited < 5; waited++) {
    await sleep(1000);
    left = inGroup(build);
  }
  if (left.length > 0) {
    failures.push(`xcodebuild's process group outlived the CLI: pids ${left.join(", ")}`);
    spawnSync("pkill", ["-KILL", "-g", build]);
  }
  if (fs.existsSync(path.join(path.dirname(keyDir), ".lock"))) {
    failures.push("the build lock wasn't released");
  }
  if (fs.existsSync(path.join(keyDir, "products.json"))) {
    failures.push("the half-built directory has a products.json marker");
  }

  if (failures.length > 0) throw new Error(failures.join("; "));
  console.log(`[interrupt check] PASS: ${signal} stopped the build under ${keyDir}`);
})().catch((error) => {
  console.error(`[interrupt check] FAIL: ${error.message}`);
  process.exit(1);
});
