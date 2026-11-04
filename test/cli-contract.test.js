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
      expect(run(["--help"]).stdout).to.not.match(/^\s+runner\s{2,}/m);
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

  describe("exit codes", function () {
    const noFail = { exitOnFail: false, telemetry: { send: false }, autoUpdate: false };
    const rows = [
      { name: "all specs pass", args: ["-i", "pass.spec.json"], code: 0 },
      { name: "a spec fails", args: ["-i", "fail.spec.json"], code: 1 },
      { name: "a failing spec with --no-exit-on-fail", args: ["--no-exit-on-fail", "-i", "fail.spec.json"], code: 0 },
      { name: "an empty run", args: ["-i", "empty.md"], code: 2 },
      { name: "an empty run with --no-exit-on-fail", args: ["--no-exit-on-fail", "-i", "empty.md"], code: 0 },
      { name: "a missing input path", args: ["-i", "does-not-exist.md"], code: 2 },
      { name: "a filter matching nothing", args: ["-i", "pass.spec.json", "-t", "zzz"], code: 2 },
      { name: "an invalid spec", args: ["-i", "invalid.spec.json"], code: 2 },
      { name: "an invalid spec beside a valid one", args: ["run", "invalid.spec.json", "pass.spec.json"], code: 2 },
      { name: "an invalid spec with --no-exit-on-fail", args: ["--no-exit-on-fail", "-i", "invalid.spec.json"], code: 0 },
      { name: "an unknown flag", args: ["--nope"], code: 2 },
      { name: "a bare word", args: ["nope"], code: 2 },
      { name: "a missing flag value", args: ["-i"], code: 2 },
      { name: "a missing config file", args: ["-c", "nope.json"], code: 2 },
      { name: "an invalid --shell", args: ["--shell", "zsh", "-i", "pass.spec.json"], code: 2 },
      { name: "an invalid --verification", args: ["--verification", "always", "-i", "pass.spec.json"], code: 2 },
      { name: "an invalid --browser-fallback", args: ["--browser-fallback", "nope", "-i", "pass.spec.json"], code: 2 },
      { name: "an invalid --log-level", args: ["-l", "loud", "-i", "pass.spec.json"], code: 2 },
      { name: "an invalid --concurrent-runners", args: ["--concurrent-runners", "abc", "-i", "pass.spec.json"], code: 2 },
      { name: "--concurrent-runners with no value", args: ["-i", "pass.spec.json", "--concurrent-runners"], code: 2 },
      { name: "an unknown reporter", args: ["-r", "bogus", "-i", "pass.spec.json"], code: 2 },
      { name: "a folder as --output", args: ["-o", ".", "-i", "pass.spec.json"], code: 2 },
      { name: "an unknown install asset", args: ["install", "nope"], code: 2 },
      { name: "an unknown runtime package", args: ["install", "runtime", "nope", "--dry-run", "--cache-dir", "cc"], code: 2 },
      { name: "a refused android install", args: ["install", "android", "--cache-dir", "cc"], code: 2 },
      { name: "help", args: ["--help"], code: 0 },
      { name: "version", args: ["--version"], code: 0 },
    ];
    for (const { name, args, code } of rows) {
      it(`${code} for ${name}`, function () {
        fs.writeFileSync(path.join(cwd, "empty.md"), "# Nothing to test\n");
        fs.writeFileSync(
          path.join(cwd, "invalid.spec.json"),
          JSON.stringify({ tests: [{ steps: [{ nope: "x" }] }] })
        );
        const r = run(args);
        expect(r.status, r.stdout + r.stderr).to.equal(code);
      });
    }

    it("runs nothing when any spec is invalid", function () {
      fs.writeFileSync(
        path.join(cwd, "invalid.spec.json"),
        JSON.stringify({ tests: [{ steps: [{ nope: "x" }] }] })
      );
      const marker = path.join(cwd, "ran.txt");
      writeSpec("marks.spec.json", { runShell: "echo ran > ran.txt" });
      const r = run(["run", "invalid.spec.json", "marks.spec.json"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("invalid.spec.json");
      expect(fs.existsSync(marker)).to.equal(false);
    });

    it("doesn't count a JSON file without tests as an invalid spec", function () {
      fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "x" }));
      const r = run(["run", "package.json", "pass.spec.json"]);
      expect(r.status, r.stderr).to.equal(0);
    });

    it("exits 2 from an invalid config with --no-exit-on-fail too", function () {
      fs.writeFileSync(path.join(cwd, "bad.json"), JSON.stringify({ logLevel: "loud" }));
      const r = run(["--no-exit-on-fail", "-c", "bad.json"], { env: { DOC_DETECTIVE_CONFIG: JSON.stringify(noFail) } });
      expect(r.status).to.equal(2);
    });

    it("still writes results when a spec fails", function () {
      const r = run(["-i", "fail.spec.json", "-o", "results.json"]);
      expect(r.status).to.equal(1);
      const results = JSON.parse(fs.readFileSync(path.join(cwd, "results.json"), "utf8"));
      expect(results.summary.specs.fail).to.equal(1);
    });
  });

  describe("output paths", function () {
    it("writes --output as the exact results file, overwriting it", function () {
      fs.writeFileSync(path.join(cwd, "results.json"), "old");
      expect(run(["-i", "pass.spec.json", "-o", "results.json"]).status).to.equal(0);
      expect(JSON.parse(fs.readFileSync(path.join(cwd, "results.json"), "utf8")).summary.specs.pass).to.equal(1);
      expect(fs.readdirSync(cwd).filter((f) => /^results-\d/.test(f))).to.deep.equal([]);
    });

    it("points a folder given to --output at --output-dir", function () {
      const r = run(["-o", ".", "-i", "pass.spec.json"]);
      expect(r.stderr).to.include("--output-dir");
    });

    it("writes run folders under --output-dir", function () {
      expect(run(["-i", "pass.spec.json", "--output-dir", "artifacts"]).status).to.equal(0);
      expect(fs.existsSync(path.join(cwd, "artifacts", ".doc-detective", "runs"))).to.equal(true);
    });

    it("leaves no results file in the current directory by default", function () {
      expect(run(["-i", "pass.spec.json"]).status).to.equal(0);
      expect(fs.readdirSync(cwd).filter((f) => f.startsWith("testResults"))).to.deep.equal([]);
      expect(fs.existsSync(path.join(cwd, ".doc-detective", "runs"))).to.equal(true);
    });

    it("isn't broken by a stale null results file from 4.x", function () {
      fs.writeFileSync(path.join(cwd, "testResults-1.json"), "null");
      const r = run(["run", "."]);
      expect(r.stderr).to.not.include("Object is required");
    });
  });

  describe("stdin", function () {
    it("reads a spec from `-i -`", function () {
      const r = run(["-i", "-"], {
        input: JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }),
      });
      expect(r.status, r.stdout + r.stderr).to.equal(0);
      expect(r.stdout).to.match(/passed/i);
    });

    it("reads a spec from `run -`", function () {
      const r = run(["run", "-"], {
        input: "tests:\n  - steps:\n      - runShell: echo hi\n",
      });
      expect(r.status, r.stdout + r.stderr).to.equal(0);
    });

    it("cleans up after reading stdin", function () {
      run(["-i", "-"], { input: JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] }) });
      const leftovers = fs.readdirSync(cwd).filter((f) => f.startsWith("stdin"));
      expect(leftovers).to.deep.equal([]);
    });
  });

  describe("streams", function () {
    it("keeps logs off stdout", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.stdout).to.not.match(/Resolving test specs|Running test specs/);
      expect(r.stderr).to.match(/Running test specs/);
    });

    it("drops level labels by default", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.stderr).to.not.match(/\((INFO|WARNING|DEBUG)\)/);
      expect(run(["-i", "does-not-exist.md", "--no-exit-on-fail"]).stderr).to.match(/^Warning: /m);
    });

    it("restores labels and adds timestamps with -d", function () {
      const r = run(["-d", "-i", "pass.spec.json"]);
      expect(r.stderr).to.match(/\d{4}-\d{2}-\d{2}T\S+ \(INFO\)/);
      expect(r.status).to.equal(0);
    });

    it("prints no sponsor banner", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.stdout + r.stderr).to.not.match(/Thanks for using|####/);
    });

    it("ends stdout with a one-line verdict", function () {
      const pass = run(["-i", "pass.spec.json"]).stdout.trim().split("\n").pop();
      expect(pass).to.match(/1 of 1 test passed/);
      const fail = run(["-i", "fail.spec.json"]).stdout.trim().split("\n").pop();
      expect(fail).to.match(/1 of 1 test failed/);
    });

    it("prints progress as plain lines when not on a terminal", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.stderr).to.match(/PASS pass\.spec\.json\/pass\.spec\.json-t/);
      expect(r.stderr).to.not.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });

    it("prints a result path relative to the current directory", function () {
      const r = run(["-i", "pass.spec.json"]);
      expect(r.stdout + r.stderr).to.not.include(cwd);
    });

    for (const args of [["--json"], ["-o", "-"]]) {
      it(`prints only one JSON document on stdout with ${args.join(" ")}`, function () {
        const r = run(["-i", "pass.spec.json", ...args]);
        expect(r.status, r.stderr).to.equal(0);
        expect(JSON.parse(r.stdout).summary.specs.pass).to.equal(1);
      });
    }

    it("keeps the exit code with --json", function () {
      const r = run(["-i", "fail.spec.json", "--json"]);
      expect(r.status).to.equal(1);
      expect(JSON.parse(r.stdout).summary.specs.fail).to.equal(1);
    });

    for (const level of ["silent", "error", "warning", "info", "debug"]) {
      it(`keeps --dry-run stdout parseable at -l ${level}`, function () {
        const r = run(["-i", "pass.spec.json", "-n", "-l", level]);
        expect(r.status, r.stderr).to.equal(0);
        expect(JSON.parse(r.stdout).specs).to.be.an("array");
      });
    }

    it("prints one tab-separated line per test with --plain", function () {
      const r = run(["-i", "pass.spec.json", "--plain"]);
      expect(r.status, r.stderr).to.equal(0);
      const lines = r.stdout.trim().split("\n");
      expect(lines).to.have.lengthOf(1);
      expect(lines[0].split("\t").slice(0, 3)).to.deep.equal(["PASS", "pass.spec.json", "pass.spec.json-t"]);
    });

    it("prints only a verdict with -q", function () {
      const r = run(["-i", "pass.spec.json", "-q"]);
      expect(r.status).to.equal(0);
      expect(r.stdout.trim().split("\n")).to.have.lengthOf(1);
      expect(r.stdout).to.match(/passed/);
      expect(r.stderr.trim()).to.equal("");
    });

    it("prints nothing with -l silent", function () {
      const r = run(["-i", "pass.spec.json", "-l", "silent"]);
      expect(r.status).to.equal(0);
      expect(r.stdout + r.stderr).to.equal("");
    });

    it("prints JSON from `debug --json`", function () {
      const r = run(["debug", "--json"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout)).to.be.an("object");
    });

    it("prints JSON from `install status --json`", function () {
      const r = run(["install", "status", "--json", "--cache-dir", "cc"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout)).to.be.an("array");
    });

    it("prints one JSON document from `install all --dry-run --json`", function () {
      const r = run(["install", "all", "--dry-run", "--json", "--cache-dir", "cc"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout)).to.be.an("array");
    });

    it("prints one JSON document from `install agents --dry-run --json`", function () {
      const r = run(["install", "agents", "--agent", "claude", "--scope", "project", "--yes", "--dry-run", "--json"]);
      expect(r.status, r.stderr).to.equal(0);
      expect(JSON.parse(r.stdout)).to.be.an("array");
    });
  });

  describe("color", function () {
    const failing = ["-i", "fail.spec.json"];
    it("is off when piped", function () {
      const r = run(failing);
      expect(r.stdout).to.not.match(ESC);
      expect(r.stderr).to.not.match(ESC);
    });
    it("is forced on by FORCE_COLOR", function () {
      expect(run(failing, { env: { FORCE_COLOR: "1" } }).stdout).to.match(ESC);
    });
    it("is forced on by --color", function () {
      expect(run([...failing, "--color"]).stdout).to.match(ESC);
    });
    it("is forced off by --no-color, even with FORCE_COLOR", function () {
      expect(run([...failing, "--no-color"], { env: { FORCE_COLOR: "1" } }).stdout).to.not.match(ESC);
    });
    it("is forced off by DOC_DETECTIVE_NO_COLOR, even with FORCE_COLOR", function () {
      const r = run(failing, { env: { FORCE_COLOR: "1", DOC_DETECTIVE_NO_COLOR: "1" } });
      expect(r.stdout).to.not.match(ESC);
    });
  });

  describe("debug scopes", function () {
    const rows = [
      { env: { DOC_DETECTIVE_DEBUG: "1" }, on: true },
      { env: { DOC_DETECTIVE_DEBUG: "true" }, on: true },
      { env: { DOC_DETECTIVE_DEBUG: "0" }, on: false },
      { env: { DEBUG: "1" }, on: true },
      { env: { DEBUG: "*" }, on: true },
      { env: { DEBUG: "doc-detective" }, on: true },
      { env: { DEBUG: "express:*,doc-detective*" }, on: true },
      { env: { DEBUG: "express:*" }, on: false },
    ];
    for (const { env, on } of rows) {
      it(`${JSON.stringify(env)} ${on ? "turns on" : "leaves off"} debug output, and still runs tests`, function () {
        const r = run(["-i", "pass.spec.json", "-o", "results.json"], { env });
        expect(r.status, r.stderr).to.equal(0);
        expect(/\(DEBUG\)/.test(r.stderr)).to.equal(on);
        expect(fs.existsSync(path.join(cwd, "results.json"))).to.equal(true);
      });
    }

    it("lets a flag beat the environment", function () {
      const r = run(["-i", "pass.spec.json", "-l", "info"], { env: { DEBUG: "1" } });
      expect(r.stderr).to.not.match(/\(DEBUG\)/);
    });
  });

  describe("help", function () {
    const commands = [
      [],
      ["run"],
      ["help"],
      ["install"],
      ["install", "all"],
      ["install", "browsers"],
      ["install", "runtime"],
      ["install", "bash"],
      ["install", "android"],
      ["install", "ios"],
      ["install", "agents"],
      ["install", "status"],
      ["debug"],
      ["lsp"],
    ];
    for (const path of commands) {
      const name = ["doc-detective", ...path].join(" ");
      it(`${name} leads with examples, and links to docs`, function () {
        const r = run([...path, "--help"]);
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`Usage: ${name}`);
        expect(r.stdout).to.include("Examples:");
        expect(r.stdout.indexOf("Examples:")).to.be.lessThan(r.stdout.indexOf("Options:") === -1 ? Infinity : r.stdout.indexOf("Options:"));
        expect(r.stdout).to.include("https://docs.doc-detective.com/reference/cli");
        expect(r.stdout).to.include("Global options:");
      });
    }

    it("keeps each subcommand's help focused", function () {
      for (const path of [["debug"], ["lsp"], ["install", "status"], ["install", "agents"]]) {
        const help = run([...path, "--help"]).stdout;
        expect(help, path.join(" ")).to.not.include("--reporters");
        expect(help.length, path.join(" ")).to.be.lessThan(2500);
      }
    });

    it("lists the support path in top-level help", function () {
      expect(run(["--help"]).stdout).to.include("github.com/doc-detective/doc-detective/issues");
    });

    it("explains exit codes for runs", function () {
      expect(run(["--help"]).stdout).to.include("Exit codes:");
    });

    it("lists every asset under install", function () {
      const help = run(["install", "--help"]).stdout;
      for (const asset of ["all", "browsers", "runtime", "bash", "android", "ios", "agents", "status"]) {
        expect(help).to.match(new RegExp(`^\\s+${asset}\\b`, "m"));
      }
    });

    it("wraps help at 80 columns, apart from the longest terms", function () {
      for (const line of run(["--help"]).stdout.split("\n")) {
        expect(line.length, line).to.be.at.most(90);
      }
    });
  });

  describe("errors", function () {
    it("suggests the nearest command for a typo", function () {
      const r = run(["instal"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("unknown command 'instal'");
      expect(r.stderr).to.include("Did you mean install?");
    });

    it("points a bare path at `run`", function () {
      const r = run(["docs/guide.md"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("doc-detective run docs/guide.md");
    });

    it("suggests the nearest flag for a typo", function () {
      expect(run(["--inptu", "x"]).stderr).to.include("Did you mean --input?");
    });

    it("ends usage errors with a pointer to --help", function () {
      expect(run(["--nope"]).stderr).to.include("--help");
    });

    it("names the choices for `install` with no asset", function () {
      const r = run(["install"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.match(/Specify an asset: .*browsers/);
    });

    it("summarizes an unknown action, without a wall of schema errors", function () {
      fs.writeFileSync(
        path.join(cwd, "invalid.spec.json"),
        JSON.stringify({ tests: [{ steps: [{ goToo: "https://example.com" }] }] })
      );
      const r = run(["-i", "invalid.spec.json"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("goToo");
      expect(r.stderr).to.include("Did you mean goTo?");
      expect(r.stderr).to.not.include("must have required property");
      expect(r.stderr).to.not.include('"object"');
      expect(r.stderr.length).to.be.lessThan(600);
    });

    it("keeps the raw schema errors for -d", function () {
      fs.writeFileSync(
        path.join(cwd, "invalid.spec.json"),
        JSON.stringify({ tests: [{ steps: [{ goToo: "x" }] }] })
      );
      expect(run(["-d", "-i", "invalid.spec.json"]).stderr).to.include("must have required property");
    });

    it("explains a config file that won't parse, once", function () {
      fs.writeFileSync(path.join(cwd, "bad.json"), "{ not json");
      const r = run(["-c", "bad.json"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("bad.json");
      expect(r.stderr).to.not.include("must be object");
    });

    it("points an empty bare run at --help", function () {
      fs.rmSync(path.join(cwd, "pass.spec.json"));
      fs.rmSync(path.join(cwd, "fail.spec.json"));
      const r = run([]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.match(/--help/);
    });

    it("hasn't a stack trace for expected errors", function () {
      expect(run(["-c", "nope.json"]).stderr).to.not.match(/^\s+at /m);
    });
  });

  describe("interactivity", function () {
    it("accepts --no-input, without treating it as a missing --input", function () {
      const r = run(["--no-input", "-i", "pass.spec.json"]);
      expect(r.status, r.stderr).to.equal(0);
    });

    it("never prompts with --no-input, and names the flag to pass", function () {
      const r = run(["install", "agents", "--no-input"]);
      expect(r.status).to.equal(2);
      expect(r.stderr).to.include("--agent");
    });

    it("fails quickly when it can't prompt for agents", function () {
      const started = Date.now();
      run(["install", "agents"]);
      expect(Date.now() - started).to.be.lessThan(2500);
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
