import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// CommonJS script (repo is type:module); interop via createRequire.
const { partition, WEIGHTS } = require("../scripts/run-test-shard.cjs");

// The real file list the CI shards run, matching mocha's non-recursive
// `test/*.test.js` glob.
const realFiles = fs
  .readdirSync(path.join(process.cwd(), "test"))
  .filter((f) => f.endsWith(".test.js"))
  .sort();

describe("run-test-shard partition", function () {
  it("is deterministic for the same inputs", function () {
    const a = partition(realFiles, 2);
    const b = partition([...realFiles].reverse(), 2);
    assert.deepEqual(a, b);
  });

  it("is complete and disjoint — shards union to exactly the input set", function () {
    for (const total of [2, 3, 4]) {
      const shards = partition(realFiles, total);
      assert.equal(shards.length, total);
      const combined = shards.flat().sort();
      assert.deepEqual(combined, [...realFiles].sort());
      // Disjoint: combined has no duplicates.
      assert.equal(new Set(combined).size, combined.length);
    }
  });

  it("separates the two heaviest suites across shards when N=2", function () {
    const byWeight = Object.entries(WEIGHTS).sort((a, b) => b[1] - a[1]);
    const [heaviest, second] = [byWeight[0][0], byWeight[1][0]];
    const shards = partition(realFiles, 2);
    const shardOf = (file) => shards.findIndex((s) => s.includes(file));
    assert.notEqual(shardOf(heaviest), -1);
    assert.notEqual(shardOf(second), -1);
    assert.notEqual(shardOf(heaviest), shardOf(second));
  });

  it("balances shards — totals differ by at most the largest single weight", function () {
    const weightOf = (f) => WEIGHTS[f] ?? 1;
    const maxWeight = Math.max(...realFiles.map(weightOf));
    const shards = partition(realFiles, 2);
    const totals = shards.map((s) => s.reduce((sum, f) => sum + weightOf(f), 0));
    assert.ok(
      Math.abs(totals[0] - totals[1]) <= maxWeight,
      `shard totals ${totals.join(" vs ")} differ by more than ${maxWeight}`
    );
  });

  it("keeps every weighted file pointing at a file that still exists", function () {
    // Guards against a heavy suite being renamed/removed while its weight
    // entry silently rots into a no-op.
    for (const name of Object.keys(WEIGHTS)) {
      assert.ok(
        realFiles.includes(name),
        `WEIGHTS entry ${name} does not match any test/*.test.js file`
      );
    }
  });

  it("rejects out-of-range shard indexes at the CLI boundary", function () {
    const { resolveShard } = require("../scripts/run-test-shard.cjs");
    assert.throws(() => resolveShard(["0", "2"]));
    assert.throws(() => resolveShard(["3", "2"]));
    assert.throws(() => resolveShard(["x", "2"]));
    assert.deepEqual(resolveShard(["2", "2"]), { shardIndex: 2, totalShards: 2 });
  });
});
