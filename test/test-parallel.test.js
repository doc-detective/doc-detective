// scripts/test-parallel.cjs: local concurrent-shard runner (ADR 01120).
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { combinedExit } = require("../scripts/test-parallel.cjs");

describe("test-parallel", function () {
  it("fails the run when any shard fails", function () {
    assert.equal(combinedExit([0, 0]), 0);
    assert.equal(combinedExit([0, 1]), 1);
    assert.equal(combinedExit([3, 0]), 3);
    // A shard killed by a signal reports a null status.
    assert.equal(combinedExit([0, null]), 1);
  });

  it("is wired as `npm run test:parallel`", function () {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    assert.equal(pkg.scripts["test:parallel"], "node scripts/test-parallel.cjs");
  });
});
