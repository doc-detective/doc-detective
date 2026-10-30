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
  });
});
