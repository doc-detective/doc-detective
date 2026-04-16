import assert from "node:assert/strict";
import yargs from "yargs/yargs";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn as childSpawn } from "node:child_process";

describe("agents registry", function () {
  let registry;

  before(async function () {
    registry = await import("../dist/agents/registry.js");
  });

  it("exposes listAdapters() returning at least one adapter", function () {
    const adapters = registry.listAdapters();
    assert.ok(Array.isArray(adapters));
    assert.ok(adapters.length >= 1);
  });

  it("exposes getAdapter('claude-code') returning the Claude Code adapter", function () {
    const adapter = registry.getAdapter("claude-code");
    assert.equal(adapter.id, "claude-code");
    assert.equal(adapter.displayName, "Claude Code");
    assert.equal(typeof adapter.detect, "function");
    assert.equal(typeof adapter.getInstallState, "function");
    assert.equal(typeof adapter.install, "function");
    assert.equal(typeof adapter.supportsScopes, "function");
  });

  it("getAdapter() throws for unknown ids", function () {
    assert.throws(() => registry.getAdapter("does-not-exist"), /unknown/i);
  });

  it("claude-code adapter supports global and project scopes", function () {
    const adapter = registry.getAdapter("claude-code");
    const scopes = adapter.supportsScopes();
    assert.deepEqual(scopes.sort(), ["global", "project"]);
  });
});

describe("install-agents subcommand arg parsing", function () {
  let installAgentsCommand;
  let capturedArgv;
  let handlerCalled;

  before(async function () {
    ({ installAgentsCommand } = await import("../dist/agents/command.js"));
  });

  beforeEach(function () {
    capturedArgv = null;
    handlerCalled = false;
  });

  function parse(args) {
    // Replace handler with a capturing spy so we never actually run install logic.
    const spyCommand = {
      ...installAgentsCommand,
      handler: (argv) => {
        handlerCalled = true;
        capturedArgv = argv;
      },
    };
    return yargs([])
      .command(spyCommand)
      .strict()
      .fail((msg, err) => {
        // Surface yargs failures as thrown errors for assertion.
        throw err || new Error(msg);
      })
      .parseAsync(args);
  }

  it("exposes a yargs CommandModule with the 'install-agents' command", function () {
    assert.equal(installAgentsCommand.command, "install-agents");
    assert.equal(typeof installAgentsCommand.handler, "function");
    assert.equal(typeof installAgentsCommand.builder, "function");
  });

  it("parses --agent, --scope, --yes correctly", async function () {
    await parse(["install-agents", "--agent", "claude-code", "--scope", "project", "--yes"]);
    assert.equal(handlerCalled, true);
    assert.deepEqual(capturedArgv.agent, ["claude-code"]);
    assert.equal(capturedArgv.scope, "project");
    assert.equal(capturedArgv.yes, true);
  });

  it("allows repeated --agent flags", async function () {
    await parse([
      "install-agents",
      "--agent", "claude-code",
      "--agent", "opencode",
      "--scope", "global",
      "--yes",
    ]);
    assert.deepEqual(capturedArgv.agent, ["claude-code", "opencode"]);
    assert.equal(capturedArgv.scope, "global");
  });

  it("accepts --force and --dry-run as booleans", async function () {
    await parse(["install-agents", "--force", "--dry-run"]);
    assert.equal(capturedArgv.force, true);
    assert.equal(capturedArgv["dry-run"], true);
  });

  it("rejects invalid --scope values", async function () {
    await assert.rejects(
      async () => parse(["install-agents", "--scope", "bogus", "--yes", "--agent", "claude-code"]),
      /scope/i
    );
  });

  it("rejects unknown subcommand under strict mode", async function () {
    await assert.rejects(
      async () => parse(["install-frobnicators"]),
      /unknown|command|frobnicators/i
    );
  });
});

describe("ClaudeCodeAdapter.detect()", function () {
  let ClaudeCodeAdapter;

  before(async function () {
    ({ ClaudeCodeAdapter } = await import("../dist/agents/adapters/claude-code.js"));
  });

  function makeAdapter(overrides) {
    const defaults = {
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
    };
    return new ClaudeCodeAdapter({ ...defaults, ...overrides });
  }

  it("reports onPath=true and captures version when `claude --version` succeeds", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "claude");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "1.2.3 (Claude Code)", stderr: "", exitCode: 0 };
      },
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, true);
    assert.equal(result.version, "1.2.3 (Claude Code)");
    assert.equal(result.present, true);
  });

  it("reports present=true via ~/.claude even when binary is absent", async function () {
    const globalClaudePath = path.join("/home/test", ".claude");
    const adapter = makeAdapter({
      run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      existsSync: (p) => p === globalClaudePath,
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, false);
    assert.equal(result.present, true);
    assert.equal(result.configPaths.global, globalClaudePath);
    assert.equal(result.configPaths.project, undefined);
    // Note about fallback mode should be recorded
    assert.ok(
      (result.notes || []).some((n) => /fallback|path/i.test(n)),
      `expected a note about fallback/path; got: ${JSON.stringify(result.notes)}`
    );
  });

  it("detects project .claude directory independently", async function () {
    const projectClaudePath = path.join("/work/proj", ".claude");
    const adapter = makeAdapter({
      run: async () => { throw new Error("no claude"); },
      existsSync: (p) => p === projectClaudePath,
    });
    const result = await adapter.detect();
    assert.equal(result.configPaths.project, projectClaudePath);
    // Project-only detection doesn't imply Claude Code is installed.
    assert.equal(result.present, false);
  });

  it("reports present=false when nothing is detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("spawn failure"); },
      existsSync: () => false,
    });
    const result = await adapter.detect();
    assert.equal(result.present, false);
    assert.equal(result.onPath, false);
    assert.equal(result.version, undefined);
    assert.deepEqual(result.configPaths, {});
  });

  it("treats non-zero exit code as binary-not-functional (no version, no onPath)", async function () {
    const adapter = makeAdapter({
      run: async () => ({ stdout: "", stderr: "error", exitCode: 1 }),
      existsSync: () => false,
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, false);
    assert.equal(result.version, undefined);
  });
});

describe("ClaudeCodeAdapter.getInstallState()", function () {
  let ClaudeCodeAdapter;

  before(async function () {
    ({ ClaudeCodeAdapter } = await import("../dist/agents/adapters/claude-code.js"));
  });

  function makeAdapter(overrides) {
    const defaults = {
      run: async () => ({ stdout: "[]", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      readdirSync: () => [],
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
    };
    return new ClaudeCodeAdapter({ ...defaults, ...overrides });
  }

  describe("when `claude` is on PATH", function () {
    it("reports not-installed when marketplace list has no doc-detective", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          assert.deepEqual([cmd, ...args], ["claude", "plugin", "marketplace", "list", "--json"]);
          return { stdout: JSON.stringify([]), stderr: "", exitCode: 0 };
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
      assert.equal(state.installedVersion, undefined);
    });

    it("reports not-installed when the marketplace is added but plugin is not", async function () {
      const adapter = makeAdapter({
        run: async () => ({
          stdout: JSON.stringify([
            { name: "doc-detective", plugins: [] },
          ]),
          stderr: "",
          exitCode: 0,
        }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });

    it("reports installed + version when the plugin is present in the marketplace list", async function () {
      const adapter = makeAdapter({
        run: async () => ({
          stdout: JSON.stringify([
            {
              name: "doc-detective",
              plugins: [{ name: "doc-detective", version: "1.2.3", installed: true }],
            },
          ]),
          stderr: "",
          exitCode: 0,
        }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "1.2.3");
    });

    it("falls back to reading plugin.json from the cache when marketplace list lacks a version", async function () {
      const cacheDir = path.join("/home/test", ".claude", "plugins", "cache", "doc-detective", "doc-detective");
      const versionDir = path.join(cacheDir, "1.4.0");
      const pluginJson = path.join(versionDir, ".claude-plugin", "plugin.json");
      const adapter = makeAdapter({
        run: async () => ({
          // Plugin listed as installed, but no explicit version field.
          stdout: JSON.stringify([
            { name: "doc-detective", plugins: [{ name: "doc-detective", installed: true }] },
          ]),
          stderr: "",
          exitCode: 0,
        }),
        existsSync: (p) => p === cacheDir || p === pluginJson,
        readdirSync: (p) => (p === cacheDir ? ["1.4.0"] : []),
        readFileSync: (p) => {
          if (p === pluginJson) return JSON.stringify({ version: "1.4.0" });
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "1.4.0");
    });
  });

  describe("when `claude` is NOT on PATH (settings-file fallback)", function () {
    it("reads ~/.claude/settings.json for global scope", async function () {
      const settingsPath = path.join("/home/test", ".claude", "settings.json");
      const adapter = makeAdapter({
        run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
        existsSync: (p) => p === settingsPath,
        readFileSync: (p) => {
          if (p === settingsPath) {
            return JSON.stringify({
              enabledPlugins: { "doc-detective@doc-detective": true },
              extraKnownMarketplaces: {
                "doc-detective": { source: { source: "github", repo: "doc-detective/agent-tools" } },
              },
            });
          }
          throw new Error("unexpected read");
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      // Version unknown when we can only see the settings entries.
      assert.equal(state.installedVersion, undefined);
    });

    it("reads ./.claude/settings.json for project scope", async function () {
      const settingsPath = path.join("/work/proj", ".claude", "settings.json");
      const adapter = makeAdapter({
        run: async () => { throw new Error("no claude"); },
        existsSync: (p) => p === settingsPath,
        readFileSync: (p) => p === settingsPath
          ? JSON.stringify({ enabledPlugins: { "doc-detective@doc-detective": true } })
          : (() => { throw new Error("unexpected"); })(),
      });
      const state = await adapter.getInstallState("project");
      assert.equal(state.installed, true);
    });

    it("reports not-installed when settings.json is missing", async function () {
      const adapter = makeAdapter({
        run: async () => { throw new Error("no claude"); },
        existsSync: () => false,
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });
  });

  describe("latest-version probe", function () {
    it("marks upToDate=true when installed version equals remote version", async function () {
      const adapter = makeAdapter({
        run: async () => ({
          stdout: JSON.stringify([{
            name: "doc-detective",
            plugins: [{ name: "doc-detective", version: "2.0.0", installed: true }],
          }]),
          stderr: "",
          exitCode: 0,
        }),
        fetchLatestVersion: async () => "2.0.0",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "2.0.0");
      assert.equal(state.latestVersion, "2.0.0");
      assert.equal(state.upToDate, true);
    });

    it("marks upToDate=false when versions differ", async function () {
      const adapter = makeAdapter({
        run: async () => ({
          stdout: JSON.stringify([{
            name: "doc-detective",
            plugins: [{ name: "doc-detective", version: "1.0.0", installed: true }],
          }]),
          stderr: "",
          exitCode: 0,
        }),
        fetchLatestVersion: async () => "1.1.0",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.latestVersion, "1.1.0");
      assert.equal(state.upToDate, false);
    });

    it("leaves upToDate unset when the probe fails (offline)", async function () {
      const adapter = makeAdapter({
        run: async () => ({
          stdout: JSON.stringify([{
            name: "doc-detective",
            plugins: [{ name: "doc-detective", version: "1.0.0", installed: true }],
          }]),
          stderr: "",
          exitCode: 0,
        }),
        fetchLatestVersion: async () => { throw new Error("ENOTFOUND"); },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "1.0.0");
      assert.equal(state.latestVersion, undefined);
      assert.equal(state.upToDate, undefined);
    });

    it("skips the probe entirely when nothing is installed", async function () {
      let probeCalled = false;
      const adapter = makeAdapter({
        run: async () => ({ stdout: "[]", stderr: "", exitCode: 0 }),
        fetchLatestVersion: async () => {
          probeCalled = true;
          return "9.9.9";
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
      assert.equal(probeCalled, false, "should not call probe when not installed");
    });
  });
});

describe("ClaudeCodeAdapter.install() — Path A (claude on PATH)", function () {
  let ClaudeCodeAdapter;

  before(async function () {
    ({ ClaudeCodeAdapter } = await import("../dist/agents/adapters/claude-code.js"));
  });

  /**
   * Build an adapter instance with a scriptable `run` stub that records every
   * invocation and returns canned responses for `marketplace list`.
   */
  function makeSpyAdapter({ marketplaceList = "[]", fetchLatestVersion = async () => undefined } = {}) {
    const calls = [];
    const deps = {
      run: async (cmd, args) => {
        calls.push([cmd, ...args]);
        if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
          return { stdout: marketplaceList, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      readdirSync: () => [],
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
      fetchLatestVersion,
    };
    return { adapter: new ClaudeCodeAdapter(deps), calls };
  }

  const baseOpts = (over = {}) => ({
    scope: "project",
    force: false,
    dryRun: false,
    cwd: "/work/proj",
    logger: () => {},
    ...over,
  });

  function commandsAfter(calls, predicate) {
    return calls.filter(predicate).map((c) => c.join(" "));
  }

  const MUTATING = (c) =>
    c[0] === "claude" &&
    c[1] === "plugin" &&
    ((c[2] === "marketplace" && c[3] !== "list") ||
      c[2] === "install" ||
      c[2] === "update");

  it("runs `marketplace add` then `plugin install` with mapped scope for a fresh install", async function () {
    const { adapter, calls } = makeSpyAdapter({ marketplaceList: "[]" });
    const report = await adapter.install(baseOpts({ scope: "project" }));
    const installs = commandsAfter(calls, MUTATING);
    assert.deepEqual(installs, [
      "claude plugin marketplace add doc-detective/agent-tools --scope project",
      "claude plugin install doc-detective@doc-detective --scope project",
    ]);
    assert.equal(report.action, "installed");
    assert.equal(report.scope, "project");
    assert.equal(report.adapterId, "claude-code");
  });

  it("maps scope 'global' to claude's --scope user", async function () {
    const { adapter, calls } = makeSpyAdapter({ marketplaceList: "[]" });
    await adapter.install(baseOpts({ scope: "global" }));
    const installs = commandsAfter(calls, MUTATING);
    assert.deepEqual(installs, [
      "claude plugin marketplace add doc-detective/agent-tools --scope user",
      "claude plugin install doc-detective@doc-detective --scope user",
    ]);
  });

  it("runs `marketplace update` + `plugin update` when an update is available", async function () {
    const installedList = JSON.stringify([{
      name: "doc-detective",
      plugins: [{ name: "doc-detective", version: "1.0.0", installed: true }],
    }]);
    const { adapter, calls } = makeSpyAdapter({
      marketplaceList: installedList,
      fetchLatestVersion: async () => "1.1.0",
    });
    const report = await adapter.install(baseOpts({ scope: "project" }));
    const updates = commandsAfter(
      calls,
      (c) => c[0] === "claude" && c[2] === "marketplace" && c[3] === "update"
    );
    const pluginUpdates = commandsAfter(
      calls,
      (c) => c[0] === "claude" && c[2] === "update" && c[1] === "plugin"
    );
    assert.deepEqual(updates, ["claude plugin marketplace update doc-detective"]);
    assert.deepEqual(pluginUpdates, [
      "claude plugin update doc-detective@doc-detective --scope project",
    ]);
    assert.equal(report.action, "updated");
    assert.equal(report.installedVersion, "1.1.0");
  });

  it("returns already-up-to-date with no install commands when installed and current", async function () {
    const installedList = JSON.stringify([{
      name: "doc-detective",
      plugins: [{ name: "doc-detective", version: "2.0.0", installed: true }],
    }]);
    const { adapter, calls } = makeSpyAdapter({
      marketplaceList: installedList,
      fetchLatestVersion: async () => "2.0.0",
    });
    const report = await adapter.install(baseOpts({ scope: "global" }));
    const mutating = commandsAfter(calls, MUTATING);
    assert.deepEqual(mutating, [], "no mutating commands should have been run");
    assert.equal(report.action, "already-up-to-date");
    assert.equal(report.installedVersion, "2.0.0");
  });

  it("--force triggers update flow even when already up to date", async function () {
    const installedList = JSON.stringify([{
      name: "doc-detective",
      plugins: [{ name: "doc-detective", version: "2.0.0", installed: true }],
    }]);
    const { adapter, calls } = makeSpyAdapter({
      marketplaceList: installedList,
      fetchLatestVersion: async () => "2.0.0",
    });
    const report = await adapter.install(baseOpts({ scope: "global", force: true }));
    const mutating = commandsAfter(calls, MUTATING);
    assert.ok(mutating.length > 0, "expected at least one mutating command under --force");
    assert.equal(report.action, "forced");
  });

  it("--dry-run does not spawn install/update commands and reports action=dry-run", async function () {
    const { adapter, calls } = makeSpyAdapter({ marketplaceList: "[]" });
    const logged = [];
    const report = await adapter.install(baseOpts({ scope: "project", dryRun: true, logger: (m) => logged.push(m) }));
    const mutating = commandsAfter(calls, MUTATING);
    assert.deepEqual(mutating, [], "no mutating commands should have been spawned");
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /plugin install doc-detective/.test(l)),
      "should have logged the planned install command"
    );
  });
});

describe("ClaudeCodeAdapter.install() — Path B (settings.json fallback)", function () {
  let ClaudeCodeAdapter;
  let tmpdir;

  before(async function () {
    ({ ClaudeCodeAdapter } = await import("../dist/agents/adapters/claude-code.js"));
  });

  beforeEach(function () {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-agents-test-"));
  });

  afterEach(function () {
    try {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    } catch {}
  });

  function makeAdapter({ homedir = tmpdir, cwd = tmpdir } = {}) {
    // Binary absent: every run() call throws, so install() falls into Path B.
    return new ClaudeCodeAdapter({
      run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      existsSync: fs.existsSync,
      readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
      readdirSync: (p) => fs.readdirSync(p),
      homedir: () => homedir,
      cwd: () => cwd,
      fetchLatestVersion: async () => undefined,
    });
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: tmpdir,
    logger: () => {},
    ...over,
  });

  it("creates settings.json with merged extraKnownMarketplaces + enabledPlugins when file is absent", async function () {
    const adapter = makeAdapter();
    const report = await adapter.install(baseOpts({ scope: "global" }));
    const settingsPath = path.join(tmpdir, ".claude", "settings.json");
    assert.equal(fs.existsSync(settingsPath), true, "settings.json should exist");
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(parsed.enabledPlugins["doc-detective@doc-detective"], true);
    assert.deepEqual(parsed.extraKnownMarketplaces["doc-detective"], {
      source: { source: "github", repo: "doc-detective/agent-tools" },
    });
    assert.equal(report.action, "fallback");
    assert.equal(report.scope, "global");
  });

  it("preserves existing unrelated settings when merging", async function () {
    const settingsDir = path.join(tmpdir, ".claude");
    fs.mkdirSync(settingsDir, { recursive: true });
    const existing = {
      theme: "dark",
      enabledPlugins: { "other-plugin@other-marketplace": true },
      extraKnownMarketplaces: { other: { source: { source: "github", repo: "x/y" } } },
    };
    fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(existing));

    const adapter = makeAdapter();
    await adapter.install(baseOpts({ scope: "global" }));

    const parsed = JSON.parse(fs.readFileSync(path.join(settingsDir, "settings.json"), "utf8"));
    // Original keys preserved:
    assert.equal(parsed.theme, "dark");
    assert.equal(parsed.enabledPlugins["other-plugin@other-marketplace"], true);
    assert.deepEqual(parsed.extraKnownMarketplaces.other, {
      source: { source: "github", repo: "x/y" },
    });
    // New keys added:
    assert.equal(parsed.enabledPlugins["doc-detective@doc-detective"], true);
    assert.ok(parsed.extraKnownMarketplaces["doc-detective"]);
  });

  it("writes to ./.claude/settings.json when scope is project", async function () {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-proj-"));
    try {
      const adapter = makeAdapter({ homedir: tmpdir, cwd: projectDir });
      await adapter.install(baseOpts({ scope: "project", cwd: projectDir }));
      const settingsPath = path.join(projectDir, ".claude", "settings.json");
      assert.equal(fs.existsSync(settingsPath), true);
      // And global settings.json should NOT be touched.
      assert.equal(fs.existsSync(path.join(tmpdir, ".claude", "settings.json")), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("--dry-run does not write anything", async function () {
    const adapter = makeAdapter();
    const logged = [];
    const report = await adapter.install(baseOpts({ dryRun: true, logger: (m) => logged.push(m) }));
    assert.equal(fs.existsSync(path.join(tmpdir, ".claude", "settings.json")), false);
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /settings\.json/i.test(l)),
      "should have logged settings.json as the write target"
    );
  });

  it("is idempotent — running twice does not double-write entries", async function () {
    const adapter = makeAdapter();
    await adapter.install(baseOpts());
    const settingsPath = path.join(tmpdir, ".claude", "settings.json");
    const firstContent = fs.readFileSync(settingsPath, "utf8");
    const firstMtime = fs.statSync(settingsPath).mtimeMs;

    // Small pause so mtime would change if we rewrote
    await new Promise((r) => setTimeout(r, 25));
    const report = await adapter.install(baseOpts());
    const secondContent = fs.readFileSync(settingsPath, "utf8");
    // Semantic equality: parsed objects match regardless of formatting.
    assert.deepEqual(JSON.parse(secondContent), JSON.parse(firstContent));
    assert.equal(report.action, "already-up-to-date");
  });
});

describe("runInstallAgents() orchestration", function () {
  let runInstallAgents;

  before(async function () {
    ({ runInstallAgents } = await import("../dist/agents/runner.js"));
  });

  function makeStubAdapter(id, overrides = {}) {
    return {
      id,
      displayName: id.replace(/-/g, " "),
      calls: { detect: 0, getInstallState: 0, install: 0 },
      supportsScopes: () => ["global", "project"],
      async detect() {
        this.calls.detect++;
        return overrides.detection ?? { present: true, onPath: true, configPaths: {} };
      },
      async getInstallState() {
        this.calls.getInstallState++;
        return overrides.state ?? { installed: false };
      },
      async install(opts) {
        this.calls.install++;
        this.lastInstallOpts = opts;
        return overrides.report ?? {
          adapterId: id,
          scope: opts.scope,
          action: "installed",
        };
      },
    };
  }

  it("happy path: --yes with --agent and --scope installs the chosen agent", async function () {
    const cc = makeStubAdapter("claude-code");
    const reports = await runInstallAgents(
      { agent: ["claude-code"], scope: "project", force: false, yes: true, "dry-run": false },
      { adapters: [cc], isTTY: () => false }
    );
    assert.equal(cc.calls.install, 1);
    assert.equal(cc.lastInstallOpts.scope, "project");
    assert.equal(reports.length, 1);
    assert.equal(reports[0].action, "installed");
  });

  it("--yes without --agent throws a helpful error", async function () {
    const cc = makeStubAdapter("claude-code");
    await assert.rejects(
      runInstallAgents(
        { scope: "project", force: false, yes: true, "dry-run": false },
        { adapters: [cc], isTTY: () => false }
      ),
      /--agent/i
    );
  });

  it("--yes without --scope throws a helpful error", async function () {
    const cc = makeStubAdapter("claude-code");
    await assert.rejects(
      runInstallAgents(
        { agent: ["claude-code"], force: false, yes: true, "dry-run": false },
        { adapters: [cc], isTTY: () => false }
      ),
      /--scope/i
    );
  });

  it("unknown --agent id throws", async function () {
    const cc = makeStubAdapter("claude-code");
    await assert.rejects(
      runInstallAgents(
        { agent: ["flurb"], scope: "project", force: false, yes: true, "dry-run": false },
        { adapters: [cc], isTTY: () => false }
      ),
      /flurb|unknown|agent/i
    );
  });

  it("non-TTY without --agent errors with hint", async function () {
    const cc = makeStubAdapter("claude-code");
    await assert.rejects(
      runInstallAgents(
        { scope: "project", force: false, yes: false, "dry-run": false },
        { adapters: [cc], isTTY: () => false }
      ),
      /tty|--agent/i
    );
  });

  it("TTY path: prompts for agents and scope when not specified", async function () {
    const cc = makeStubAdapter("claude-code");
    let agentPromptCalled = 0;
    let scopePromptCalled = 0;
    const reports = await runInstallAgents(
      { force: false, yes: false, "dry-run": false },
      {
        adapters: [cc],
        isTTY: () => true,
        prompts: {
          pickAgents: async (avail) => {
            agentPromptCalled++;
            assert.deepEqual(
              avail.map((a) => a.id),
              ["claude-code"]
            );
            return ["claude-code"];
          },
          pickScope: async () => {
            scopePromptCalled++;
            return "global";
          },
        },
      }
    );
    assert.equal(agentPromptCalled, 1);
    assert.equal(scopePromptCalled, 1);
    assert.equal(cc.lastInstallOpts.scope, "global");
    assert.equal(reports[0].action, "installed");
  });

  it("filters out undetected adapters from the interactive picker", async function () {
    const cc = makeStubAdapter("claude-code", {
      detection: { present: true, onPath: true, configPaths: {} },
    });
    const other = makeStubAdapter("other", {
      detection: { present: false, onPath: false, configPaths: {} },
    });
    let offered;
    await runInstallAgents(
      { force: false, yes: false, "dry-run": false },
      {
        adapters: [cc, other],
        isTTY: () => true,
        prompts: {
          pickAgents: async (avail) => {
            offered = avail.map((a) => a.id);
            return ["claude-code"];
          },
          pickScope: async () => "project",
        },
      }
    );
    assert.deepEqual(offered, ["claude-code"]);
    assert.equal(cc.calls.install, 1);
    assert.equal(other.calls.install, 0);
  });

  it("'dry-run' summary surfaces in reports", async function () {
    const cc = makeStubAdapter("claude-code", {
      report: { adapterId: "claude-code", scope: "project", action: "dry-run" },
    });
    const reports = await runInstallAgents(
      { agent: ["claude-code"], scope: "project", force: false, yes: true, "dry-run": true },
      { adapters: [cc], isTTY: () => false }
    );
    assert.equal(reports[0].action, "dry-run");
    assert.equal(cc.lastInstallOpts.dryRun, true);
  });

  it("reports 'no detected agents' cleanly (no throw, empty reports)", async function () {
    const cc = makeStubAdapter("claude-code", {
      detection: { present: false, onPath: false, configPaths: {} },
    });
    const logged = [];
    const reports = await runInstallAgents(
      { force: false, yes: false, "dry-run": false },
      {
        adapters: [cc],
        isTTY: () => true,
        logger: (m) => logged.push(m),
        prompts: {
          pickAgents: async () => { throw new Error("should not prompt"); },
          pickScope: async () => { throw new Error("should not prompt"); },
        },
      }
    );
    assert.deepEqual(reports, []);
    assert.ok(
      logged.some((l) => /no.*(agent|detect)/i.test(l)),
      `expected a no-agents log; got: ${JSON.stringify(logged)}`
    );
  });
});

describe("install-agents end-to-end (compiled CLI, settings-file fallback)", function () {
  const cliPath = path.resolve("bin/doc-detective.js");
  let workDir;

  beforeEach(function () {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-e2e-"));
  });

  afterEach(function () {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  });

  function runCli(extraArgs) {
    return new Promise((resolve, reject) => {
      // Strip `claude` from PATH so the adapter falls into Path B.
      const sanitizedPath = (process.env.PATH || "")
        .split(path.delimiter)
        .filter((p) => !/[\\/](claude|AnthropicClaude)[\\/]?/i.test(p))
        .join(path.delimiter);

      const env = {
        ...process.env,
        PATH: sanitizedPath,
        // Redirect HOME so a missing claude binary writes into our temp dir
        // instead of the developer's real ~/.claude.
        HOME: workDir,
        USERPROFILE: workDir,
      };

      const child = childSpawn(process.execPath, [cliPath, "install-agents", ...extraArgs], {
        cwd: workDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c.toString()));
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.on("error", reject);
    });
  }

  it("writes ./.claude/settings.json under --scope project --yes", async function () {
    this.timeout(15000);
    const { code, stdout, stderr } = await runCli([
      "--agent", "claude-code",
      "--scope", "project",
      "--yes",
    ]);
    assert.equal(code, 0, `CLI exited with ${code}. stdout=${stdout}\nstderr=${stderr}`);
    const settingsPath = path.join(workDir, ".claude", "settings.json");
    assert.equal(fs.existsSync(settingsPath), true, `expected ${settingsPath} to exist`);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(parsed.enabledPlugins["doc-detective@doc-detective"], true);
    assert.ok(parsed.extraKnownMarketplaces["doc-detective"]);
  });

  it("--dry-run does not create settings.json", async function () {
    this.timeout(15000);
    const { code } = await runCli([
      "--agent", "claude-code",
      "--scope", "project",
      "--yes",
      "--dry-run",
    ]);
    assert.equal(code, 0);
    assert.equal(fs.existsSync(path.join(workDir, ".claude", "settings.json")), false);
  });
});

describe("prompts module", function () {
  let prompts;

  before(async function () {
    prompts = await import("../dist/agents/prompts.js");
  });

  it("exports pickAgents, pickScope, confirmForce, createPrompts", function () {
    assert.equal(typeof prompts.pickAgents, "function");
    assert.equal(typeof prompts.pickScope, "function");
    assert.equal(typeof prompts.confirmForce, "function");
    assert.equal(typeof prompts.createPrompts, "function");
  });

  it("createPrompts() returns an object with pickAgents/pickScope methods", function () {
    const p = prompts.createPrompts();
    assert.equal(typeof p.pickAgents, "function");
    assert.equal(typeof p.pickScope, "function");
  });
});



