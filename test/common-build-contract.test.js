import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// Guards the build/test decoupling from ADR 01057: `build:common` (and thus
// the root `npm run build` that every fixture/shard job runs) must build
// artifacts WITHOUT running the src/common test suite. Re-adding a test run to
// the build regresses the flake surface and per-job waste this ADR removed.
//
// Red→green anchor: against the prior build script (`… && npm run compile &&
// npm run test:coverage`) the "does not run the suite" assertion fails;
// against the decoupled script it passes.
describe("doc-detective-common build contract (ADR 01057)", function () {
  let pkg, build;

  before(function () {
    pkg = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src", "common", "package.json"),
        "utf8"
      )
    );
    build = pkg.scripts.build;
  });

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

// What the built packages ship (ADR 01164). Reads the output of `npm run build`.
describe("published schema files (ADR 01164)", function () {
  const common = path.join(process.cwd(), "src", "common");
  const head = (file) => {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(64);
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.toString();
  };
  const assertMinified = (file) =>
    assert.doesNotMatch(head(file), /\n/, `${file} must be minified JSON`);

  it("doc-detective-common publishes only dist/", function () {
    const pkg = JSON.parse(fs.readFileSync(path.join(common, "package.json"), "utf8"));
    assert.deepEqual(pkg.files, ["dist/"]);
  });

  it("both packages ship schemas.json minified", function () {
    assertMinified(path.join(common, "dist", "schemas", "schemas.json"));
    assertMinified(path.join(process.cwd(), "dist", "common", "src", "schemas", "schemas.json"));
  });

  it("doc-detective-common ships every v3 schema where `$schema` URLs point", function () {
    const { schemas } = require(path.join(common, "src", "schemas", "schemasReferenced.json"));
    const keys = Object.keys(schemas).filter((key) => key.endsWith("_v3"));
    assert.ok(keys.length > 30);
    for (const key of keys) assertMinified(path.join(common, "dist", "schemas", `${key}.schema.json`));
  });

  it("doc-detective-common's CJS bundle loads schemas.json instead of inlining it", function () {
    const bundle = path.join(common, "dist", "index.cjs");
    assert.match(fs.readFileSync(bundle, "utf8"), /require\("\.\/schemas\/schemas\.json"\)/);
    assert.ok(require(bundle).schemas.config_v3.properties);
  });
});
