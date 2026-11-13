import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findCollisions } = require("../scripts/check-adr-numbers.cjs");

// Fixture trees: file lists under adrs/ at the merge base, the base tip, and the PR head.
const base = [
  "adrs/01000-gate.md",
  "adrs/01016-dup-a.md",
  "adrs/01016-dup-b.md", // grandfathered duplicate
  "adrs/BACKFILL-PLAN.md",
];

describe("check-adr-numbers", function () {
  it("flags an added ADR that reuses a base number", function () {
    const head = [...base, "adrs/01000-other.md"];
    assert.deepEqual(findCollisions(base, head), [
      { file: "adrs/01000-other.md", number: "01000", others: ["adrs/01000-gate.md"], next: "01017" },
    ]);
  });

  it("flags an added ADR that reuses a number the base gained after the branch point", function () {
    const mergeBase = base;
    const tip = [...base, "adrs/01017-landed.md"];
    const head = [...base, "adrs/01017-mine.md"];
    const collisions = findCollisions(tip, head, mergeBase);
    assert.deepEqual(collisions.map((c) => c.file), ["adrs/01017-mine.md"]);
    assert.deepEqual(collisions[0].others, ["adrs/01017-landed.md"]);
  });

  it("flags two added ADRs that share a number", function () {
    const head = [...base, "adrs/01017-a.md", "adrs/01017-b.md"];
    assert.deepEqual(findCollisions(base, head).map((c) => c.file), ["adrs/01017-a.md", "adrs/01017-b.md"]);
  });

  it("passes a fresh number and grandfathers existing duplicates", function () {
    assert.deepEqual(findCollisions(base, [...base, "adrs/01017-new.md"]), []);
    assert.deepEqual(findCollisions(base, base), []);
  });

  it("never suggests a number in the reserved backfill range 00001–00999", function () {
    const backfilled = ["adrs/00145-merge-core.md"];
    const [collision] = findCollisions(backfilled, [...backfilled, "adrs/00145-other.md"]);
    assert.equal(collision.next, "01000");
  });

  it("passes a renumbering rename", function () {
    const head = ["adrs/01000-gate.md", "adrs/01016-dup-a.md", "adrs/01017-dup-b.md"];
    assert.deepEqual(findCollisions(base, head), []);
  });
});
