// The 5.0 CLI contract (ADR 01146), asserted through the real bin: exit code,
// stdout, stderr, and escape sequences. Each later step of the rollout adds rows.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "doc-detective.js");
const ESC = /\x1b/;

describe("CLI contract", function () {
  this.timeout(60000);
  let cwd;

  const writeSpec = (name, step) =>
    fs.writeFileSync(
      path.join(cwd, name),
      JSON.stringify({ specId: name, tests: [{ testId: `${name}-t`, steps: [step] }] })
    );

  function run(args, { env = {}, input } = {}) {
    const baseEnv = { ...process.env };
    for (const key of ["CI", "NO_COLOR", "FORCE_COLOR", "DEBUG", "DOC_DETECTIVE_DEBUG"]) delete baseEnv[key];
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      input: input ?? "",
      env: {
        ...baseEnv,
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
        ...env,
      },
    });
  }

  beforeEach(function () {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cli-contract-"));
    writeSpec("pass.spec.json", { runShell: "echo hi" });
    writeSpec("fail.spec.json", { runShell: "exit 3" });
  });

  afterEach(function () {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  describe("command layout", function () {
    it("runs tests on a bare invocation", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout + r.stderr).to.match(/passed/i);
    });

    for (const command of ["run", "runTests", "runtests"]) {
      it(`runs tests through \`${command}\``, function () {
        const r = run([command, "-i", "pass.spec.json"]);
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout + r.stderr).to.match(/passed/i);
      });
    }

    it("takes positional inputs on `run`, combined with --input", function () {
      const r = run(["run", "pass.spec.json", "-i", "fail.spec.json", "-n"]);
      expect(r.status, r.stderr).to.equal(0);
      const plan = JSON.parse(r.stdout);
      expect(plan.config.input).to.have.lengthOf(2);
    });

    it("keeps bare words free for subcommands", function () {
      const r = run(["pass.spec.json"]);
      expect(r.status).to.not.equal(0);
    });

    it("rejects the removed install-agents alias", function () {
      expect(run(["install-agents"]).status).to.not.equal(0);
    });

    it("ships one executable", function () {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      expect(Object.keys(pkg.bin)).to.deep.equal(["doc-detective"]);
    });

    it("hides the runner subcommand from help, but keeps it callable", function () {
      expect(run(["--help"]).stdout).to.not.match(/^\s*runner\b/m);
      expect(run(["runner", "--help"]).status).to.equal(0);
    });

    it("keeps `-s` for --spec only", function () {
      const r = run(["install", "agents", "-s", "global", "--agent", "claude", "--yes", "--dry-run"]);
      expect(r.status).to.not.equal(0);
      expect(r.stderr).to.include("unknown option '-s'");
    });

    it("accepts global flags before and after a subcommand", function () {
      expect(run(["-q", "install", "status", "--cache-dir", "cc"]).status).to.equal(0);
      expect(run(["install", "status", "-q", "--cache-dir", "cc"]).status).to.equal(0);
    });

    it("gives `install status` only the options it uses", function () {
      expect(run(["install", "status", "--yes"]).status).to.not.equal(0);
    });
  });

  describe("deprecated arguments", function () {
    const deprecated = [
      { args: ["runTests", "-i", "pass.spec.json"], replacement: /use `?run/ },
      { args: ["runtests", "-i", "pass.spec.json"], replacement: /use `?run/ },
      { args: ["--logLevel", "info", "-i", "pass.spec.json"], replacement: /use `?--log-level/ },
      { args: ["-e", "-i", "pass.spec.json"], replacement: /now the default/ },
      { args: ["--exit-on-fail", "-i", "pass.spec.json"], replacement: /now the default/ },
    ];
    for (const { args, replacement } of deprecated) {
      it(`\`${args[0]}\` still works, and warns on stderr`, function () {
        const r = run(args);
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stderr).to.match(/deprecated/i);
        expect(r.stderr).to.match(replacement);
        expect(r.stdout).to.not.match(/deprecated/i);
      });
    }

    it("hides the warning with -q", function () {
      const r = run(["runTests", "-q", "-i", "pass.spec.json"]);
      expect(r.stderr).to.not.match(/deprecated/i);
    });

    it("labels each one in help", function () {
      const help = run(["--help"]).stdout.replace(/\s+/g, " ");
      for (const label of ["runTests", "runtests", "--logLevel", "--exit-on-fail"]) {
        expect(help).to.match(new RegExp(`${label}.*?\\[deprecated`));
      }
    });
  });

  describe("commands printed in the final book drafts", function () {
    it("`--version` prints a bare version on stdout", function () {
      const r = run(["--version"]);
      expect(r.status).to.equal(0);
      expect(r.stdout.trim()).to.match(/^\d+\.\d+\.\d+/);
    });

    it("`--input <path>` runs that path", function () {
      const r = run(["--input", "pass.spec.json"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout + r.stderr).to.match(/passed/i);
    });
  });

  it("is free of escape sequences when piped", function () {
    expect(run(["--help"]).stdout).to.not.match(ESC);
  });
});
