#!/usr/bin/env node
// Deterministically partitions the mocha suite (test/*.test.js, matching the
// non-recursive glob `npm test` uses) into N shards and runs one of them, so
// CI can split the suite across parallel jobs (see .github/workflows/test.yml).
//
// Usage: node scripts/run-test-shard.cjs <shardIndex> <totalShards>
//   shardIndex is 1-based (matches the workflow matrix values).
//
// Coverage: NODE_V8_COVERAGE (and all other env) is inherited by the spawned
// mocha, so each shard's job uploads its own raw-coverage slice; the
// coverage-merge job unions the shards, and the union equals the unsharded
// suite's coverage.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Relative suite weights for greedy bin-packing. Only the known-heavy suites
// (browser / Appium / recording driven, sized from their `this.timeout(...)`
// ceilings) need entries; every other file defaults to 1, so new test files
// are included automatically. A unit test asserts these names still exist —
// rename the entry when renaming the suite.
const WEIGHTS = {
  "core-core.test.js": 20, // "do all the things" smoke incl. recording
  "appium-port-conflict.test.js": 8, // boots real Appium + driver sessions
  "core-screenshot.test.js": 8, // browser-driven screenshot permutations
  "app-surface.test.js": 5,
  "concurrency.test.js": 5,
  "browser-fallback-e2e.test.js": 4,
  "debug.test.js": 4,
  // 30s ceiling, which sits between app-recording (15s -> 3) and
  // concurrency (120s -> 5). It was missing an entry, so it defaulted to 1
  // and the packer was free to put it anywhere. Landing it beside
  // core-core.test.js made it exceed its own 30s budget and fail on every
  // node-24 OS: its `makeConfig` calls run browser detection, which is
  // contended right after a heavy browser and recording suite. Weighting it
  // packs it opposite core-core, which is what the table is for.
  "detecttests-coverage.test.js": 4,
  "app-recording.test.js": 3,
};

// 3+ shard packing (ADR 01127). WEIGHTS above predates measurement; it keeps
// the 2-shard layout, and the pairings it encodes, exactly where they are.
// At 3+ shards the packer uses measured seconds instead (windows-latest CI,
// the slowest OS), because WEIGHTS badly underrates some files: runTests is
// weight 1 but ~35-130 s, and core-screenshot weighs the same as
// appium-port-conflict at twice the time. Unlisted files count 2 s. When the
// Windows shard jobs drift out of balance, refresh these from that cell's
// mocha logs (per-file wall time between top-level describe headers).
// Source: windows-latest shard logs of runs 38516518765 and 38345827777.
const SECONDS = {
  "core-screenshot.test.js": 200,
  "appium-port-conflict.test.js": 120,
  "runTests.test.js": 80,
  "checkLink.test.js": 27,
  "debug-remaining-coverage.test.js": 25,
  "cli-index-adapters-coverage.test.js": 21,
  "browser-fallback-e2e.test.js": 14,
  "concurrency.test.js": 14,
  "background-process.test.js": 12,
  "debug.test.js": 9,
};

// Also at 3+ shards, a file heavier than a third of the suite is split into
// two pieces: the named top-level describe, and the rest of the file, each
// with its measured seconds. core-core alone is ~250 s on windows-latest
// (getRunner ~110 s, the rest ~140 s), against ~350 s per shard. A unit test
// asserts the describe still exists at the top level.
const SPLITS = {
  "core-core.test.js": { describe: "getRunner() function", seconds: [110, 140] },
};

/**
 * Splits file names into `totalShards` buckets, deterministically: files are
 * sorted by (weight desc, name asc) and each is assigned to the currently
 * lightest bucket (ties broken by lowest bucket index). Buckets are disjoint
 * and their union is exactly the input set.
 *
 * @param {string[]} files - base names of the test files
 * @param {number} totalShards
 * @param {(name: string) => number} [weightOf] - defaults to WEIGHTS, else 1
 * @returns {string[][]} one array of file names per shard
 */
function partition(files, totalShards, weightOf = (f) => WEIGHTS[f] ?? 1) {
  const buckets = Array.from({ length: totalShards }, () => ({
    files: [],
    weight: 0,
  }));
  const sorted = [...files].sort((a, b) => {
    const diff = weightOf(b) - weightOf(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  for (const file of sorted) {
    let lightest = buckets[0];
    for (const bucket of buckets) {
      if (bucket.weight < lightest.weight) lightest = bucket;
    }
    lightest.files.push(file);
    lightest.weight += weightOf(file);
  }
  return buckets.map((b) => [...b.files].sort());
}

/**
 * The mocha invocations one shard runs: whole files share one run (no extra
 * args); each describe-level piece of a split file gets its own run, since
 * --grep applies to the whole mocha process.
 *
 * @param {string[]} files - base names of the test files
 * @param {number} shardIndex - 1-based
 * @param {number} totalShards
 * @returns {{ files: string[], args: string[] }[]}
 */
function planShard(files, shardIndex, totalShards) {
  if (totalShards < 3) {
    const shardFiles = partition(files, totalShards)[shardIndex - 1];
    return [{ files: shardFiles, args: [] }].filter((r) => r.files.length > 0);
  }
  const pieces = new Map(); // unit name -> { file, args, seconds }
  for (const [file, { describe, seconds }] of Object.entries(SPLITS)) {
    if (!files.includes(file)) continue;
    const grep = ["--grep", `^${describe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `];
    pieces.set(`${file}#describe`, { file, args: grep, seconds: seconds[0] });
    pieces.set(`${file}#rest`, { file, args: [...grep, "--invert"], seconds: seconds[1] });
  }
  const split = new Set([...pieces.values()].map((p) => p.file));
  const units = [...files.filter((f) => !split.has(f)), ...pieces.keys()];
  const weightOf = (u) => pieces.get(u)?.seconds ?? SECONDS[u] ?? 2;
  const mine = partition(units, totalShards, weightOf)[shardIndex - 1];
  const whole = mine.filter((u) => !pieces.has(u));
  // Whole files first, then split pieces.
  const runs = [];
  if (whole.length > 0) runs.push({ files: whole, args: [] });
  for (const u of mine.filter((u) => pieces.has(u)))
    runs.push({ files: [pieces.get(u).file], args: pieces.get(u).args });
  return runs.filter((r) => r.files.length > 0);
}

/**
 * Parses and validates CLI args. Throws on anything out of range so a
 * mistyped matrix value fails the job loudly instead of running shard 1.
 *
 * @param {string[]} argv - [shardIndex, totalShards]
 * @returns {{ shardIndex: number, totalShards: number }}
 */
function resolveShard(argv) {
  const shardIndex = Number(argv[0]);
  const totalShards = Number(argv[1]);
  if (!Number.isInteger(totalShards) || totalShards < 1) {
    throw new Error(`invalid totalShards: ${argv[1]}`);
  }
  if (
    !Number.isInteger(shardIndex) ||
    shardIndex < 1 ||
    shardIndex > totalShards
  ) {
    throw new Error(
      `invalid shardIndex: ${argv[0]} (expected 1..${totalShards})`
    );
  }
  return { shardIndex, totalShards };
}

function main() {
  const { shardIndex, totalShards } = resolveShard(process.argv.slice(2));
  const testDir = path.join(process.cwd(), "test");
  const files = fs
    .readdirSync(testDir)
    .filter((f) => f.endsWith(".test.js"))
    .sort();
  const runs = planShard(files, shardIndex, totalShards);
  if (runs.length === 0) {
    console.log(`shard ${shardIndex}/${totalShards}: no test files, nothing to run`);
    return;
  }
  // Spawn mocha via its resolved JS entry with an args array: cross-platform
  // (no .cmd shim, no shell globbing) and .mocharc.yml is picked up from cwd.
  // Runs go one after another (each starts and stops its own test servers via
  // the root hooks), every run executes even if an earlier one failed, and
  // the shard fails if any run did.
  const mochaBin = require.resolve("mocha/bin/mocha.js");
  let status = 0;
  for (const run of runs) {
    console.log(
      `shard ${shardIndex}/${totalShards}: ${run.files.length} of ${files.length} test files` +
        (run.args.length ? ` (${run.args.join(" ")})` : "")
    );
    const result = spawnSync(
      process.execPath,
      [mochaBin, "--exit", ...run.args, ...run.files.map((f) => path.join("test", f))],
      { stdio: "inherit" }
    );
    if (result.status !== 0) status = result.status ?? 1;
  }
  process.exit(status);
}

if (require.main === module) {
  main();
}

module.exports = { partition, planShard, resolveShard, WEIGHTS, SECONDS, SPLITS };
