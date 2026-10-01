import path from "node:path";
import fs from "node:fs";
import { buildReconcileCommands, REPO_ROOT } from "../scripts/reconcile-root-lockfile.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const ROOT = path.join(path.sep, "repo");

describe("scripts/reconcile-root-lockfile buildReconcileCommands", function () {
  it("reconciles twice before verifying", function () {
    const steps = buildReconcileCommands(ROOT);
    expect(steps).to.have.lengthOf(3);
    // TWO passes, per docs/maintenance/release-operations.md: the second drops
    // the platform-gated "extraneous" entries a single pass leaves behind,
    // which otherwise fail `npm ci` with EBADPLATFORM on other OSes.
    for (const step of steps.slice(0, 2)) {
      expect(step.cmd).to.equal("npm");
      expect(step.cwd).to.equal(ROOT);
      expect(step.args[0]).to.equal("install");
      expect(step.args).to.include("--package-lock-only");
    }
  });

  it("ends with a non-mutating npm ci --dry-run backstop", function () {
    const verify = buildReconcileCommands(ROOT)[2];
    expect(verify.cmd).to.equal("npm");
    expect(verify.cwd).to.equal(ROOT);
    expect(verify.args.slice(0, 2)).to.deep.equal(["ci", "--dry-run"]);
    expect(verify.args).to.not.include("--package-lock-only");
  });

  it("keeps every step side-effect free and quiet", function () {
    for (const step of buildReconcileCommands(ROOT)) {
      expect(step.args).to.include("--ignore-scripts");
      expect(step.args).to.include("--no-audit");
      expect(step.args).to.include("--no-fund");
    }
  });

  it("never passes --no-workspaces (this operates on the root, not src/common)", function () {
    // The inverse of sync-common-version.js: there --no-workspaces is required
    // so npm rewrites src/common's own lockfile; here we want the workspace-
    // aware root resolution.
    for (const step of buildReconcileCommands(ROOT)) {
      expect(step.args).to.not.include("--no-workspaces");
    }
  });

  it("defaults to a repo root derived from the module, not process.cwd()", function () {
    expect(path.isAbsolute(REPO_ROOT)).to.equal(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "package.json"))).to.equal(true);
    expect(buildReconcileCommands()[0].cwd).to.equal(REPO_ROOT);
  });

  it("is wired as a prepareCmd AFTER @semantic-release/npm", function () {
    // Order is the whole point: a reconcile that runs before the npm plugin's
    // version stamp is invalidated by it, which is how 4.37.5 shipped a broken
    // root lockfile (#707). This asserts the wiring, not just the script.
    const rc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".releaserc.json"), "utf8"));
    const names = rc.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    const npmIdx = names.indexOf("@semantic-release/npm");
    const gitIdx = names.indexOf("@semantic-release/git");
    const reconcileIdx = rc.plugins.findIndex(
      (p) => Array.isArray(p) && /reconcile-root-lockfile/.test(p[1]?.prepareCmd ?? "")
    );
    // Assert presence FIRST. indexOf returns -1 for a missing plugin, which
    // would turn `greaterThan(npmIdx)` into `greaterThan(-1)` -- vacuously true
    // for any wiring, including one placed before npm. Without these the guard
    // passes on the exact defect it exists to catch.
    expect(npmIdx, "@semantic-release/npm must be present in .releaserc.json").to.be.greaterThan(-1);
    expect(gitIdx, "@semantic-release/git must be present in .releaserc.json").to.be.greaterThan(-1);
    expect(reconcileIdx, "reconcile prepareCmd must be wired in .releaserc.json").to.be.greaterThan(-1);
    expect(reconcileIdx).to.be.greaterThan(npmIdx);
    expect(reconcileIdx).to.be.lessThan(gitIdx);
  });
});
