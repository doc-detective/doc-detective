// 4.x warnings about what 5.0 changes or removes (ADR 01147). Spawns the real
// CLI, because the contract is about the streams and the exit code.
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { commandWarnings, namesFolder, runResultWarnings } from "../dist/upgradeNotice.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const URL = "https://docs.doc-detective.com/docs/ci/upgrade-to-v5";
const ACTION_META = JSON.stringify({ dist_interface: "github-actions" });

function run(script, args, { env = {}, cwd, timeout = 60000 } = {}) {
  const { DOC_DETECTIVE_CONFIG, DOC_DETECTIVE_API, DOC_DETECTIVE_META, ...hostEnv } = process.env;
  return spawnSync(process.execPath, [path.resolve(script), ...args], {
    env: { ...hostEnv, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1", CI: "1", ...env },
    encoding: "utf8",
    cwd,
    timeout,
  });
}
const runCli = (args, opts) => run("bin/doc-detective.js", args, opts);

describe("upgrade warnings", function () {
  this.timeout(90000);
  let dir;
  const FAILING_SPEC = {
    tests: [{ steps: [{ httpRequest: { url: "http://127.0.0.1:1/nope", statusCodes: [200] } }] }],
  };
  const PASSING_SPEC = { tests: [{ steps: [{ wait: 10 }] }] };
  const spec = (name, body) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(body));
    return p;
  };
  const out = () => path.join(dir, "out.json");
  const empty = () => fs.mkdtempSync(path.join(dir, "empty-"));

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-upgrade-"));
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("failed specs", function () {
    it("warns on stderr and still exits 0 when exitOnFail wasn't set", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out()]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.include("exit 1").and.include(URL);
      expect(r.stdout).to.not.include(URL);
    });

    it("stays quiet with --exit-on-fail, and exits 1", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--exit-on-fail"]);
      expect(r.status).to.equal(1);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet with --no-exit-on-fail", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--no-exit-on-fail"]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet with exitOnFail set in a config file", function () {
      const config = spec("config.json", { exitOnFail: false });
      const r = runCli(["--config", config, "--input", spec("f.spec.json", FAILING_SPEC), "--output", out()]);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet at logLevel silent", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out(), "--logLevel", "silent"]);
      expect(r.stderr).to.not.include(URL);
    });

    it("stays quiet in the Action's legacy path", function () {
      const r = runCli(["--input", spec("f.spec.json", FAILING_SPEC), "--output", out()], {
        env: { DOC_DETECTIVE_META: ACTION_META },
      });
      expect(r.status).to.equal(0);
      expect(r.stderr).to.not.include(URL);
    });
  });

  it("a passing run with a results file stays quiet", function () {
    const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out()]);
    expect(r.status).to.equal(0);
    expect(r.stderr).to.not.include(URL);
  });

  describe("a run that tested nothing", function () {
    it("warns and still exits 0, even with --exit-on-fail", function () {
      for (const flags of [[], ["--exit-on-fail"]]) {
        const r = runCli(["--input", empty(), "--output", out(), ...flags]);
        expect(r.status).to.equal(0);
        expect(r.stderr).to.include("exit 2").and.include(URL);
      }
    });

    it("stays quiet with --no-exit-on-fail", function () {
      const r = runCli(["--input", empty(), "--output", out(), "--no-exit-on-fail"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("output that names a folder", function () {
    it("warns for a --output folder", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", dir]);
      expect(r.stderr).to.include("--output-dir").and.include(URL);
    });

    it("warns for an output folder from a config file", function () {
      const config = spec("config.json", { output: dir });
      const r = runCli(["--config", config, "--input", spec("p.spec.json", PASSING_SPEC)], { cwd: dir });
      expect(r.stderr).to.include("--output-dir");
    });

    it("stays quiet when output wasn't set", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC)], { cwd: dir });
      expect(r.stderr).to.not.include("--output-dir");
    });

    it("keeps --dry-run stdout parseable as JSON", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", dir, "--dry-run"]);
      expect(r.status).to.equal(0);
      expect(() => JSON.parse(r.stdout)).to.not.throw();
      expect(r.stderr).to.include("--output-dir");
    });
  });

  describe("--concurrent-runners", function () {
    it("warns with no value", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out(), "--concurrent-runners"]);
      expect(r.stderr).to.include("--concurrent-runners").and.include(URL);
    });

    it("stays quiet with a value", function () {
      const r = runCli(["--input", spec("p.spec.json", PASSING_SPEC), "--output", out(), "--concurrent-runners", "2"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("install commands", function () {
    const agents = ["--dry-run", "--agent", "claude", "--scope", "project"];

    it("warns on install-agents", function () {
      const r = runCli(["install-agents", ...agents]);
      expect(r.status).to.equal(0);
      expect(r.stderr).to.include("install agents").and.include(URL);
    });

    it("warns on -a and -s", function () {
      const r = runCli(["install", "agents", "--dry-run", "-a", "claude", "-s", "project"]);
      expect(r.stderr).to.include("--agent").and.include(URL);
    });

    it("warns on install --silent", function () {
      const r = runCli(["install", "status", "--silent"]);
      expect(r.stderr).to.include("--quiet").and.include(URL);
    });

    it("warns once, not once per nested command", function () {
      const r = runCli(["install", "status", "--silent"]);
      expect(r.stderr.split(URL).length - 1).to.equal(1);
    });

    it("stays quiet on the forms that keep working", function () {
      const a = runCli(["install", "agents", ...agents]);
      const b = runCli(["install", "status", "--quiet"]);
      expect(a.stderr + b.stderr).to.not.include(URL);
    });

    it("stays quiet at logLevel silent and in the Action", function () {
      const a = runCli(["install-agents", ...agents, "--logLevel", "silent"]);
      const b = runCli(["install-agents", ...agents], { env: { DOC_DETECTIVE_META: ACTION_META } });
      expect(a.stderr + b.stderr).to.not.include(URL);
    });

    it("stays quiet on --help", function () {
      const r = runCli(["install-agents", "--help"]);
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("removed bins", function () {
    it("warns on doc-detective-lsp, on stderr only", function () {
      // stdin closes right away, so the server exits on its own.
      const r = run("bin/doc-detective-lsp.js", ["--stdio"], { timeout: 5000 });
      expect(r.stderr).to.include("doc-detective lsp").and.include(URL);
      expect(r.stdout).to.not.include(URL);
    });

    it("warns on doc-detective-runner", function () {
      // Exits right away on the missing DD_* environment.
      const r = run("bin/runner-entrypoint.js", [], {
        env: { DD_RUN_TOKEN: "", DD_API_BASE: "", DD_RUN_ID: "" },
      });
      expect(r.stderr).to.include("doc-detective-runner").and.include(URL);
    });

    it("stays quiet in the Action", function () {
      const r = run("bin/doc-detective-lsp.js", ["--stdio"], { env: { DOC_DETECTIVE_META: ACTION_META }, timeout: 5000 });
      expect(r.stderr).to.not.include(URL);
    });
  });

  describe("helpers", function () {
    it("namesFolder: trailing slash, existing folder, or no extension", function () {
      expect(namesFolder("results/", path.resolve("results"))).to.equal(true);
      expect(namesFolder(dir, dir)).to.equal(true);
      expect(namesFolder("results", path.resolve("results"))).to.equal(true);
      expect(namesFolder("results.json", path.resolve("results.json"))).to.equal(false);
      expect(namesFolder("junit.xml", path.resolve("junit.xml"))).to.equal(false);
      expect(namesFolder(undefined, path.resolve("."))).to.equal(false);
    });

    it("commandWarnings doesn't take a flag's value for a command", function () {
      expect(commandWarnings(["install", "status"], ["install", "status", "--cache-dir", "-a"], false)).to.deep.equal([]);
      expect(commandWarnings(["install", "agents"], ["install", "agents", "--agent", "claude"], false)).to.deep.equal([]);
      expect(commandWarnings(["install", "agents"], ["install", "agents", "-sy", "project"], false)).to.have.length(1);
      // Only the agents command has -a and -s.
      expect(commandWarnings([], ["-a"], false)).to.deep.equal([]);
    });

    it("runResultWarnings counts a zero-spec summary as nothing tested", function () {
      const summary = (fail = 0, pass = 0) => ({ summary: { specs: { pass, fail, warning: 0, skipped: 0 } } });
      expect(runResultWarnings(undefined, false, null)).to.have.length(1);
      expect(runResultWarnings(undefined, false, summary())).to.have.length(1);
      expect(runResultWarnings(undefined, false, summary(0, 1))).to.deep.equal([]);
      expect(runResultWarnings(undefined, true, summary(1))).to.have.length(1);
      expect(runResultWarnings(true, true, summary(1))).to.deep.equal([]);
      expect(runResultWarnings(true, false, null)).to.have.length(1);
      expect(runResultWarnings(false, false, null)).to.deep.equal([]);
      // A malformed summary isn't evidence of an empty run.
      expect(runResultWarnings(undefined, false, {})).to.deep.equal([]);
    });
  });
});
