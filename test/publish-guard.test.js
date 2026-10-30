import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { onPublishFailure, checkDeferred, assertSameGitHead } from "../scripts/publish-guard.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const PACKAGES = ["doc-detective", "doc-detective-common"];

describe("scripts/publish-guard", function () {
  let dir;
  let marker;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-publish-guard-"));
    marker = path.join(dir, "nested", "publish-deferred");
  });

  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stops the release untagged when nothing reached npm", function () {
    const code = onPublishFailure({
      version: "1.2.3",
      message: "EOTP",
      packages: PACKAGES,
      isPublished: () => false,
      marker,
    });
    expect(code).to.equal(1);
    expect(fs.existsSync(marker)).to.be.false;
  });

  it("lets the release tag a version that's partly on npm, then fails it at publish", function () {
    const code = onPublishFailure({
      version: "1.2.3",
      message: "[doc-detective-common] publish failed",
      packages: PACKAGES,
      isPublished: (pkg) => pkg === "doc-detective",
      marker,
    });
    expect(code).to.equal(0);
    expect(fs.readFileSync(marker, "utf8")).to.include("1.2.3").and.include("publish failed");
    expect(checkDeferred(marker)).to.equal(1);
  });

  it("passes the publish step when prepare deferred nothing", function () {
    expect(checkDeferred(marker)).to.equal(0);
  });

  it("refuses to reuse a version npm built from another commit", function () {
    expect(() => assertSameGitHead("doc-detective", "1.2.3", "aaa", "bbb")).to.throw(/aaa.*bbb/);
    expect(() => assertSameGitHead("doc-detective", "1.2.3", "aaa", "aaa")).not.to.throw();
    // A failed or empty `npm view ... gitHead` yields "": no proof, no reuse.
    expect(() => assertSameGitHead("doc-detective", "1.2.3", "", "bbb")).to.throw(/bbb/);
    // A maintainer publishing by hand has no GITHUB_SHA to compare against.
    expect(() => assertSameGitHead("doc-detective", "1.2.3", "aaa", undefined)).not.to.throw();
  });
});
