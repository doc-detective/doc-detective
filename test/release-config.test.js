import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import semver from "semver";
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

describe(".releaserc.json branches", function () {
  const rc = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".releaserc.json"), "utf8"));

  it("no channel parses as a semver range", function () {
    // npm rejects those as dist-tags, and publish-staged-release.js refuses them.
    // A maintenance branch's channel defaults to its name, so 4.x has to set one.
    for (const branch of rc().branches) {
      if (typeof branch === "string") continue;
      const channel = branch.channel ?? (branch.range ? branch.name : undefined);
      if (channel === undefined) continue;
      expect(semver.validRange(channel), `channel of ${branch.name}`).to.equal(null);
    }
  });

  it("publishes 4.x maintenance releases on release-4.x", function () {
    expect(rc().branches).to.deep.include({ name: "4.x", range: "4.x", channel: "release-4.x" });
  });

  it("release.yml runs on 4.x and passes ALLOW_MAJOR_RELEASE from a repository variable", async function () {
    const { parse } = await import("yaml");
    const wf = parse(fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/release.yml"), "utf8"));
    expect(wf.on.push.branches).to.include("4.x");
    const steps = Object.values(wf.jobs).flatMap((job) => job.steps ?? []);
    const release = steps.find((step) => step.id === "sr");
    expect(release.env.ALLOW_MAJOR_RELEASE).to.equal("${{ vars.ALLOW_MAJOR_RELEASE }}");
  });
});

describe(".releaserc.json release types", function () {
  const rc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".releaserc.json"), "utf8"));
  // semantic-release hands each plugin the top-level options overlaid with its own.
  const optionsOf = (name) => {
    const { plugins, ...shared } = rc;
    const entry = plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
    return { ...shared, ...(Array.isArray(entry) ? entry[1] : {}) };
  };
  const context = (messages) => ({
    commits: messages.map((message, i) => ({ hash: `${i}`.padStart(40, "a"), message })),
    logger: { log() {} },
    cwd: REPO_ROOT,
  });
  const releaseType = async (...messages) => {
    const { analyzeCommits } = await import("@semantic-release/commit-analyzer");
    return analyzeCommits(optionsOf("@semantic-release/commit-analyzer"), context(messages));
  };

  it("cuts a major for a `!` header with no BREAKING CHANGE footer", async function () {
    // The default (angular) parser can't read the `!`, so the header matched no
    // rule at all and `feat!:` cut no release.
    for (const message of ["feat!: x", "refactor(agents)!: x", "chore!: x", "perf!: x"]) {
      expect(await releaseType(message), message).to.equal("major");
    }
  });

  it("cuts a major for a BREAKING CHANGE footer, whatever the type", async function () {
    // A custom rule that matches hides the default breaking rule, so the perf
    // rule turned a breaking perf commit into no release.
    for (const type of ["feat", "fix", "perf", "docs"]) {
      expect(await releaseType(`${type}: x\n\nBREAKING CHANGE: y`), type).to.equal("major");
    }
  });

  it("keeps the release type of every other commit", async function () {
    expect(await releaseType("feat: x")).to.equal("minor");
    expect(await releaseType("fix: x")).to.equal("patch");
    for (const type of ["perf", "docs", "chore", "ci", "build", "style", "test", "refactor"]) {
      expect(await releaseType(`${type}: x`), type).to.equal(null);
    }
  });

  it("cuts nothing for a breaking commit that a later commit reverts", async function () {
    // Newest first, as semantic-release lists them.
    const reverted = "1".padStart(40, "a");
    expect(await releaseType(`Revert "feat!: x"\n\nThis reverts commit ${reverted}.`, "feat!: x")).to.equal(null);
  });

  it("writes notes that list a `!` header as a breaking change", async function () {
    // Also guards the preset's major: one built for a newer
    // conventional-changelog-writer than the notes generator ships throws here.
    const { generateNotes } = await import("@semantic-release/release-notes-generator");
    const notes = await generateNotes(optionsOf("@semantic-release/release-notes-generator"), {
      ...context(["feat!: drop the old flag", "fix: y"]),
      lastRelease: { gitTag: "v1.0.0" },
      nextRelease: { gitTag: "v2.0.0", version: "2.0.0" },
      options: { repositoryUrl: "https://github.com/doc-detective/doc-detective" },
    });
    expect(notes).to.match(/BREAKING CHANGES\n+\* drop the old flag/);
    expect(notes).to.match(/### Bug Fixes\n+\* y /);
  });
});

describe("major-release guard", function () {
  const script = path.join(REPO_ROOT, "scripts/verify-major-release.js");
  const guard = (args, allow) => {
    const { ALLOW_MAJOR_RELEASE, ...env } = process.env;
    return spawnSync(process.execPath, [script, ...args], {
      env: allow === undefined ? env : { ...env, ALLOW_MAJOR_RELEASE: allow },
      encoding: "utf8",
    });
  };

  it("fails a major on a release branch with the variable unset", function () {
    const r = guard(["major", "release"]);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.include("ALLOW_MAJOR_RELEASE");
  });

  it("fails a major for any value but true", function () {
    expect(guard(["major", "release"], "false").status).to.equal(1);
    expect(guard(["major", "release"], "").status).to.equal(1);
    expect(guard(["major", "release"], "1").status).to.equal(1);
  });

  it("allows a major with ALLOW_MAJOR_RELEASE=true, in any case and trimmed", function () {
    for (const allow of ["true", "TRUE", "True", " true "]) {
      expect(guard(["major", "release"], allow).status, allow).to.equal(0);
    }
  });

  it("fails closed with a usage line when an argument is missing", function () {
    for (const args of [[], ["minor"]]) {
      const r = guard(args, "true");
      expect(r.status, args.join(" ")).to.equal(1);
      expect(r.stderr).to.include("Usage: verify-major-release.js <release-type> <release|prerelease>");
    }
  });

  it("exempts prerelease channels", function () {
    expect(guard(["major", "prerelease"]).status).to.equal(0);
  });

  it("allows a non-major", function () {
    for (const type of ["minor", "patch"]) {
      expect(guard([type, "release"]).status).to.equal(0);
    }
  });

  it("is wired as a verifyReleaseCmd that renders the type and the kind of branch", async function () {
    const rc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".releaserc.json"), "utf8"));
    const cmd = rc.plugins
      .map((p) => (Array.isArray(p) ? p[1]?.verifyReleaseCmd : undefined))
      .find(Boolean);
    expect(cmd, "verifyReleaseCmd in .releaserc.json").to.be.a("string");
    // Rendered the way @semantic-release/exec does, with lodash's template.
    const { template } = await import("lodash-es");
    const render = (branch) => template(cmd)({ nextRelease: { type: "major" }, branch });
    expect(render({ name: "main" })).to.equal("node scripts/verify-major-release.js major release");
    expect(render({ name: "feat/v5-rc", prerelease: "v5-rc" })).to.equal(
      "node scripts/verify-major-release.js major prerelease"
    );
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

describe("promote.yml prerelease guard", function () {
  const workflow = async () => {
    const { parse } = await import("yaml");
    return parse(fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/promote.yml"), "utf8"));
  };

  it("skips the promote job for a prerelease version, from every trigger", async function () {
    // A dispatched 5.0.0-v5-rc.12 passed the semver.gt guard and would have moved
    // @latest to an RC. Both triggers (workflow_call, workflow_dispatch) name the
    // version `inputs.version`.
    const wf = await workflow();
    expect(Object.keys(wf.on).sort()).to.deep.equal(["workflow_call", "workflow_dispatch"]);
    expect(wf.on.workflow_call.inputs.version.type).to.equal("string");
    expect(wf.on.workflow_dispatch.inputs.version.type).to.equal("string");
    expect(wf.jobs.promote.if).to.equal("${{ !contains(inputs.version, '-') }}");
  });

  it("still smoke-tests a prerelease", async function () {
    expect((await workflow()).jobs["smoke-test"].if).to.equal(undefined);
  });

  it("skips Docker through needs, with no status function to override the skip", async function () {
    const docker = (await workflow()).jobs["build-docker-image"];
    expect([docker.needs].flat()).to.include("promote");
    expect(String(docker.if ?? "")).to.not.match(/always\(\)|cancelled\(\)|failure\(\)/);
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
