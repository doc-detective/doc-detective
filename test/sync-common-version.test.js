import path from "node:path";
import { buildSyncCommands, REPO_ROOT } from "../scripts/sync-common-version.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const ROOT = path.join(path.sep, "repo");

describe("scripts/sync-common-version buildSyncCommands", function () {
  it("stamps the version onto the src/common workspace first", function () {
    const [versionStep] = buildSyncCommands("4.37.5", ROOT);
    expect(versionStep.cmd).to.equal("npm");
    expect(versionStep.args).to.deep.equal([
      "version",
      "4.37.5",
      "--workspace",
      "src/common",
      "--no-git-tag-version",
      "--allow-same-version",
    ]);
    // Runs from the repo root so `--workspace` resolves.
    expect(versionStep.cwd).to.equal(ROOT);
  });

  it("regenerates the src/common lockfile after stamping the version", function () {
    const steps = buildSyncCommands("4.37.5", ROOT);
    const lockStep = steps[1];
    expect(lockStep.cmd).to.equal("npm");
    expect(lockStep.args[0]).to.equal("install");
    expect(lockStep.args).to.include("--package-lock-only");
    // Must run inside the workspace so it rewrites that package's own lockfile.
    expect(lockStep.cwd).to.equal(path.join(ROOT, "src", "common"));
  });

  it("passes --no-workspaces so the ROOT lockfile is not hijacked", function () {
    // Without this flag npm walks up, discovers `workspaces: ["src/common"]` in
    // the root manifest, and rewrites the ROOT package-lock.json while leaving
    // src/common/package-lock.json untouched -- the exact inverse of the intent.
    // @semantic-release/git commits both files, so the regression would ship a
    // silently corrupted root lockfile. Verified against npm 10 (node 22, the
    // release job's runtime).
    const lockStep = buildSyncCommands("4.37.5", ROOT)[1];
    expect(lockStep.args).to.include("--no-workspaces");
  });

  it("keeps the lockfile rebuild side-effect free and quiet", function () {
    // --ignore-scripts: never run src/common lifecycle hooks during a release.
    // --package-lock-only: resolve the tree without materializing node_modules.
    const lockStep = buildSyncCommands("4.37.5", ROOT)[1];
    expect(lockStep.args).to.include("--ignore-scripts");
    expect(lockStep.args).to.include("--no-audit");
    expect(lockStep.args).to.include("--no-fund");
  });

  it("reconciles the ROOT lockfile twice, because the version stamp corrupts it", function () {
    // `npm version --workspace` (step 1) rewrites the root lockfile as a side
    // effect and the tree it emits does not install -- measured on npm 10, a
    // healthy lockfile goes to EBADPLATFORM from the stamp alone. That is what
    // shipped in 4.37.4 and broke `npm ci` on main (#705).
    //
    // TWO passes, per docs/maintenance/release-operations.md: the second drops
    // the platform-gated "extraneous" entries a single pass leaves behind.
    // Dropping to one pass silently reintroduces the EBADPLATFORM failure on
    // other OSes, so the count is asserted.
    const steps = buildSyncCommands("4.37.5", ROOT);
    const reconcile = steps.slice(2, 4);
    expect(reconcile).to.have.lengthOf(2);
    for (const step of reconcile) {
      expect(step.cmd).to.equal("npm");
      expect(step.cwd).to.equal(ROOT);
      expect(step.args).to.include("--package-lock-only");
      expect(step.args).to.not.include("--no-workspaces");
    }
  });

  it("verifies the ROOT lockfile last, without mutating it", function () {
    const steps = buildSyncCommands("4.37.5", ROOT);
    expect(steps).to.have.lengthOf(5);
    const verifyStep = steps[4];
    expect(verifyStep.cmd).to.equal("npm");
    expect(verifyStep.args.slice(0, 2)).to.deep.equal(["ci", "--dry-run"]);
    expect(verifyStep.cwd).to.equal(ROOT);
    // --dry-run is what makes this a backstop rather than another rebuild.
    expect(verifyStep.args).to.not.include("--package-lock-only");
  });

  it("threads any valid semver through unchanged, including prereleases", function () {
    // Prerelease versions reach this script on the `next` and `feat/**` channels.
    const [versionStep] = buildSyncCommands("5.0.0-next.3", ROOT);
    expect(versionStep.args).to.include("5.0.0-next.3");
  });

  it("defaults to a repo root derived from the module, not process.cwd()", function () {
    // Guards against a caller in a subdirectory silently targeting the wrong
    // tree. REPO_ROOT is absolute and resolves to the directory holding
    // package.json.
    expect(path.isAbsolute(REPO_ROOT)).to.equal(true);
    const [versionStep] = buildSyncCommands("4.37.5");
    expect(versionStep.cwd).to.equal(REPO_ROOT);
  });
});
