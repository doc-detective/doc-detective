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
  "app-recording.test.js": 3,
};

/**
 * Splits file names into `totalShards` buckets, deterministically: files are
 * sorted by (weight desc, name asc) and each is assigned to the currently
 * lightest bucket (ties broken by lowest bucket index). Buckets are disjoint
 * and their union is exactly the input set.
 *
 * @param {string[]} files - base names of the test files
 * @param {number} totalShards
 * @returns {string[][]} one array of file names per shard
 */
function partition(files, totalShards) {
  const buckets = Array.from({ length: totalShards }, () => ({
    files: [],
    weight: 0,
  }));
  const sorted = [...files].sort((a, b) => {
    const diff = (WEIGHTS[b] ?? 1) - (WEIGHTS[a] ?? 1);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  for (const file of sorted) {
    let lightest = buckets[0];
    for (const bucket of buckets) {
      if (bucket.weight < lightest.weight) lightest = bucket;
    }
    lightest.files.push(file);
    lightest.weight += WEIGHTS[file] ?? 1;
  }
  return buckets.map((b) => [...b.files].sort());
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
  const shard = partition(files, totalShards)[shardIndex - 1];
  if (shard.length === 0) {
    console.log(`shard ${shardIndex}/${totalShards}: no test files, nothing to run`);
    return;
  }
  console.log(
    `shard ${shardIndex}/${totalShards}: ${shard.length} of ${files.length} test files`
  );
  // Spawn mocha via its resolved JS entry with an args array: cross-platform
  // (no .cmd shim, no shell globbing) and .mocharc.yml is picked up from cwd.
  const mochaBin = require.resolve("mocha/bin/mocha.js");
  const result = spawnSync(
    process.execPath,
    [mochaBin, "--exit", ...shard.map((f) => path.join("test", f))],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = { partition, resolveShard, WEIGHTS };
