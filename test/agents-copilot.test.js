import assert from "node:assert/strict";
import path from "node:path";

describe("CopilotCliAdapter — identity", function () {
  let CopilotCliAdapter;
  before(async function () {
    ({ CopilotCliAdapter } = await import("../dist/agents/adapters/copilot-cli.js"));
  });

  it("has expected id + displayName + scopes", function () {
    const a = new CopilotCliAdapter();
    assert.equal(a.id, "copilot-cli");
    assert.equal(a.displayName, "GitHub Copilot CLI");
    assert.deepEqual(a.supportsScopes(), ["global"]);
  });
});

describe("CopilotCliAdapter.detect()", function () {
  let CopilotCliAdapter;
  before(async function () {
    ({ CopilotCliAdapter } = await import("../dist/agents/adapters/copilot-cli.js"));
  });

  function makeAdapter(overrides) {
    return new CopilotCliAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  it("reports onPath=true and captures version from `copilot --version`", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "copilot");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "copilot version 0.4.1", stderr: "", exitCode: 0 };
      },
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, true);
    assert.equal(result.version, "copilot version 0.4.1");
    assert.equal(result.present, true);
  });

  it("reports present=true via ~/.copilot when binary absent", async function () {
    const copilotHome = path.join("/home/test", ".copilot");
    const adapter = makeAdapter({
      run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      existsSync: (p) => p === copilotHome,
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, false);
    assert.equal(result.present, true);
  });

  it("reports present=false when nothing detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("no copilot"); },
      existsSync: () => false,
    });
    const result = await adapter.detect();
    assert.equal(result.present, false);
  });
});

describe("CopilotCliAdapter.getInstallState()", function () {
  let CopilotCliAdapter;
  before(async function () {
    ({ CopilotCliAdapter } = await import("../dist/agents/adapters/copilot-cli.js"));
  });

  const PLUGIN_JSON_PATH = path.join(
    "/home/test", ".copilot", "installed-plugins", "doc-detective", "doc-detective", ".claude-plugin", "plugin.json"
  );

  function makeAdapter(overrides) {
    return new CopilotCliAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  it("reports not-installed when the plugin directory is absent", async function () {
    const adapter = makeAdapter({ existsSync: () => false });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("reports installed + version by reading the plugin.json manifest", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PLUGIN_JSON_PATH,
      readFileSync: (p) => {
        if (p === PLUGIN_JSON_PATH) return JSON.stringify({ name: "doc-detective", version: "1.3.0" });
        throw new Error("unexpected read");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.3.0");
  });

  it("marks upToDate=true when installed matches remote", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PLUGIN_JSON_PATH,
      readFileSync: () => JSON.stringify({ version: "1.3.0" }),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, true);
    assert.equal(state.latestVersion, "1.3.0");
  });

  it("marks upToDate=false when remote is newer", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PLUGIN_JSON_PATH,
      readFileSync: () => JSON.stringify({ version: "1.3.0" }),
      fetchLatestVersion: async () => "1.4.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, false);
  });
});

describe("CopilotCliAdapter.install()", function () {
  let CopilotCliAdapter;
  before(async function () {
    ({ CopilotCliAdapter } = await import("../dist/agents/adapters/copilot-cli.js"));
  });

  const PLUGIN_JSON_PATH = path.join(
    "/home/test", ".copilot", "installed-plugins", "doc-detective", "doc-detective", ".claude-plugin", "plugin.json"
  );

  function makeSpyAdapter({ installed = false, version = "1.0.0", latest = undefined } = {}) {
    const calls = [];
    const deps = {
      run: async (cmd, args) => {
        calls.push([cmd, ...args]);
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      existsSync: (p) => installed && p === PLUGIN_JSON_PATH,
      readFileSync: () => installed
        ? JSON.stringify({ version })
        : (() => { throw new Error("not installed"); })(),
      homedir: () => "/home/test",
      fetchLatestVersion: async () => latest,
    };
    return { adapter: new CopilotCliAdapter(deps), calls };
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: "/work/proj",
    logger: () => {},
    ...over,
  });

  it("fresh install runs `marketplace add` then `plugin install`", async function () {
    const { adapter, calls } = makeSpyAdapter({ installed: false });
    const report = await adapter.install(baseOpts());
    assert.deepEqual(calls, [
      ["copilot", "plugin", "marketplace", "add", "doc-detective/agent-tools"],
      ["copilot", "plugin", "install", "doc-detective@doc-detective"],
    ]);
    assert.equal(report.action, "installed");
    assert.equal(report.adapterId, "copilot-cli");
  });

  it("runs `plugin update` when installed but out-of-date", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "1.0.0", latest: "1.1.0",
    });
    const report = await adapter.install(baseOpts());
    // Copilot CLI has no documented `marketplace update` — just plugin update.
    assert.deepEqual(calls, [
      ["copilot", "plugin", "update", "doc-detective@doc-detective"],
    ]);
    assert.equal(report.action, "updated");
  });

  it("reports already-up-to-date with no commands when current", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "1.3.0", latest: "1.3.0",
    });
    const report = await adapter.install(baseOpts());
    assert.deepEqual(calls, []);
    assert.equal(report.action, "already-up-to-date");
    assert.equal(report.installedVersion, "1.3.0");
  });

  it("--force triggers update even when current", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "1.3.0", latest: "1.3.0",
    });
    const report = await adapter.install(baseOpts({ force: true }));
    assert.ok(calls.length > 0, "expected at least one mutating command");
    assert.equal(report.action, "forced");
  });

  it("--dry-run logs planned commands and performs no spawns", async function () {
    const { adapter, calls } = makeSpyAdapter({ installed: false });
    const logged = [];
    const report = await adapter.install(baseOpts({ dryRun: true, logger: (m) => logged.push(m) }));
    assert.deepEqual(calls, []);
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /plugin install doc-detective/.test(l)),
      `expected a planned-command log; got: ${JSON.stringify(logged)}`
    );
  });

  it("surfaces a friendly auth hint when `plugin install` fails with auth error", async function () {
    const deps = {
      run: async (cmd, args) => {
        if (args.includes("install")) {
          return { stdout: "", stderr: "error: please run `copilot login` to authenticate", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      existsSync: () => false,
      readFileSync: () => { throw new Error("not installed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
    };
    const adapter = new CopilotCliAdapter(deps);
    await assert.rejects(
      adapter.install(baseOpts()),
      /copilot login|authenticat/i
    );
  });
});
