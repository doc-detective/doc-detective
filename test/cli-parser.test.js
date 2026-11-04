// How the command tree parses, spawned through the real bin. These pin behavior
// commander only gives with specific settings, such as positional options.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { buildProgram } from "../dist/cliProgram.js";

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../bin/doc-detective.js"
);

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" },
  });
}

describe("CLI parser", function () {
  this.timeout(20000);

  it("rejects a run flag on a subcommand that doesn't take it", function () {
    const r = runCli(["install", "browsers", "--reporters", "json", "--dry-run"]);
    expect(r.status).to.equal(2);
    expect(r.stderr).to.include("unknown option '--reporters'");
  });

  it("gives a flag to the subcommand it follows, not to the root", function () {
    const r = runCli(["install", "agents", "--scope", "global", "--agent", "claude", "--yes", "--dry-run"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stdout).to.include("scope: global");
  });

  it("explains a nested command through `help`", function () {
    const r = runCli(["help", "install", "browsers"]);
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stdout).to.include("doc-detective install browsers");
  });

  it("rejects `help` for a command that doesn't exist", function () {
    const r = runCli(["help", "nope"]);
    expect(r.status).to.equal(2);
    expect(r.stderr).to.include("unknown command 'nope'");
  });

  it("keeps bare words free for subcommands", function () {
    const r = runCli(["docs"]);
    expect(r.status).to.equal(2);
    expect(r.stderr).to.include("too many arguments");
  });

  it("suggests the nearest flag for a typo", function () {
    const r = runCli(["--inptu", "x"]);
    expect(r.status).to.equal(2);
    expect(r.stderr).to.include("Did you mean --input?");
  });

  it("requires a value for a valued flag", function () {
    const r = runCli(["--input"]);
    expect(r.status).to.equal(2);
    expect(r.stderr).to.include("argument missing");
  });

  it("prints a bare version on stdout, for scripts that read it", function () {
    const r = runCli(["--version"]);
    expect(r.status).to.equal(0);
    expect(r.stdout.trim()).to.match(/^\d+\.\d+\.\d+/);
  });

  it("accepts both spellings of the log level", function () {
    const parse = (args) => {
      let seen;
      return buildProgram({ runTests: (a) => { seen = a; } })
        .parseAsync(args, { from: "user" })
        .then(() => seen);
    };
    return Promise.all([
      parse(["--logLevel", "debug"]),
      parse(["--log-level", "debug"]),
      parse(["runTests", "-l", "debug"]),
    ]).then((results) => {
      for (const args of results) expect(args.logLevel).to.equal("debug");
    });
  });
});
