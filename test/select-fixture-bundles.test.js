import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";

const require = createRequire(import.meta.url);
const { selectBundles, BUNDLES } = require("../scripts/select-fixture-bundles.cjs");

describe("select-fixture-bundles", function () {
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

  it("keeps its bundle map in lockstep with fixtures.yml (drift guard)", function () {
    const wf = parseYaml(
      fs.readFileSync(
        path.join(process.cwd(), ".github", "workflows", "fixtures.yml"),
        "utf8"
      )
    );
    const fromWorkflow = wf.jobs.fixtures.strategy.matrix.bundle.map((b) => ({
      name: b.name,
      dirs: b.input
        .split(",")
        .map((p) => p.trim().replace("test/core-artifacts/", "")),
    }));
    assert.deepEqual(BUNDLES, fromWorkflow);
  });
});
