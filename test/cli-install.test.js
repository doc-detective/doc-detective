import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [path.resolve("bin/doc-detective.js"), ...args], {
    env: {
      ...process.env,
      // Always skip self-update for these CLI smoke tests — they should be
      // deterministic and not hit the network.
      DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
      ...env,
    },
    encoding: "utf8",
  });
}

describe("CLI install commands", function () {
  this.timeout(20000);

  it("`--help` lists the install command group", function () {
    const r = runCli(["--help"]);
    expect(r.status).to.equal(0);
    expect(r.stdout).to.include("install <subcommand>");
  });

  it("`install --help` lists all subcommands (agents, runtime, browsers, android, ios, status, all)", function () {
    const r = runCli(["install", "--help"]);
    expect(r.status).to.equal(0);
    expect(r.stdout).to.match(/install agents/);
    expect(r.stdout).to.match(/install runtime/);
    expect(r.stdout).to.match(/install browsers/);
    expect(r.stdout).to.match(/install android/);
    expect(r.stdout).to.match(/install ios/);
    expect(r.stdout).to.match(/install status/);
    expect(r.stdout).to.match(/install all/);
  });

  it("`install ios --dry-run` previews checks without requiring macOS", function () {
    const r = runCli(["install", "ios", "--dry-run"]);
    expect(r.status).to.equal(0);
    expect(r.stderr + r.stdout).to.not.include("Unknown argument");
    expect(r.stdout).to.match(/ios-toolchain|simctl|XCUITest/i);
  });

  it("`install android --dry-run` previews a plan without java/network (native app phase A3)", function () {
    // Dry-run is a pure preview: it must never require java, hit the network,
    // or spawn sdkmanager. It runs on every host regardless of SDK presence —
    // an SDK found prints the augment plan, otherwise the bootstrap plan.
    // Either way it exits cleanly and is never an unknown-command error.
    const r = runCli(["install", "android", "--dry-run"]);
    expect(r.status).to.equal(0);
    expect(r.stderr + r.stdout).to.not.include("Unknown argument");
    expect(r.stdout).to.match(
      /Android install plan|accept Android SDK licenses|create AVD|bootstrap Android/
    );
  });

  it("`install` with no subcommand prints a clear error and exits non-zero", function () {
    const r = runCli(["install"]);
    expect(r.status).to.not.equal(0);
    // Either yargs' default ("Not enough non-option arguments") or our
    // custom demandCommand message ("Specify a subcommand") is acceptable —
    // both surface the same failure to the user.
    expect(r.stderr + r.stdout).to.match(/Specify a subcommand|Not enough non-option arguments/);
  });

  it("`install-agents` (hidden alias) still parses and runs", function () {
    // We don't actually run agent install — invoke with --dry-run and use
    // --agent claude --scope project to bypass interactive picker / detect.
    const r = runCli(["install-agents", "--dry-run", "--agent", "claude", "--scope", "project"]);
    // We don't assert success/exit code — adapters may or may not detect a
    // real Claude binary on this machine. Just assert the command isn't an
    // unknown-subcommand error.
    expect(r.stderr + r.stdout).to.not.include("Unknown argument");
    expect(r.stderr + r.stdout).to.not.include("not enough non-option arguments");
  });

  it("`install runtime --dry-run pngjs` reports a dry-run install", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cli-runtime-"));
    try {
      const r = runCli([
        "install",
        "runtime",
        "pngjs",
        "--dry-run",
        "--cache-dir",
        tmp,
      ]);
      expect(r.status).to.equal(0);
      expect(r.stdout).to.include("pngjs");
      expect(r.stdout).to.include("dry-run");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("`install browsers --dry-run chrome` reports a dry-run install for chrome", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cli-browsers-"));
    try {
      const r = runCli([
        "install",
        "browsers",
        "chrome",
        "--dry-run",
        "--cache-dir",
        tmp,
      ]);
      expect(r.status).to.equal(0);
      expect(r.stdout).to.include("chrome");
      expect(r.stdout).to.include("dry-run");
      expect(r.stdout).to.include("channel: stable");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("`install status` reports rows for runtime + browsers", function () {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cli-status-"));
    try {
      const r = runCli(["install", "status", "--cache-dir", tmp]);
      expect(r.status).to.equal(0);
      // Empty cache → every row is installed=— (an em-dash placeholder).
      expect(r.stdout).to.match(/\[npm\] webdriverio: installed=/);
      expect(r.stdout).to.match(/\[browser\] chrome: installed=/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
