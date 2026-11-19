import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The fixture jobs' gate (scripts/check-fixture-results.cjs). It exits on its
// own, so each case runs it as a process against a results file.
describe("check-fixture-results", function () {
  let dir;
  before(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-fixture-gate-"));
  });
  after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function gate(specs, env = {}) {
    const file = path.join(dir, "results.json");
    fs.writeFileSync(file, JSON.stringify({ specs }));
    return spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "check-fixture-results.cjs"), file],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DD_FIXTURES_REQUIRE_PASS: "",
          DD_FIXTURES_REQUIRE_PASS_SPECS: "",
          ...env,
        },
      }
    );
  }

  const passed = { specId: "a", result: "PASS" };
  const skipped = { specId: "ios-wda-first-use", result: "SKIPPED" };

  it("passes a run of PASS and SKIPPED specs, and fails a FAIL", function () {
    assert.equal(gate([passed, skipped]).status, 0);
    assert.equal(gate([passed, { specId: "b", result: "FAIL" }]).status, 1);
  });

  it("with DD_FIXTURES_REQUIRE_PASS_SPECS, fails when a named spec skipped or didn't run", function () {
    const named = { DD_FIXTURES_REQUIRE_PASS_SPECS: "ios-wda-first-use" };
    // One PASS elsewhere satisfies DD_FIXTURES_REQUIRE_PASS, but not this.
    for (const specs of [[passed, skipped], [passed]]) {
      const result = gate(specs, { ...named, DD_FIXTURES_REQUIRE_PASS: "1" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /ios-wda-first-use/);
      assert.match(result.stderr, /DD_FIXTURES_REQUIRE_PASS_SPECS/);
    }
  });

  it("with DD_FIXTURES_REQUIRE_PASS_SPECS, passes when every named spec passed", function () {
    const specs = [passed, { specId: "ios-wda-first-use", result: "PASS" }];
    assert.equal(gate(specs, { DD_FIXTURES_REQUIRE_PASS_SPECS: " a , ios-wda-first-use " }).status, 0);
  });
});
