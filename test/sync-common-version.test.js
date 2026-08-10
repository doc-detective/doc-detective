import { buildSyncCommands } from "../scripts/sync-common-version.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("scripts/sync-common-version buildSyncCommands", function () {
  it("stamps the version onto the src/common workspace first", function () {
    const [versionStep] = buildSyncCommands("4.37.5");
    expect(versionStep.args).to.deep.equal([
      "version",
      "4.37.5",
      "--workspace",
      "src/common",
      "--no-git-tag-version",
      "--allow-same-version",
    ]);
    // Runs from the repo root so `--workspace` resolves.
    expect(versionStep.cwd).to.equal(".");
  });

  it("regenerates the src/common lockfile after stamping the version", function () {
    const steps = buildSyncCommands("4.37.5");
    expect(steps).to.have.lengthOf(2);
    const lockStep = steps[1];
    expect(lockStep.args[0]).to.equal("install");
    expect(lockStep.args).to.include("--package-lock-only");
    // Must run inside the workspace so it rewrites that package's own lockfile.
    expect(lockStep.cwd).to.equal("src/common");
  });

  it("passes --no-workspaces so the ROOT lockfile is not hijacked", function () {
    // Without this flag npm walks up, discovers `workspaces: ["src/common"]` in
    // the root manifest, and rewrites the ROOT package-lock.json while leaving
    // src/common/package-lock.json untouched -- the exact inverse of the intent.
    // @semantic-release/git commits both files, so the regression would ship a
    // silently corrupted root lockfile. Verified against npm 10 (node 22, the
    // release job's runtime).
    const lockStep = buildSyncCommands("4.37.5")[1];
    expect(lockStep.args).to.include("--no-workspaces");
  });

  it("keeps the lockfile rebuild side-effect free and quiet", function () {
    // --ignore-scripts: never run src/common lifecycle hooks during a release.
    // --package-lock-only: resolve the tree without materializing node_modules.
    const lockStep = buildSyncCommands("4.37.5")[1];
    expect(lockStep.args).to.include("--ignore-scripts");
    expect(lockStep.args).to.include("--no-audit");
    expect(lockStep.args).to.include("--no-fund");
  });

  it("threads any valid semver through unchanged, including prereleases", function () {
    // Prerelease versions reach this script on the `next` and `feat/**` channels.
    const [versionStep] = buildSyncCommands("5.0.0-next.3");
    expect(versionStep.args).to.include("5.0.0-next.3");
  });
});
