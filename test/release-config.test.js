import path from "node:path";
import fs from "node:fs";
import { REPO_ROOT } from "../scripts/reconcile-root-lockfile.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe(".releaserc.json publish wiring", function () {
  it("publishes during prepare, before @semantic-release/git commits and tags", function () {
    // semantic-release pushes the release commit and tag after prepare and
    // before publish. A failed publishCmd therefore left 4.38.2-4.41.3 tagged
    // but never on npm, and no rerun could publish them (ADR 01145).
    const rc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".releaserc.json"), "utf8"));
    const names = rc.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    const opts = rc.plugins.map((p) => (Array.isArray(p) ? (p[1] ?? {}) : {}));
    const runs = (cmd, script) => new RegExp(script).test(cmd ?? "");
    const publishIdx = opts.findIndex((o) => runs(o.prepareCmd, "publish-staged-release"));
    const reconcileIdx = opts.findIndex((o) => runs(o.prepareCmd, "reconcile-root-lockfile"));
    const gitIdx = names.indexOf("@semantic-release/git");

    expect(
      opts.some((o) => runs(o.publishCmd, "publish-staged-release")),
      "publish must not run as a publishCmd"
    ).to.be.false;
    expect(publishIdx, "publish prepareCmd must be wired in .releaserc.json").to.be.greaterThan(-1);
    expect(reconcileIdx, "reconcile prepareCmd must be wired in .releaserc.json").to.be.greaterThan(-1);
    expect(gitIdx, "@semantic-release/git must be present in .releaserc.json").to.be.greaterThan(-1);
    // After the reconcile, so a broken lockfile stops the release before
    // anything reaches npm; before git, so a failed publish pushes nothing.
    expect(publishIdx).to.be.greaterThan(reconcileIdx);
    expect(publishIdx).to.be.lessThan(gitIdx);
    // A version that's partly on npm gets tagged anyway; this publishCmd then
    // fails the release so it can't report success.
    expect(opts[publishIdx].publishCmd).to.match(/publish-guard\.js/);
  });
});

describe("promote.yml smoke-test npm wait", function () {
  it("waits long enough for npm to show a fresh publish", async function () {
    // 4.41.5 appeared on npm 8s after the 2-minute wait gave up, failing the release.
    const { parse } = await import("yaml");
    const wf = parse(fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/promote.yml"), "utf8"));
    const job = wf.jobs["smoke-test"];
    const run = job.steps.find((s) => s.id === "resolve").run;
    const attempts = Number(run.match(/seq 1 (\d+)/)[1]);
    // Only the sleeps between checks count; one after the last check is wasted.
    const waitSeconds = (attempts - 1) * Number(run.match(/sleep (\d+)/)[1]);
    expect(run).to.match(new RegExp(`\\[ "\\$i" -lt ${attempts} \\]`));
    expect(waitSeconds).to.be.at.least(600);
    // The smoke tests themselves take about a minute; leave them room.
    expect(job["timeout-minutes"] * 60 - waitSeconds).to.be.at.least(300);
  });
});

describe("container:test script", function () {
  it("skips the root mocha config, whose hooks import dist/", function () {
    // Release and manual Docker builds never run `npm run build`, so loading
    // test/hooks.js crashed the 4.41.5 image test before any test ran. PR builds
    // do build dist/, so only a release could catch it.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["container:test"]).to.match(/^mocha --no-config --exit /);
  });
});
