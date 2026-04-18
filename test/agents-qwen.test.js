import assert from "node:assert/strict";
import path from "node:path";

describe("QwenCodeAdapter — identity", function () {
  let QwenCodeAdapter;
  before(async function () {
    ({ QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js"));
  });

  it("has expected id + displayName + scopes", function () {
    const a = new QwenCodeAdapter();
    assert.equal(a.id, "qwen");
    assert.equal(a.displayName, "Qwen Code");
    assert.deepEqual(a.supportsScopes(), ["global"]);
  });
});

describe("QwenCodeAdapter.detect()", function () {
  let QwenCodeAdapter;
  before(async function () {
    ({ QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js"));
  });

  function makeAdapter(overrides) {
    return new QwenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  it("reports onPath=true with version from `qwen --version`", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "qwen");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "0.14.5", stderr: "", exitCode: 0 };
      },
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, true);
    assert.equal(result.version, "0.14.5");
    assert.equal(result.present, true);
  });

  it("reports present=true via ~/.qwen when binary absent", async function () {
    const qwenHome = path.join("/home/test", ".qwen");
    const adapter = makeAdapter({
      run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      existsSync: (p) => p === qwenHome,
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, false);
    assert.equal(result.present, true);
  });

  it("reports present=false when nothing detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("no qwen"); },
      existsSync: () => false,
    });
    const result = await adapter.detect();
    assert.equal(result.present, false);
  });
});

describe("QwenCodeAdapter.getInstallState()", function () {
  let QwenCodeAdapter;
  before(async function () {
    ({ QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js"));
  });

  const CANON_SKILL = path.join(
    "/home/test", ".qwen", "extensions", "doc-detective", "skills", "doc-detective-init", "SKILL.md"
  );
  const SKILL_CONTENT = (v) =>
    `---\nname: doc-detective-init\ndescription: init\nmetadata:\n  version: '${v}'\n---\nbody\n`;

  function makeAdapter(overrides) {
    return new QwenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  it("reports not-installed when the canonical SKILL.md is absent", async function () {
    const adapter = makeAdapter({ existsSync: () => false });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("reads metadata.version from the canonical skill", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === CANON_SKILL,
      readFileSync: (p) => p === CANON_SKILL
        ? SKILL_CONTENT("1.3.0")
        : (() => { throw new Error("unexpected"); })(),
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.3.0");
  });

  it("marks upToDate=true when versions match", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === CANON_SKILL,
      readFileSync: () => SKILL_CONTENT("1.3.0"),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, true);
    assert.equal(state.latestVersion, "1.3.0");
  });

  it("marks upToDate=false when remote is newer", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === CANON_SKILL,
      readFileSync: () => SKILL_CONTENT("1.0.0"),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, false);
  });

  it("handles a skill with missing metadata.version gracefully", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === CANON_SKILL,
      readFileSync: () => "---\nname: doc-detective-init\n---\nbody\n",
    });
    const state = await adapter.getInstallState("global");
    // Present on disk but no parseable version.
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
  });
});

describe("QwenCodeAdapter.install()", function () {
  let QwenCodeAdapter;
  before(async function () {
    ({ QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js"));
  });

  const CANON_SKILL = path.join(
    "/home/test", ".qwen", "extensions", "doc-detective", "skills", "doc-detective-init", "SKILL.md"
  );
  const SKILL_CONTENT = (v) =>
    `---\nname: doc-detective-init\ndescription: init\nmetadata:\n  version: '${v}'\n---\nbody\n`;

  function makeSpyAdapter({ installed = false, version = "1.0.0", latest = undefined } = {}) {
    const calls = [];
    const deps = {
      run: async (cmd, args) => {
        calls.push([cmd, ...args]);
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      existsSync: (p) => installed && p === CANON_SKILL,
      readFileSync: () => installed
        ? SKILL_CONTENT(version)
        : (() => { throw new Error("not installed"); })(),
      homedir: () => "/home/test",
      fetchLatestVersion: async () => latest,
    };
    return { adapter: new QwenCodeAdapter(deps), calls };
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: "/work/proj",
    logger: () => {},
    ...over,
  });

  const mutating = (c) =>
    c[0] === "qwen" &&
    c[1] === "extensions" &&
    (c[2] === "install" || c[2] === "update");

  it("fresh install runs `extensions install <url> --auto-update --consent`", async function () {
    const { adapter, calls } = makeSpyAdapter({ installed: false });
    const report = await adapter.install(baseOpts());
    const installs = calls.filter(mutating);
    assert.deepEqual(installs, [
      [
        "qwen", "extensions", "install",
        "https://github.com/doc-detective/agent-tools:doc-detective",
        "--auto-update", "--consent",
      ],
    ]);
    assert.equal(report.action, "installed");
  });

  it("update path runs `extensions update doc-detective`", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "1.0.0", latest: "1.1.0",
    });
    const report = await adapter.install(baseOpts());
    const updates = calls.filter(mutating);
    assert.deepEqual(updates, [["qwen", "extensions", "update", "doc-detective"]]);
    assert.equal(report.action, "updated");
    assert.equal(report.installedVersion, "1.1.0");
  });

  it("returns already-up-to-date when installed version matches remote", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "2.0.0", latest: "2.0.0",
    });
    const report = await adapter.install(baseOpts());
    const muts = calls.filter(mutating);
    assert.deepEqual(muts, []);
    assert.equal(report.action, "already-up-to-date");
    assert.equal(report.installedVersion, "2.0.0");
  });

  it("--force triggers update even when current", async function () {
    const { adapter, calls } = makeSpyAdapter({
      installed: true, version: "2.0.0", latest: "2.0.0",
    });
    const report = await adapter.install(baseOpts({ force: true }));
    const muts = calls.filter(mutating);
    assert.ok(muts.length > 0);
    assert.equal(report.action, "forced");
  });

  it("--dry-run logs planned command and performs no spawns", async function () {
    const { adapter, calls } = makeSpyAdapter({ installed: false });
    const logged = [];
    const report = await adapter.install(baseOpts({ dryRun: true, logger: (m) => logged.push(m) }));
    const muts = calls.filter(mutating);
    assert.deepEqual(muts, []);
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /extensions install.*agent-tools/.test(l)),
      `expected a planned-command log; got: ${JSON.stringify(logged)}`
    );
  });

  it("--dry-run does not call fetchLatestVersion (stays offline-safe)", async function () {
    // Dry-run is a side-effect-free preview; the network probe shouldn't
    // run so offline / rate-limited environments can still preview.
    let fetchCalls = 0;
    const { QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js");
    const adapter = new QwenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => { fetchCalls++; return "1.3.0"; },
    });
    await adapter.install(baseOpts({ dryRun: true }));
    assert.equal(fetchCalls, 0, "dry-run must not call fetchLatestVersion");
  });
});
