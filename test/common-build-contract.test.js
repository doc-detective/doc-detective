import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Guards the build/test decoupling from ADR 01057: `build:common` (and thus
// the root `npm run build` that every fixture/shard job runs) must build
// artifacts WITHOUT running the src/common test suite. Re-adding a test run to
// the build regresses the flake surface and per-job waste this ADR removed.
//
// Red→green anchor: against the prior build script (`… && npm run compile &&
// npm run test:coverage`) the "does not run the suite" assertion fails;
// against the decoupled script it passes.
describe("doc-detective-common build contract (ADR 01057)", function () {
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "src", "common", "package.json"),
      "utf8"
    )
  );
  const build = pkg.scripts.build;

  it("builds artifacts without running the test suite", function () {
    assert.doesNotMatch(
      build,
      /\btest(:coverage)?\b|\bmocha\b|\bc8\b/,
      `src/common build must not invoke tests (ADR 01057); got: ${build}`
    );
  });

  it("still compiles the package", function () {
    assert.match(build, /\bcompile\b/, "src/common build must still run compile");
  });

  it("keeps a separate coverage entry for the ratchet job to call", function () {
    assert.equal(pkg.scripts["test:coverage"], "c8 mocha");
  });
});
