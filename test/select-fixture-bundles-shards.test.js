import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  selectBundles,
  selectMatrix,
  BUNDLES,
} = require("../scripts/select-fixture-bundles.cjs");

// Spec-file shards (ADR 01126): a heavy group can run as several jobs, each
// taking a slice of the group's spec files. The owning bundle keeps the
// group dir (so the one-bundle-per-dir guard still holds) and its input is
// every entry NOT claimed by a shard, read from disk, so a new spec lands in
// the owner with no edit to the script.
const ARTIFACTS = path.join(process.cwd(), "test", "core-artifacts");
const inputs = (entry) => entry.input.split(",");

describe("select-fixture-bundles spec-file shards", function () {
  const shards = BUNDLES.filter((b) => b.shardOf);

  it("splits the recording group across two jobs", function () {
    assert.deepEqual(
      shards.map((b) => b.shardOf),
      ["recording"]
    );
  });

  for (const shard of shards) {
    describe(`${shard.name} (shard of ${shard.shardOf})`, function () {
      const owner = BUNDLES.find((b) => b.name === shard.shardOf);
      const dir = owner.dirs[0];
      const full = selectMatrix(["src/core/utils.ts"]);
      const ownerEntry = full.find((e) => e.name === owner.name);
      const shardEntry = full.find((e) => e.name === shard.name);

      it("has an owner with exactly one group dir and owns no dir itself", function () {
        assert.ok(owner, `no bundle named ${shard.shardOf}`);
        assert.equal(owner.dirs.length, 1);
        assert.deepEqual(shard.dirs, []);
      });

      it("claims spec files that exist on disk", function () {
        assert.ok(shard.specs.length > 0);
        for (const spec of shard.specs)
          assert.ok(
            fs.existsSync(path.join(ARTIFACTS, dir, spec)),
            `${shard.name} claims missing spec ${dir}/${spec}`
          );
      });

      it("together with its owner covers the group dir exactly once", function () {
        const onDisk = fs
          .readdirSync(path.join(ARTIFACTS, dir))
          .filter((n) => !n.startsWith(".") && n !== "node_modules")
          .sort();
        const covered = [...inputs(ownerEntry), ...inputs(shardEntry)]
          .map((p) => {
            assert.ok(p.startsWith(`test/core-artifacts/${dir}/`), p);
            return p.slice(`test/core-artifacts/${dir}/`.length);
          })
          .sort();
        assert.deepEqual(covered, onDisk);
        assert.equal(new Set(covered).size, covered.length, "no spec in both jobs");
        assert.ok(inputs(ownerEntry).length > 0, "owner must keep at least one spec");
      });

      it("runs with its owner whenever the group is selected", function () {
        const m = selectMatrix([`test/core-artifacts/${dir}/x.spec.json`]);
        assert.deepEqual(
          m.map((e) => e.name),
          [owner.name, shard.name]
        );
        // The name-level selector still reports the owning bundle only.
        assert.equal(selectBundles([`test/core-artifacts/${dir}/x.spec.json`]), owner.name);
      });

      describe("with stray entries in the group dir", function () {
        // Planted for the duration of this block, then removed.
        const stray = [".DS_Store", ".doc-detective", "node_modules", "notes.txt", "nested"];
        const at = (n) => path.join(ARTIFACTS, dir, n);
        before(function () {
          fs.writeFileSync(at(".DS_Store"), "");
          fs.mkdirSync(at(".doc-detective"), { recursive: true });
          fs.mkdirSync(at("node_modules"), { recursive: true });
          fs.writeFileSync(at("notes.txt"), "not a spec");
          fs.mkdirSync(at("nested"), { recursive: true });
        });
        after(function () {
          for (const n of stray) fs.rmSync(at(n), { recursive: true, force: true });
        });

        it("skips dotfiles, dot-dirs, and node_modules", function () {
          const names = inputs(selectMatrix([]).find((e) => e.name === owner.name));
          for (const n of [".DS_Store", ".doc-detective", "node_modules"])
            assert.ok(!names.some((p) => p.endsWith(`/${n}`)), `${n} must not be an input`);
        });

        it("forwards other entries, which doc-detective filters as dir discovery would", function () {
          // A non-spec file goes through the same isValidSourceFile filter as a
          // discovered one, and a subdirectory stays a (recursive) dir input.
          const names = inputs(selectMatrix([]).find((e) => e.name === owner.name));
          assert.ok(names.includes(`test/core-artifacts/${dir}/notes.txt`));
          assert.ok(names.includes(`test/core-artifacts/${dir}/nested`));
        });
      });

      it("does not run when only another group changes", function () {
        const m = selectMatrix(["test/core-artifacts/http/checkLink.spec.json"]);
        assert.ok(!m.some((e) => e.name === shard.name || e.name === owner.name));
      });
    });
  }
});
