import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";

const require = createRequire(import.meta.url);
const {
  selectBundles,
  selectMatrix,
  androidLegsRelevant,
  selectLegs,
  BUNDLES,
  OSES,
} = require("../scripts/select-fixture-bundles.cjs");

// Directories under test/core-artifacts/ that are NOT fixture-gate groups:
// they hold specs/data consumed by the mocha suite, not this matrix.
const NON_GROUP_DIRS = new Set(["ordering", "output"]);

describe("select-fixture-bundles", function () {
  describe("selectBundles (names)", function () {
    it("returns 'all' when any changed file is outside the fixture group dirs", function () {
      assert.equal(selectBundles(["src/core/utils.ts"]), "all");
      assert.equal(
        selectBundles(["test/core-artifacts/http/x.spec.json", "src/core/utils.ts"]),
        "all"
      );
      assert.equal(selectBundles(["package-lock.json"]), "all");
      assert.equal(selectBundles([".github/workflows/fixtures.yml"]), "all");
      assert.equal(selectBundles(["test/run-test-shard.test.js"]), "all");
    });

    it("returns 'all' for shared fixture infrastructure inside core-artifacts", function () {
      // env vars, the shared group config, and the mocha-owned dirs feed every
      // bundle (or none) — narrowing on them would silently skip real coverage.
      assert.equal(selectBundles(["test/core-artifacts/env"]), "all");
      assert.equal(selectBundles(["test/core-artifacts/config.groups.json"]), "all");
      assert.equal(selectBundles(["test/core-artifacts/ordering/_setup.spec.json"]), "all");
      assert.equal(selectBundles(["test/core-artifacts/output/docker-output.txt"]), "all");
    });

    it("returns 'all' for an empty change set", function () {
      assert.equal(selectBundles([]), "all");
    });

    it("maps group-confined changes to their bundles", function () {
      assert.equal(selectBundles(["test/core-artifacts/http/checkLink.spec.json"]), "general");
      assert.equal(
        selectBundles([
          "test/core-artifacts/http/checkLink.spec.json",
          "test/core-artifacts/guards/requires.spec.json",
        ]),
        "general"
      );
      assert.equal(
        selectBundles([
          "test/core-artifacts/navigation/goTo.spec.json",
          "test/core-artifacts/recording/r.spec.json",
        ]),
        "general,recording"
      );
      assert.equal(
        selectBundles(["test/core-artifacts/apps-android/a.spec.json"]),
        "android-skip"
      );
    });

    it("runs the fast groups as one bundle so each OS pays setup once (ADR 01113)", function () {
      // Each bundle is a job per OS, and each job pays ~3-4 min of cache
      // restore, npm ci, and build before its first spec. The fast groups'
      // fixtures run in 2-4 min, so splitting them spent more on setup than on
      // tests and filled the 5-slot macOS pool ahead of the iOS critical path.
      const fast = ["navigation", "capture", "interactions", "routing", "http",
        "guards", "reporters", "process", "sessions"];
      const owners = new Set(
        fast.map((dir) => BUNDLES.find((b) => b.dirs.includes(dir))?.name)
      );
      assert.deepEqual([...owners], ["general"]);
    });

    it("normalizes Windows-style separators", function () {
      assert.equal(
        selectBundles(["test\\core-artifacts\\recording\\recording.spec.json"]),
        "recording"
      );
    });
  });

  describe("selectMatrix (CI matrix objects)", function () {
    it("returns the full matrix for a non-narrowable change set", function () {
      const all = selectMatrix(["src/core/utils.ts"]);
      assert.equal(all.length, BUNDLES.length);
      // Every entry carries a name and a non-empty comma-joined input.
      for (const b of all) {
        assert.ok(b.name && typeof b.name === "string");
        assert.ok(b.input && /^test\/core-artifacts\//.test(b.input));
      }
    });

    it("returns the full matrix for an empty change set (never empty)", function () {
      assert.equal(selectMatrix([]).length, BUNDLES.length);
    });

    it("narrows to only the touched bundles, preserving CI attributes", function () {
      const m = selectMatrix(["test/core-artifacts/apps-ios/a.spec.json"]);
      assert.deepEqual(m, [
        {
          name: "apps-ios",
          input: "test/core-artifacts/apps-ios",
          timeout: 55,
          prebootIos: true,
        },
      ]);
    });

    it("emits the android attribute for the android bundle", function () {
      const m = selectMatrix(["test/core-artifacts/mobile-web-android/m.spec.json"]);
      assert.equal(m.length, 1);
      assert.equal(m[0].name, "android-skip");
      assert.equal(m[0].android, true);
    });
  });

  describe("androidLegsRelevant", function () {
    it("keeps the KVM legs on for product, script, workflow, and infra changes", function () {
      assert.equal(androidLegsRelevant(["src/core/utils.ts"]), true);
      assert.equal(androidLegsRelevant(["scripts/check-fixture-results.cjs"]), true);
      assert.equal(androidLegsRelevant([".github/workflows/fixtures.yml"]), true);
      assert.equal(androidLegsRelevant(["package-lock.json"]), true);
      // The fixture jobs' test servers are reached from inside the emulator.
      assert.equal(androidLegsRelevant(["test/server/start.js"]), true);
      assert.equal(androidLegsRelevant(["test/core-artifacts/env"]), true);
      assert.equal(androidLegsRelevant(["test/core-artifacts/config.groups.json"]), true);
    });

    it("keeps the KVM legs on when android fixtures change", function () {
      assert.equal(androidLegsRelevant(["test/core-artifacts/apps-android/a.spec.json"]), true);
      assert.equal(
        androidLegsRelevant(["test/core-artifacts/mobile-web-android/m.spec.json"]),
        true
      );
    });

    it("keeps the KVM legs on for an empty change set", function () {
      assert.equal(androidLegsRelevant([]), true);
    });

    it("skips the KVM legs when changes cannot reach android behavior", function () {
      assert.equal(androidLegsRelevant(["test/core-artifacts/http/checkLink.spec.json"]), false);
      assert.equal(androidLegsRelevant(["test/run-test-shard.test.js"]), false);
      assert.equal(androidLegsRelevant(["docs/pages/get-started.mdx"]), false);
      assert.equal(androidLegsRelevant(["adrs/01055-path-filtered-fixture-bundles.md"]), false);
      assert.equal(androidLegsRelevant(["test/AGENTS.md"]), false);
      assert.equal(
        androidLegsRelevant([
          "test/core-artifacts/recording/recording.spec.json",
          "test/hints.test.js",
        ]),
        false
      );
    });

    it("one relevant file flips the whole set to relevant", function () {
      assert.equal(
        androidLegsRelevant([
          "test/core-artifacts/http/checkLink.spec.json",
          "src/core/appium.ts",
        ]),
        true
      );
    });
  });

  it("covers every fixture group directory on disk exactly once", function () {
    // Stronger than comparing to the workflow (which no longer holds the list):
    // tie the script to the actual filesystem. Every real group dir under
    // test/core-artifacts/ (minus the mocha-owned ones) must map to exactly one
    // bundle, and every bundle dir must exist.
    const root = path.join(process.cwd(), "test", "core-artifacts");
    const groupDirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !NON_GROUP_DIRS.has(d.name))
      .map((d) => d.name)
      .sort();
    const covered = BUNDLES.flatMap((b) => b.dirs).sort();
    assert.deepEqual(covered, groupDirs, "bundle dirs must match on-disk group dirs exactly");
    assert.equal(new Set(covered).size, covered.length, "no directory in two bundles");
  });

  describe("selectLegs (iOS legs queue first, ADR 01109)", function () {
    const key = (l) => `${l.os}|${l.bundle.name}`;

    it("puts exactly the macOS legs of prebootIos bundles in the ios list", function () {
      const { ios } = selectLegs(["src/core/utils.ts"]);
      assert.deepEqual(ios.map(key).sort(), ["macos-latest|apps-ios", "macos-latest|mobile-web-ios"]);
      for (const l of ios) assert.equal(l.bundle.prebootIos, true);
    });

    it("splits the full OS x bundle grid with nothing lost or doubled", function () {
      const { ios, rest } = selectLegs([]);
      const all = [...ios, ...rest].map(key);
      assert.equal(new Set(all).size, all.length, "no leg in both lists");
      const grid = OSES.flatMap((os) => selectMatrix([]).map((b) => `${os}|${b.name}`));
      assert.deepEqual(all.sort(), grid.sort());
    });

    it("leaves the ios list empty when narrowing drops the iOS bundles", function () {
      const { ios, rest } = selectLegs(["test/core-artifacts/http/checkLink.spec.json"]);
      assert.deepEqual(ios, []);
      assert.deepEqual(rest.map(key).sort(), OSES.map((os) => `${os}|general`).sort());
    });
  });

  it("keeps fixtures.yml wired to the script's leg lists (drift guard)", function () {
    const wf = parseYaml(
      fs.readFileSync(
        path.join(process.cwd(), ".github", "workflows", "fixtures.yml"),
        "utf8"
      )
    );
    // Both matrices are dynamic (built from the select job), not static lists.
    assert.equal(
      wf.jobs["fixtures-ios"].strategy.matrix,
      "${{ fromJSON(needs.select.outputs.iosLegs) }}"
    );
    assert.equal(
      wf.jobs.fixtures.strategy.matrix,
      "${{ fromJSON(needs.select.outputs.restLegs) }}"
    );
    // The iOS legs queue as soon as select finishes; the rest wait for the
    // stagger job, so the iOS legs are ahead of them for macOS slots.
    assert.equal(wf.jobs["fixtures-ios"].needs, "select");
    assert.deepEqual(wf.jobs.fixtures.needs, ["select", "stagger"]);
    assert.equal(wf.jobs.stagger.needs, "select");
    // One step list (a YAML anchor), so the two jobs can never drift apart.
    assert.deepEqual(wf.jobs["fixtures-ios"].steps, wf.jobs.fixtures.steps);
    // The select job runs THIS script for both leg lists and --android-legs.
    const selectRun = wf.jobs.select.steps
      .map((s) => s.run || "")
      .join("\n");
    assert.match(selectRun, /select-fixture-bundles\.cjs --legs-ios/);
    assert.match(selectRun, /select-fixture-bundles\.cjs --legs-rest/);
    assert.match(selectRun, /select-fixture-bundles\.cjs --android-legs/);
  });

  it("keeps fixtures-debug.yml running the gate's exact fixture steps (drift guard)", function () {
    const read = (f) =>
      parseYaml(fs.readFileSync(path.join(process.cwd(), ".github", "workflows", f), "utf8"));
    const gate = read("fixtures.yml");
    const debug = read("fixtures-debug.yml");
    // A single-leg run is only a faithful sample of a gate leg if it runs the
    // same steps (cache, pre-boot, WDA prebuild, action inputs, gate).
    assert.deepEqual(debug.jobs.fixtures.steps, gate.jobs.fixtures.steps);
    assert.equal(debug.jobs.fixtures.strategy.matrix, "${{ fromJSON(needs.select.outputs.leg) }}");
    assert.equal(debug.jobs.fixtures["timeout-minutes"], gate.jobs.fixtures["timeout-minutes"]);
    // The leg comes from the selector, so bundle attributes can't drift either.
    const selectRun = debug.jobs.select.steps.map((s) => s.run || "").join("\n");
    assert.match(selectRun, /select-fixture-bundles\.cjs --legs-ios/);
    assert.match(selectRun, /select-fixture-bundles\.cjs --legs-rest/);
  });

  it("gates all three android KVM legs on the select job's androidLegs output", function () {
    const wf = parseYaml(
      fs.readFileSync(
        path.join(process.cwd(), ".github", "workflows", "fixtures.yml"),
        "utf8"
      )
    );
    for (const job of [
      "fixtures-android-reuse",
      "fixtures-android-managed",
      "fixtures-android-action",
    ]) {
      assert.equal(wf.jobs[job].needs, "select", `${job} must need select`);
      assert.equal(
        wf.jobs[job].if,
        "needs.select.outputs.androidLegs != 'false'",
        `${job} must gate on androidLegs`
      );
    }
  });
});
