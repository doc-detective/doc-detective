// Cover for the local-package staging the container build uses to test the
// branch's own code (ADR 01097).
//
// The Dockerfiles install `doc-detective@<version>` from the npm registry, so a
// pull-request build of the image exercises the PUBLISHED package and is blind
// to the change under review — which is how a runtime crash could sit red on the
// arm64 leg with no way for the fixing PR to prove itself. The build script can
// now stage a locally packed tarball into a fixed directory inside the Docker
// build context; the Dockerfiles prefer it when present and fall back to the
// registry when it isn't.
//
// The staging is what these tests pin, because getting it subtly wrong is how
// this feature would betray you: a leftover tarball silently overriding a
// registry build is worse than no feature at all.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOCAL_PACKAGE_DIRNAME,
  localPackageDir,
  ensureLocalPackageDir,
  clearLocalPackage,
  stageLocalPackage,
} from "../src/container/scripts/localPackage.cjs";

describe("container build: local package staging", function () {
  let containerDir;
  let workDir;
  beforeEach(function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dd-localpkg-"));
    containerDir = path.join(root, "container");
    workDir = path.join(root, "work");
    fs.mkdirSync(containerDir);
    fs.mkdirSync(workDir);
  });
  afterEach(function () {
    fs.rmSync(path.dirname(containerDir), { recursive: true, force: true });
  });

  const tarball = (name) => {
    const p = path.join(workDir, name);
    fs.writeFileSync(p, "not really a tarball");
    return p;
  };

  it("resolves the staging directory inside the Docker build context", function () {
    // The Dockerfiles COPY this exact path, so the name is a contract.
    assert.equal(
      localPackageDir(containerDir),
      path.join(containerDir, LOCAL_PACKAGE_DIRNAME)
    );
  });

  it("ensures the directory exists so the Dockerfile COPY never fails", function () {
    // `COPY .local-package/ ...` errors out when the source is missing, so the
    // directory has to exist on every build, local package or not.
    ensureLocalPackageDir(containerDir);
    assert.ok(fs.statSync(localPackageDir(containerDir)).isDirectory());
    ensureLocalPackageDir(containerDir); // idempotent
    assert.ok(fs.statSync(localPackageDir(containerDir)).isDirectory());
  });

  it("stages a tarball and reports where it landed", function () {
    const staged = stageLocalPackage(containerDir, tarball("doc-detective-9.9.9.tgz"));
    assert.equal(
      staged,
      path.join(containerDir, LOCAL_PACKAGE_DIRNAME, "doc-detective-9.9.9.tgz")
    );
    assert.equal(fs.readFileSync(staged, "utf8"), "not really a tarball");
  });

  it("replaces a previously staged tarball instead of leaving two", function () {
    // Two tarballs in the directory would make `npm install -g *.tgz`
    // non-deterministic about which build actually ends up in the image.
    stageLocalPackage(containerDir, tarball("doc-detective-1.0.0.tgz"));
    stageLocalPackage(containerDir, tarball("doc-detective-2.0.0.tgz"));
    const staged = fs
      .readdirSync(localPackageDir(containerDir))
      .filter((f) => f.endsWith(".tgz"));
    assert.deepEqual(staged, ["doc-detective-2.0.0.tgz"]);
  });

  it("clears a stale tarball so a registry build stays a registry build", function () {
    // The failure this prevents: someone runs a local-package build once, then
    // builds normally, and silently keeps shipping the old local tarball.
    stageLocalPackage(containerDir, tarball("doc-detective-1.0.0.tgz"));
    clearLocalPackage(containerDir);
    assert.deepEqual(
      fs
        .readdirSync(localPackageDir(containerDir))
        .filter((f) => f.endsWith(".tgz")),
      []
    );
    // …and the directory itself survives, because the COPY still needs it.
    assert.ok(fs.statSync(localPackageDir(containerDir)).isDirectory());
  });

  it("rejects a missing tarball", function () {
    assert.throws(
      () => stageLocalPackage(containerDir, path.join(workDir, "nope.tgz")),
      /not found/i
    );
  });

  it("rejects a file that isn't a .tgz", function () {
    assert.throws(
      () => stageLocalPackage(containerDir, tarball("doc-detective.zip")),
      /\.tgz/i
    );
  });
});
