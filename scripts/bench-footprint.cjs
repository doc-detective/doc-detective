#!/usr/bin/env node
// Footprint benchmark: published package size + CLI/library startup time.
//
//   node scripts/bench-footprint.cjs [--runs N] [--no-build] [--out file.json]
//
// Rebuilds first (unless --no-build) so it never measures a stale dist/.
// Runs offline: telemetry and the npm self-update check are disabled, since a
// registry round-trip would swamp the startup signal. Each timing is one
// warmup plus N measured runs; median is the score, min/max show the noise.
// Exits non-zero if a guard fails (wrong --version output, trivial spec
// doesn't pass), so a "faster" build that broke the CLI can't win.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const runs = Number(opt("--runs", 10));
const outFile = opt("--out");

const workDir = path.join(root, ".tmp", "bench");
fs.mkdirSync(workDir, { recursive: true });
const env = { ...process.env, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" };
const opts = { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, opts);
// npm is a .cmd shim on Windows, which needs a shell; pass one string, not args.
const npm = (cmdLine) => spawnSync(`npm ${cmdLine}`, { ...opts, shell: true });

function fail(msg, res) {
  console.error(`bench-footprint: ${msg}`);
  if (res) console.error(res.stdout, res.stderr);
  process.exit(1);
}

if (!flag("--no-build")) {
  const res = npm("run build");
  if (res.status !== 0) fail("build failed", res);
}

// --- Size: what `npm publish` would ship -----------------------------------
const pack = npm("pack --dry-run --json --ignore-scripts");
let packInfo;
try {
  packInfo = JSON.parse(pack.stdout)[0];
} catch {
  fail("could not parse `npm pack --json`", pack);
}
const largest = [...packInfo.files]
  .sort((a, b) => b.size - a.size)
  .slice(0, 5)
  .map((f) => ({ path: f.path, bytes: f.size }));

// --- Timing -----------------------------------------------------------------
function time(label, cmdArgs, check) {
  const samples = [];
  for (let i = 0; i <= runs; i++) {
    const t0 = process.hrtime.bigint();
    const res = run(process.execPath, cmdArgs);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (res.status !== 0 || (check && !check(res))) fail(`${label} guard failed`, res);
    if (i > 0) samples.push(ms); // i === 0 is the warmup
  }
  samples.sort((a, b) => a - b);
  const round = (n) => Math.round(n);
  return {
    medianMs: round(samples[Math.floor(samples.length / 2)]),
    minMs: round(samples[0]),
    maxMs: round(samples[samples.length - 1]),
  };
}

const version = require(path.join(root, "package.json")).version;
const specPath = path.join(workDir, "trivial.spec.json");
const configPath = path.join(workDir, "bench.config.json");
fs.writeFileSync(
  specPath,
  JSON.stringify({ tests: [{ steps: [{ runShell: { command: "node", args: ["-e", "0"] } }] }] })
);
fs.writeFileSync(
  configPath,
  JSON.stringify({ telemetry: { send: false }, autoUpdate: false, output: path.join(workDir, "out") })
);

const result = {
  date: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  runs,
  size: {
    tarballBytes: packInfo.size,
    unpackedBytes: packInfo.unpackedSize,
    fileCount: packInfo.entryCount,
    largest,
  },
  startup: {
    cliVersion: time("--version", ["bin/doc-detective.js", "--version"], (r) => r.stdout.trim() === version),
    esmImport: time("ESM import", ["--input-type=module", "-e", "await import('./dist/index.js')"]),
    cjsRequire: time("CJS require", ["-e", "require('./dist/index.cjs')"]),
    runTestsTrivial: time(
      "runTests",
      ["bin/doc-detective.js", "runTests", "--input", specPath, "--config", configPath],
      (r) => /Passed: 1/.test(r.stdout) && !/Failed: [1-9]/.test(r.stdout)
    ),
  },
};

const json = JSON.stringify(result, null, 2);
if (outFile) fs.writeFileSync(outFile, json + "\n");
console.log(json);
