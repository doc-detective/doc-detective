#!/usr/bin/env node
// Run on a Mac by the first-use fixture leg (ADR 01214): prove that an
// interrupt stops a WebDriverAgent build. Starts a doc-detective command that
// builds WebDriverAgent, signals it once `xcodebuild` is running, and fails
// unless the CLI exits with the signal's code, every process of the build is
// gone, the build lock is released, and no `products.json` marks the
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
    // An auto-update would hand the work to a child process, and the build
    // would then not be this process's child.
    env: { ...process.env, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" },
  });
  const exited = new Promise((resolve) => cli.on("exit", (code, killedBy) => resolve(code ?? killedBy)));

  // Only a build this CLI started: the host may be running others, and the
  // checks below read this build's directory and can kill its processes.
  let build;
  for (let waited = 0; !build && waited < 600 && cli.exitCode === null && cli.signalCode === null; waited++) {
    await sleep(1000);
    [build] = lines("pgrep", ["-P", String(cli.pid), "-f", "xcodebuild build-for-testing .*WebDriverAgent"]);
  }
  if (!build) {
    cli.kill("SIGKILL");
    throw new Error("no WebDriverAgent build started, so there was nothing to interrupt");
  }
  const command = lines("ps", ["-o", "command=", "-p", build]).join(" ");
  const derivedData = /-derivedDataPath (\S+)/.exec(command)?.[1];
  if (!derivedData) throw new Error(`couldn't read the build directory from: ${command}`);
  const keyDir = path.dirname(derivedData);

  // The build's processes: xcodebuild's group, plus anything else whose
  // command line names the build directory, such as a compiler that the build
  // service started outside that group.
  const buildProcesses = () => [
    ...new Set([...inGroup(build), ...lines("pgrep", ["-f", keyDir])]),
  ];

  // Let the build get going, so there's more to stop than xcodebuild itself.
  await sleep(5000);
  console.log(`[interrupt check] sending ${signal}; the build runs as pids ${buildProcesses().join(", ")}`);
  const signaled = Date.now();
  const since = () => `${((Date.now() - signaled) / 1000).toFixed(1)} s`;
  cli.kill(signal);
  // A CLI that is slow to exit: print what its threads are doing.
  const slow = setTimeout(() => {
    const report = path.join(require("node:os").tmpdir(), `dd-cli-${cli.pid}.sample.txt`);
    for (const command of [["sample"], ["sudo", "-n", "sample"]]) {
      spawnSync(command[0], [...command.slice(1), String(cli.pid), "2", "-mayDie", "-file", report]);
      if (fs.existsSync(report)) break;
    }
    const text = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "(sample wrote no report)";
    console.log(`[interrupt check] the CLI is still running ${since()} after the signal:
${text.slice(0, 20000)}`);
  }, 3000);
  const status = await exited;
  clearTimeout(slow);
  const exitedAfterMs = Date.now() - signaled;
  console.log(`[interrupt check] the CLI ended with ${status}, ${since()} after the signal`);

  const failures = [];
  if (status !== EXIT_CODES[signal]) {
    failures.push(`the CLI ended with ${status}, not exit code ${EXIT_CODES[signal]}`);
  }
  // The interrupt handler gives its cleanup 5 seconds.
  if (exitedAfterMs > 10_000) failures.push(`the CLI took ${since()} to exit`);
  // Killed processes can take a moment to be reaped. A build that was left
  // running stays for minutes.
  const named = (pids) => pids.map((pid) => `${pid} (${lines("ps", ["-o", "comm=", "-p", pid]).join("")})`);
  let left = buildProcesses();
  for (let waited = 0; left.length > 0 && waited < 5; waited++) {
    console.log(`[interrupt check] ${since()} after the signal, still running: ${named(left).join(", ")}`);
    await sleep(1000);
    left = buildProcesses();
  }
  console.log(`[interrupt check] ${since()} after the signal, the build's processes were checked`);
  if (left.length > 0) {
    failures.push(`the build outlived the CLI: ${named(left).join(", ")}`);
    spawnSync("pkill", ["-KILL", "-g", build]);
    spawnSync("pkill", ["-KILL", "-f", keyDir]);
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
