// Guards the CLI startup path against eagerly loading heavy packages.
//
// yaml (~72 modules), axios + form-data (~73) and posthog-node + @posthog/core
// (~95) used to load on every invocation, `--help` included, through static
// imports. They now load at first use (dynamic import / lazy require), so
// `--help` pays for none of them and a shell-only JSON run with telemetry off
// pays only for yaml.
// A new static `import ... from "yaml" | "axios" | "posthog-node"` anywhere on
// the startup graph fails this test; load the package where it's used instead.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(repoRoot, "bin", "doc-detective.js");
const HEAVY = ["yaml", "axios", "form-data", "posthog-node", "@posthog/core"];

describe("CLI startup path loads no heavy packages eagerly", function () {
  this.timeout(60000);
  let tmp;
  let hook;

  before(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-startup-modules-"));
    hook = path.join(tmp, "hook.mjs");
    // Records every node_modules package the process loads (ESM and CJS both
    // route through registerHooks' load hook) and prints them on exit.
    fs.writeFileSync(
      hook,
      `import { registerHooks } from "node:module";
const pkgs = new Set();
registerHooks({ load(url, ctx, next) {
  const m = /\\/node_modules\\/((?:@[^/]+\\/)?[^/]+)\\//.exec(url);
  if (m) pkgs.add(m[1]);
  return next(url, ctx);
} });
process.on("exit", () => process.stderr.write("PKGS:" + JSON.stringify([...pkgs]) + "\\n"));
`
    );
  });

  after(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function loadedPackages(args) {
    const res = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(hook).href, bin, ...args],
      { cwd: tmp, encoding: "utf8", env: { ...process.env, CI: "1" } }
    );
    const line = res.stderr.split(/\r?\n/).find((l) => l.startsWith("PKGS:"));
    assert.ok(line, `no package report; exit ${res.status}\n${res.stderr}`);
    return { status: res.status, pkgs: JSON.parse(line.slice(5)) };
  }

  it("--help loads none of yaml, axios, form-data, posthog-node", function () {
    const { status, pkgs } = loadedPackages(["--help"]);
    assert.equal(status, 0);
    assert.deepEqual(HEAVY.filter((p) => pkgs.includes(p)), []);
  });

  // yaml is legitimately loaded here: detection maps every spec's steps to
  // source locations with yaml's parseDocument, JSON specs included.
  // @puppeteer/browsers is what browser detection loads first; a run with no
  // browser context skips detection entirely (ADR 01133).
  it("a shell-only JSON run with telemetry off loads no axios, form-data, posthog-node, or browser detection", function () {
    const spec = path.join(tmp, "shell.spec.json");
    fs.writeFileSync(
      spec,
      JSON.stringify({ tests: [{ steps: [{ runShell: "echo hi" }] }] })
    );
    const config = path.join(tmp, "config.json");
    fs.writeFileSync(config, JSON.stringify({ telemetry: { send: false } }));
    const { status, pkgs } = loadedPackages([
      "--input", spec,
      "--config", config,
      "--output", path.join(tmp, "out"),
      "--logLevel", "silent",
    ]);
    assert.equal(status, 0);
    assert.deepEqual(
      [...HEAVY, "@puppeteer/browsers"].filter((p) => p !== "yaml" && pkgs.includes(p)),
      []
    );
  });
});
