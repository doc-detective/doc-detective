import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { partition, planShard, SECONDS, SPLITS } = require("../scripts/run-test-shard.cjs");

// Describe-level pieces (ADR 01127): at 3+ shards a heavy file can be split
// by top-level describe, each piece running in its own mocha process with
// --grep (the piece) or --grep --invert (the rest of the file).
const realFiles = fs
  .readdirSync(path.join(process.cwd(), "test"))
  .filter((f) => f.endsWith(".test.js"))
  .sort();

// Every mocha invocation across all shards of an N-shard plan.
const allRuns = (total) =>
  Array.from({ length: total }, (_, i) => planShard(realFiles, i + 1, total)).flat();

describe("run-test-shard describe-level pieces", function () {
  it("leaves the 2-shard layout exactly as partition() makes it", function () {
    const parts = partition(realFiles, 2);
    for (const i of [1, 2]) {
      assert.deepEqual(planShard(realFiles, i, 2), [{ files: parts[i - 1], args: [] }]);
    }
  });

  for (const total of [3, 4]) {
    it(`runs every file exactly once, and every split file as all its pieces, at ${total} shards`, function () {
      const runs = allRuns(total);
      const whole = runs.filter((r) => r.args.length === 0).flatMap((r) => r.files);
      const split = Object.keys(SPLITS);
      assert.deepEqual(
        [...whole, ...split].sort(),
        [...realFiles].sort(),
        "whole-file runs plus split files must be the full suite"
      );
      assert.equal(new Set(whole).size, whole.length, "no file runs twice");
      for (const file of split) {
        const pieces = runs.filter((r) => r.args.length > 0 && r.files[0] === file);
        assert.equal(pieces.length, 2, `${file} must run as exactly two pieces`);
        const [grep, rest] = pieces.sort((a, b) => a.args.length - b.args.length);
        assert.deepEqual(grep.files, [file]);
        assert.deepEqual(rest.args, [...grep.args, "--invert"], "the pieces must be complements");
      }
    });
  }

  it("never produces an empty mocha run", function () {
    for (const total of [2, 3, 4])
      for (const run of allRuns(total)) assert.ok(run.files.length > 0);
  });

  it("splits only on top-level describes that exist in the file", function () {
    for (const [file, { describe: title }] of Object.entries(SPLITS)) {
      assert.ok(realFiles.includes(file), `${file} is not a test file`);
      const src = fs.readFileSync(path.join(process.cwd(), "test", file), "utf8");
      assert.ok(
        src.includes(`\ndescribe(${JSON.stringify(title)},`),
        `${file} has no top-level describe(${JSON.stringify(title)})`
      );
    }
  });

  it("keeps every measured-seconds entry pointing at a file that still exists", function () {
    for (const name of Object.keys(SECONDS))
      assert.ok(realFiles.includes(name), `SECONDS entry ${name} matches no test file`);
  });

  it("puts the three heaviest units on different shards at 3 shards", function () {
    // Measured: core-screenshot, appium-port-conflict, and core-core's larger
    // piece. Landing two of them together is what made the 3-shard layout
    // lopsided under the legacy WEIGHTS.
    const shardOf = (pred) =>
      [1, 2, 3].filter((i) => planShard(realFiles, i, 3).some(pred));
    const heavy = [
      shardOf((r) => r.args.length === 0 && r.files.includes("core-screenshot.test.js")),
      shardOf((r) => r.args.length === 0 && r.files.includes("appium-port-conflict.test.js")),
      shardOf((r) => r.files[0] === "core-core.test.js" && r.args.includes("--invert")),
    ].flat();
    assert.equal(heavy.length, 3);
    assert.equal(new Set(heavy).size, 3, `heavy units share a shard: ${heavy}`);
  });

  it("anchors the grep to the describe title as a full-title prefix", function () {
    const [file, { describe: title }] = Object.entries(SPLITS)[0];
    const run = allRuns(3).find((r) => r.files[0] === file && r.args.length === 2);
    const re = new RegExp(run.args[1]);
    assert.ok(re.test(`${title} first runner should work`));
    assert.ok(!re.test(`Run tests successfully ${title} x`));
  });
});
