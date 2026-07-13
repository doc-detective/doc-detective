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
  BUNDLES,
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
      assert.equal(selectBundles(["test/core-artifacts/http/checkLink.spec.json"]), "web-plumbing");
      assert.equal(
        selectBundles([
          "test/core-artifacts/http/checkLink.spec.json",
          "test/core-artifacts/guards/requires.spec.json",
        ]),
        "web-plumbing"
      );
      assert.equal(
        selectBundles([
          "test/core-artifacts/navigation/goTo.spec.json",
          "test/core-artifacts/sessions/s.spec.json",
        ]),
        "nav-capture,proc-sessions"
      );
      assert.equal(
        selectBundles(["test/core-artifacts/apps-android/a.spec.json"]),
        "android-skip"
      );
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

  it("keeps fixtures.yml wired to the script's --matrix output (drift guard)", function () {
    const wf = parseYaml(
      fs.readFileSync(
        path.join(process.cwd(), ".github", "workflows", "fixtures.yml"),
        "utf8"
      )
    );
    // The matrix is dynamic (built from the select job), not a static list.
    assert.equal(
      wf.jobs.fixtures.strategy.matrix.bundle,
      "${{ fromJSON(needs.select.outputs.matrix) }}"
    );
    assert.equal(wf.jobs.fixtures.needs, "select");
    // The select job runs THIS script with --matrix and --android-legs.
    const selectRun = wf.jobs.select.steps
      .map((s) => s.run || "")
      .join("\n");
    assert.match(selectRun, /select-fixture-bundles\.cjs --matrix/);
    assert.match(selectRun, /select-fixture-bundles\.cjs --android-legs/);
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
